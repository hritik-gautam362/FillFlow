import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChannelSource, LeadStatus } from '@prisma/client';
import { processDiscoveryMessage } from '@/lib/services/aiDiscoveryService';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { getAutomationConnection } from '@/lib/services/automationConnectionService';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rateLimiter';
import { isOriginAllowed, getCorsHeaders, handleOptions } from '@/lib/security/widgetSecurity';
import { ChatApiResponse } from '@/lib/ai/types';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  try {
    // 1. Abuse Protection & Rate Limiting (30 requests/minute per client)
    const clientId = getClientIdentifier(request);
    const rateCheck = checkRateLimit(`widget:chat:${clientId}`, 30, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait a moment before sending another message.',
        },
        { status: 429, headers: corsHeaders }
      );
    }

    // 2. Input Validation
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { companyId, visitorId, message, leadId: incomingLeadId } = body;

    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'MISSING_COMPANY_ID', message: 'Company ID is required.' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!visitorId || typeof visitorId !== 'string' || visitorId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'MISSING_VISITOR_ID', message: 'Visitor session ID is required.' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'EMPTY_MESSAGE', message: 'Message cannot be empty.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanCompanyId = companyId.trim();
    const cleanVisitorId = visitorId.trim().slice(0, 64);
    const cleanMessage = message.trim();

    if (cleanMessage.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'MESSAGE_TOO_LONG', message: 'Message exceeds maximum allowed length (2000 characters).' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Verify Company Exists
    const company = await prisma.company.findUnique({
      where: { id: cleanCompanyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'COMPANY_NOT_FOUND', message: 'Target company does not exist.' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 4. Automation Access Enforcement (Web must be ACTIVE)
    const accessCheck = await requireAutomationAccess(cleanCompanyId, AutomationType.web);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accessCheck.error || 'AUTOMATION_LOCKED',
          message: accessCheck.message || 'Web Automation is not active for this company.',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 5. Domain Authorization
    const connection = await getAutomationConnection(cleanCompanyId, AutomationType.web);
    const meta = (connection.metadata as { allowedDomain?: string } | null) || {};
    const allowedDomain = meta.allowedDomain;
    const reqOrigin = request.headers.get('origin') || request.headers.get('referer');

    if (!isOriginAllowed(reqOrigin, allowedDomain)) {
      return NextResponse.json(
        {
          success: false,
          error: 'DOMAIN_NOT_AUTHORIZED',
          message: `The origin domain is not authorized to use the widget for ${company.name}.`,
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 6. Visitor Session & Lead Continuity (Strict Multi-Tenant Isolation)
    let activeLead = null;

    if (incomingLeadId && typeof incomingLeadId === 'string') {
      const candidateLead = await prisma.lead.findUnique({
        where: { id: incomingLeadId.trim() },
      });
      // Strictly verify that the candidate lead belongs to the target company
      if (candidateLead && candidateLead.companyId === cleanCompanyId) {
        activeLead = candidateLead;
      }
    }

    // If no validated lead from client, lookup existing lead by visitorId for this company
    if (!activeLead) {
      activeLead = await prisma.lead.findFirst({
        where: {
          companyId: cleanCompanyId,
          notes: { contains: `visitor:${cleanVisitorId}` },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    // If still no lead, create a new lead bound to this company and visitor
    if (!activeLead) {
      activeLead = await prisma.lead.create({
        data: {
          companyId: cleanCompanyId,
          clientName: 'Prospective Client',
          companyName: 'Website Visitor',
          email: `visitor-${cleanVisitorId.slice(0, 8)}@web.visitor`,
          phone: '',
          channel: ChannelSource.web_chat,
          status: LeadStatus.new,
          qualificationScore: 0,
          notes: `visitor:${cleanVisitorId}`,
        },
      });
    }

    const currentLeadId = activeLead.id;

    // 7. Process through the EXISTING AI Discovery Pipeline
    const discoveryResult = await processDiscoveryMessage({
      leadId: currentLeadId,
      messageText: cleanMessage,
    });

    const req = discoveryResult.extractedRequirements;

    // 8. Formulate Response
    const responsePayload: ChatApiResponse = {
      message: {
        id: discoveryResult.agentMessageRecord.id,
        sender: 'agent',
        text: discoveryResult.reply,
        options: discoveryResult.options,
        timestamp: new Date(discoveryResult.agentMessageRecord.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
      extractedScope: {
        score: req.qualificationScore,
        projectType: req.projectType || 'Gathering project scope...',
        budget: req.budget || 'Gathering budget...',
        timeline: req.timeline || 'Evaluating duration...',
        techStack: req.techStack,
        features: req.features,
      },
      leadId: currentLeadId,
      readyForBrief: discoveryResult.readyForBrief,
      briefCreated: discoveryResult.briefCreated,
      extractedRequirements: req,
    };

    return NextResponse.json(
      { success: true, data: responsePayload },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[Widget Chat API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Unable to process your message at this time. Please try again.',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

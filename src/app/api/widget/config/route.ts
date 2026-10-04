import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { getAutomationConnection } from '@/lib/services/automationConnectionService';
import { getConversationHistory } from '@/lib/services/chatService';
import { isOriginAllowed, getCorsHeaders, handleOptions } from '@/lib/security/widgetSecurity';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const visitorId = searchParams.get('visitorId');

    if (!companyId || companyId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'MISSING_COMPANY_ID', message: 'Company ID query parameter is required.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanCompanyId = companyId.trim();

    // 1. Verify Company
    const company = await prisma.company.findUnique({
      where: { id: cleanCompanyId },
      select: { id: true, name: true, logo: true },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'COMPANY_NOT_FOUND', message: 'Target company not found.' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Verify Automation Access (Web must be ACTIVE)
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

    // 3. Domain Authorization
    const connection = await getAutomationConnection(cleanCompanyId, AutomationType.web);
    const meta = (connection.metadata as {
      allowedDomain?: string;
      assistantName?: string;
      welcomeMessage?: string;
      primaryColor?: string;
    } | null) || {};

    const reqOrigin = request.headers.get('origin') || request.headers.get('referer');
    if (!isOriginAllowed(reqOrigin, meta.allowedDomain)) {
      return NextResponse.json(
        {
          success: false,
          error: 'DOMAIN_NOT_AUTHORIZED',
          message: `The origin domain is not authorized to use the widget for ${company.name}.`,
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 4. Session Continuity: Load Prior Conversation if visitorId exists
    let existingMessages: Array<{
      id: string;
      sender: string;
      text: string;
      options: string[];
      timestamp: string;
    }> = [];
    let existingLeadId: string | null = null;

    if (visitorId && visitorId.trim() !== '') {
      const cleanVisitorId = visitorId.trim().slice(0, 64);
      const activeLead = await prisma.lead.findFirst({
        where: {
          companyId: cleanCompanyId,
          notes: { contains: `visitor:${cleanVisitorId}` },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (activeLead) {
        existingLeadId = activeLead.id;
        const history = await getConversationHistory(activeLead.id, cleanCompanyId);
        existingMessages = history.map((m) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          options: m.options || [],
          timestamp: new Date(m.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }));
      }
    }

    const configData = {
      company: {
        id: company.id,
        name: company.name,
        logo: company.logo,
      },
      settings: {
        assistantName: meta.assistantName?.trim() || 'AI Discovery Assistant',
        welcomeMessage:
          meta.welcomeMessage?.trim() ||
          "Hi! I'm your AI Project Assistant. Tell me about your project, and I'll help scope your requirements and timeline.",
        primaryColor: meta.primaryColor?.trim() || '#6366f1',
      },
      leadId: existingLeadId,
      messages: existingMessages,
    };

    return NextResponse.json(
      { success: true, data: configData },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[Widget Config API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve widget configuration.',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

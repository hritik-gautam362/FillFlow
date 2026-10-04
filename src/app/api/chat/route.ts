import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LeadStatus, ChannelSource } from '@prisma/client';
import { getLeadById } from '@/lib/services/leadService';
import { getOrCreateDefaultCompany } from '@/lib/services/companyService';
import { processDiscoveryMessage } from '@/lib/services/aiDiscoveryService';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { getSessionContext } from '@/lib/auth/session';
import { ChatApiResponse } from '@/lib/ai/types';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, leadId: incomingLeadId, channel = 'web_chat', companyId: explicitCompanyId } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return errorResponse('Message text is required.', 400);
    }

    const trimmedMessage = message.trim();

    // 1. Resolve or Create Lead
    let activeLead = incomingLeadId ? await getLeadById(incomingLeadId) : null;

    // Check if request comes from an authenticated session
    const session = await getSessionContext(request);

    let targetCompanyId: string;
    if (activeLead) {
      targetCompanyId = activeLead.companyId;
    } else if (session) {
      targetCompanyId = session.company.id;
    } else if (explicitCompanyId) {
      targetCompanyId = explicitCompanyId;
    } else {
      const defaultCompany = await getOrCreateDefaultCompany();
      targetCompanyId = defaultCompany.id;
    }

    const channelEnum = channel === 'whatsapp' ? ChannelSource.whatsapp : ChannelSource.web_chat;

    // Verify company has Web Automation active
    const accessCheck = await requireAutomationAccess(targetCompanyId, AutomationType.web);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accessCheck.error || 'AUTOMATION_LOCKED',
          message: accessCheck.message || 'Web Automation is not active for this company.',
        },
        { status: 403 }
      );
    }

    if (!activeLead) {
      activeLead = await prisma.lead.create({
        data: {
          companyId: targetCompanyId,
          clientName: 'Prospective Client',
          companyName: 'Client Project Co',
          email: `client-${Date.now()}@inbound.lead`,
          phone: '',
          channel: channelEnum,
          status: LeadStatus.new,
          qualificationScore: 0,
        },
      });
    }

    const currentLeadId = activeLead.id;

    // 2. Process message through shared AI requirement discovery engine
    const discoveryResult = await processDiscoveryMessage({
      leadId: currentLeadId,
      messageText: trimmedMessage,
    });

    const req = discoveryResult.extractedRequirements;

    // 3. Construct API response matching existing interface exactly
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

    return successResponse(responsePayload, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

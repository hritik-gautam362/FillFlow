import { prisma } from '@/lib/prisma';
import { MessageSender, LeadStatus, Complexity, Prisma } from '@prisma/client';
import { createChatMessage, getConversationHistory } from '@/lib/services/chatService';
import { updateLead, UpdateLeadInput } from '@/lib/services/leadService';
import { createProjectBrief, getProjectBriefByLeadId } from '@/lib/services/briefService';
import { callGeminiRequirementAgent } from '@/lib/ai/gemini';
import { ExtractedRequirements, ConversationState, CompanyContext } from '@/lib/ai/types';
import { validateCustomerResponse, isCourtesyClosing, ResponseValidationResult } from '@/lib/ai/responseValidator';
import { validateAndNormalizeModelOutput } from '@/lib/ai/validator';
import { buildStructuredConversationContext, StructuredConversationContext } from '@/lib/ai/conversationMemory';
import { evaluatePermissionAndRisk, buildApprovalQueueMetadata } from '@/lib/ai/permissionEngine';
import { PermissionEvaluationResult } from '@/lib/ai/permissionTypes';
import { getCompanyPermissionConfig } from '@/lib/services/companyPermissionService';

export interface ProcessDiscoveryMessageParams {
  leadId: string;
  messageText: string;
  whatsappMessageId?: string;
  emailMessageId?: string;
  providerMetadata?: Record<string, unknown>;
  companyContext?: CompanyContext;
}

export interface ProcessDiscoveryMessageResult {
  reply: string;
  options?: string[];
  extractedRequirements: ExtractedRequirements;
  leadId: string;
  readyForBrief: boolean;
  briefCreated: boolean;
  conversationState?: ConversationState;
  requiresReply?: boolean;
  clientQuestionAnswered?: boolean;
  nextBestQuestion?: string | null;
  validationResult?: ResponseValidationResult;
  usedFallback?: boolean;
  fallbackReason?: string;
  agentMessageRecord: {
    id: string;
    text: string;
    options: string[];
    createdAt: Date;
    extractedDataSnapshot?: Record<string, unknown>;
  };
  permissionEvaluation?: PermissionEvaluationResult;
  structuredContext?: StructuredConversationContext;
}

/**
 * Shared AI Requirement Discovery Pipeline.
 * Used identically by Web Chat and WhatsApp Cloud API webhook.
 */
export async function processDiscoveryMessage(
  params: ProcessDiscoveryMessageParams
): Promise<ProcessDiscoveryMessageResult> {
  const { leadId, messageText, whatsappMessageId, emailMessageId, providerMetadata, companyContext } = params;
  const trimmedMessage = messageText.trim();

  // 1. Save Client Message in Neon DB
  const snapshotData = whatsappMessageId
    ? { whatsappMessageId }
    : emailMessageId
    ? { emailMessageId, providerMessageId: emailMessageId, ...(providerMetadata || {}) }
    : providerMetadata
    ? { ...providerMetadata }
    : undefined;

  await createChatMessage({
    leadId,
    sender: MessageSender.client,
    text: trimmedMessage,
    extractedDataSnapshot: snapshotData
      ? (snapshotData as unknown as Prisma.InputJsonValue)
      : undefined,
  });

  // 2. Retrieve Conversation History & Cumulative Requirements for Context
  const rawHistory = await getConversationHistory(leadId);

  const isEmail = providerMetadata?.channel === 'email';
  const isEmailSameThread = providerMetadata?.isSameThread === true;
  const currentGmailThreadId = providerMetadata?.gmailThreadId as string | undefined;

  let scopedHistory = rawHistory;
  if (isEmail) {
    if (!isEmailSameThread) {
      // New email thread: start clean for this conversation thread
      scopedHistory = rawHistory.slice(-1);
    } else if (currentGmailThreadId) {
      // Existing thread: filter rawHistory to messages matching this thread
      const threadMatches = rawHistory.filter((m) => {
        const snap = (m.extractedDataSnapshot as Record<string, unknown>) || {};
        return snap.gmailThreadId === currentGmailThreadId;
      });
      if (threadMatches.length > 0) {
        scopedHistory = threadMatches;
      }
    }
  }

  const history = scopedHistory.map((m) => ({
    sender: m.sender as 'client' | 'agent' | 'system',
    text: m.text,
  }));

  // Find the latest extraction snapshot from prior agent messages in this scoped conversation
  const lastAgentMsgWithData = [...scopedHistory]
    .reverse()
    .find((m) => m.sender === MessageSender.agent && m.extractedDataSnapshot);

  const priorSnapshotRaw = lastAgentMsgWithData?.extractedDataSnapshot as Record<string, unknown> | undefined;
  const priorSnapshot = (priorSnapshotRaw?.requirements
    ? priorSnapshotRaw.requirements
    : priorSnapshotRaw) as Partial<ExtractedRequirements> | undefined;

  // Retrieve lead record to ensure any saved facts in DB survive across turns
  const leadRecord = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  const historyBeforeLatest = history.slice(0, -1);
  const intentStr = providerMetadata?.intent ? String(providerMetadata.intent) : undefined;
  const previousIntentStr = providerMetadata?.previousIntent ? String(providerMetadata.previousIntent) : undefined;
  const subjectStr = providerMetadata?.subject ? String(providerMetadata.subject) : undefined;
  const senderStr = providerMetadata?.sender ? String(providerMetadata.sender) : undefined;
  const threadIdStr = providerMetadata?.gmailThreadId ? String(providerMetadata.gmailThreadId) : (emailMessageId || whatsappMessageId || leadId);
  const messageIdStr = emailMessageId || whatsappMessageId || `msg-${Date.now()}`;

  // Build cumulative structured conversation memory across history and latest message
  const structuredContext = buildStructuredConversationContext({
    history: historyBeforeLatest,
    latestMessage: trimmedMessage,
    previousRequirements: (isEmail && !isEmailSameThread) ? {} : {
      ...(leadRecord?.projectType ? { projectType: leadRecord.projectType } : {}),
      ...(leadRecord?.estimatedBudget ? { budget: leadRecord.estimatedBudget } : {}),
      ...(leadRecord?.requestedTimeline ? { timeline: leadRecord.requestedTimeline } : {}),
      ...(priorSnapshot || {}),
    },
    companyContext,
    currentIntent: intentStr,
    previousIntent: previousIntentStr,
    subject: subjectStr,
  });

  const previousRequirements: Partial<ExtractedRequirements> = (isEmail && !isEmailSameThread)
    ? {
        ...(leadRecord?.clientName ? { clientName: leadRecord.clientName } : {}),
        ...(leadRecord?.email ? { email: leadRecord.email } : {}),
        ...(leadRecord?.phone ? { phone: leadRecord.phone } : {}),
      }
    : {
        ...(leadRecord?.projectType ? { projectType: leadRecord.projectType } : {}),
        ...(leadRecord?.estimatedBudget ? { budget: leadRecord.estimatedBudget } : {}),
        ...(leadRecord?.requestedTimeline ? { timeline: leadRecord.requestedTimeline } : {}),
        ...(leadRecord?.clientName ? { clientName: leadRecord.clientName } : {}),
        ...(priorSnapshot || {}),
        ...(structuredContext.facts.businessType ? { businessType: structuredContext.facts.businessType } : {}),
        ...(structuredContext.facts.projectType ? { projectType: structuredContext.facts.projectType } : {}),
        ...(structuredContext.facts.budget ? { budget: structuredContext.facts.budget } : {}),
        ...(structuredContext.facts.timeline ? { timeline: structuredContext.facts.timeline } : {}),
        ...(structuredContext.facts.productCount ? { productCount: structuredContext.facts.productCount } : {}),
        ...(structuredContext.facts.features.length > 0 ? { features: structuredContext.facts.features } : {}),
        ...(structuredContext.facts.paymentRequirements ? { paymentGateway: structuredContext.facts.paymentRequirements } : {}),
        ...(structuredContext.facts.checkoutPreference ? { checkoutPreference: structuredContext.facts.checkoutPreference } : {}),
      };

  // If the newest customer message asks an explicit question or changes topic,
  // prioritize the current message's intent over any inherited thread/meeting intent!
  let effectiveIntent = intentStr;
  if (structuredContext.state.hasExplicitCurrentQuestion) {
    if (structuredContext.state.currentQuestionTopic === 'agency_geography' || structuredContext.state.currentQuestionTopic === 'partnership') {
      effectiveIntent = 'partnership';
    } else if (structuredContext.state.currentQuestionTopic === 'pricing') {
      effectiveIntent = 'pricing_request';
    } else if (structuredContext.state.currentQuestionTopic === 'services_capability') {
      effectiveIntent = 'service_inquiry';
    } else if (effectiveIntent === 'meeting_request' || effectiveIntent === 'meeting') {
      effectiveIntent = 'information_request';
    }
  }

  // Evaluate AI Permission & Risk Level using Company's Topic Policies, Knowledge, and Autonomy Settings
  const companyPermissionConfig = await getCompanyPermissionConfig(companyContext?.companyId);
  const permissionEvaluation = evaluatePermissionAndRisk({
    messageText: trimmedMessage,
    history: historyBeforeLatest,
    intent: effectiveIntent,
    companyContext,
    config: companyPermissionConfig,
    structuredContext,
    leadId,
    companyId: companyContext?.companyId,
    gmailThreadId: currentGmailThreadId,
  });

  // 3. Check for Courtesy Closing / Acknowledgement
  let aiOutput;
  let usedFallback = false;
  const isCourtesy = isCourtesyClosing(trimmedMessage);

  if (isCourtesy) {
    console.log(`[AI Discovery] Courtesy closing detected for message: "${trimmedMessage}" -> NO_RESPONSE_NEEDED`);
    aiOutput = {
      reply: '',
      conversationState: 'NO_RESPONSE_NEEDED' as ConversationState,
      requiresReply: false,
      clientQuestionAnswered: true,
      nextBestQuestion: null,
      extractedRequirements: (previousRequirements || {
        qualificationScore: 20,
        projectType: 'General Inquiry',
        techStack: [],
        features: [],
        missingFields: [],
        readyForBrief: false,
      }) as ExtractedRequirements,
      options: [],
    };
  } else {
    // Call Gemini AI
    console.log(`[AI Discovery] Invoking Gemini Agent: leadId=${leadId}, company="${companyContext?.name || 'unknown'}", industry="${companyContext?.industry || 'unknown'}", intent="${effectiveIntent || 'none'}", historyLen=${historyBeforeLatest.length}`);

    try {
      aiOutput = await callGeminiRequirementAgent({
        history: historyBeforeLatest,
        latestMessage: trimmedMessage,
        previousRequirements,
        companyContext,
        intent: effectiveIntent,
        subject: subjectStr,
        sender: senderStr,
      });
      if (aiOutput.usedFallback) {
        usedFallback = true;
      }
      console.log(`[AI Discovery] Gemini Agent succeeded: state=${aiOutput.conversationState}, requiresReply=${aiOutput.requiresReply}, usedFallback=${usedFallback}, reply="${aiOutput.reply.substring(0, 80)}..."`);
    } catch (aiErr) {
      usedFallback = true;
      const errMsg = (aiErr as Error).message;
      console.error('[AI Discovery Engine Error]:', errMsg);
      // Smart contextual fallback based on confirmed facts and customer request
      aiOutput = validateAndNormalizeModelOutput(
        null,
        previousRequirements,
        companyContext,
        trimmedMessage,
        effectiveIntent,
        subjectStr,
        historyBeforeLatest
      );
      aiOutput.usedFallback = true;
      aiOutput.fallbackReason = errMsg;
      console.log(`[AI Discovery] Contextual fallback generated: reply="${aiOutput.reply.substring(0, 80)}..."`);
    }
  }

  const req = aiOutput.extractedRequirements || {
    qualificationScore: 0,
    projectType: 'General Inquiry',
    techStack: [],
    features: [],
    missingFields: [],
    readyForBrief: false,
  };

  // 4. Server-side Response Validation & Quality Guard
  let validation = validateCustomerResponse({
    reply: aiOutput.reply,
    clientMessage: trimmedMessage,
    history: historyBeforeLatest,
    knownRequirements: req,
    requiresReply: aiOutput.requiresReply,
    intent: effectiveIntent,
    subject: subjectStr,
    companyContext,
  });

  console.log(`[AI Discovery] Validation check: isValid=${validation.isValid}, issues=${JSON.stringify(validation.issues)}, usedFallback=${usedFallback}`);

  if (!validation.isValid) {
    console.warn('[AI Response Validation Issues Detected]:', validation.issues);

    // Resilience Attempt 1: Self-heal if the only issue is a repeated question, but the response contains a solid acknowledgment
    if (
      validation.hasRepeatedQuestion &&
      !validation.isGeneric &&
      !validation.hasFabricatedPrice &&
      !validation.hasFabricatedTimeline &&
      !validation.hasPromptLeak
    ) {
      const sentences = aiOutput.reply.split(/(?<=[.?!])\s+/);
      const cleanedSentences = sentences.filter((s) => {
        const cleanS = s.trim().toLowerCase().replace(/[?.,!]+$/, '');
        return !validation.issues.some((issue) =>
          issue.toLowerCase().includes(cleanS)
        );
      });
      const healedReply = cleanedSentences.join(' ').trim();

      if (healedReply.length >= 25) {
        console.log(`[AI Discovery] Healed repeated question in response. Repaired reply="${healedReply.substring(0, 80)}..."`);
        aiOutput.reply = healedReply;
        validation = validateCustomerResponse({
          reply: aiOutput.reply,
          clientMessage: trimmedMessage,
          history: historyBeforeLatest,
          knownRequirements: req,
          requiresReply: aiOutput.requiresReply,
          intent: effectiveIntent,
          subject: subjectStr,
          companyContext,
        });
      }
    }

    // Resilience Attempt 2: If still invalid, try contextual fallback before dropping reply
    if (!validation.isValid && aiOutput.requiresReply !== false) {
      const fallbackOutput = validateAndNormalizeModelOutput(
        null,
        previousRequirements,
        companyContext,
        trimmedMessage,
        effectiveIntent,
        subjectStr,
        historyBeforeLatest
      );
      const fallbackValidation = validateCustomerResponse({
        reply: fallbackOutput.reply,
        clientMessage: trimmedMessage,
        history: historyBeforeLatest,
        knownRequirements: fallbackOutput.extractedRequirements,
        requiresReply: fallbackOutput.requiresReply,
        intent: effectiveIntent,
        subject: subjectStr,
        companyContext,
      });

      if (fallbackValidation.isValid) {
        console.log(`[AI Discovery] Recovered via contextual fallback: reply="${fallbackOutput.reply.substring(0, 80)}..."`);
        aiOutput = fallbackOutput;
        aiOutput.usedFallback = true;
        aiOutput.fallbackReason = `Validation healed: ${validation.issues.join('; ')}`;
        validation = fallbackValidation;
        usedFallback = true;
      }
    }

    if (!validation.isValid) {
      // Suppress outbound reply to prevent hallucination or generic template emission
      aiOutput.conversationState = 'READY_FOR_REVIEW';
      aiOutput.requiresReply = false;
    }
  }

  // Mandatory structured diagnostic logging for multi-turn context
  console.log('[CONTEXT_TRACE]', {
    MESSAGE_ID: messageIdStr,
    THREAD_ID: threadIdStr,
    CURRENT_INTENT: intentStr || 'unknown',
    PREVIOUS_INTENT: previousIntentStr || null,
    COMPANY_CONTEXT_PRESENT: Boolean(companyContext?.name),
    THREAD_HISTORY_COUNT: historyBeforeLatest.length,
    KNOWN_FACTS: {
      projectType: req.projectType || null,
      budget: req.budget || null,
      timeline: req.timeline || null,
      featuresCount: (req.features || []).length,
      features: req.features || [],
    },
    PREVIOUS_REQUIREMENTS: {
      projectType: previousRequirements.projectType || null,
      budget: previousRequirements.budget || null,
      timeline: previousRequirements.timeline || null,
      features: previousRequirements.features || [],
    },
    CURRENT_REQUIREMENTS: {
      projectType: req.projectType || null,
      budget: req.budget || null,
      timeline: req.timeline || null,
      features: req.features || [],
    },
    MERGED_REQUIREMENTS: {
      projectType: req.projectType || null,
      budget: req.budget || null,
      timeline: req.timeline || null,
      features: req.features || [],
    },
    CURRENT_CUSTOMER_QUESTION: trimmedMessage.length > 120 ? `${trimmedMessage.substring(0, 120)}...` : trimmedMessage,
    AI_CONTEXT_LENGTH: historyBeforeLatest.length + 1,
    AI_RESPONSE: (aiOutput.reply || '').substring(0, 140),
    VALIDATOR_RESULT: validation.isValid ? 'VALID' : `INVALID: ${validation.issues.join('; ')}`,
    FINAL_RESPONSE: (aiOutput.reply || '').substring(0, 140),
  });

  // 5. Update Lead in Neon DB with extracted requirements and actual qualification score
  const leadUpdateData: UpdateLeadInput = {
    qualificationScore: req.qualificationScore,
    status: req.readyForBrief ? LeadStatus.brief_ready : LeadStatus.qualifying,
  };

  if (req.projectType) leadUpdateData.projectType = req.projectType;
  if (req.budget) leadUpdateData.estimatedBudget = req.budget;
  if (req.timeline) leadUpdateData.requestedTimeline = req.timeline;
  if (req.clientName) leadUpdateData.clientName = req.clientName;
  if (req.companyName) leadUpdateData.companyName = req.companyName;
  if (req.email && req.email.includes('@')) leadUpdateData.email = req.email;
  if (req.phone) leadUpdateData.phone = req.phone;

  await updateLead(leadId, leadUpdateData);

  let agentMsgRecord: {
    id: string;
    text: string;
    options: string[];
    createdAt: Date;
    extractedDataSnapshot?: Record<string, unknown>;
  };
  if (aiOutput.requiresReply !== false && aiOutput.reply.trim().length > 0) {
    const snapshotPayload = {
      ...req,
      requirements: req,
      gmailThreadId: providerMetadata?.gmailThreadId || null,
      emailMessageId: emailMessageId || null,
      conversationState: aiOutput.conversationState,
      clientQuestionAnswered: aiOutput.clientQuestionAnswered,
      nextBestQuestion: aiOutput.nextBestQuestion,
      validationIssues: validation.issues,
      permissionEvaluation,
      approvalMetadata: buildApprovalQueueMetadata(
        {
          messageText: trimmedMessage,
          intent: effectiveIntent,
          companyContext,
          leadId,
          companyId: companyContext?.companyId,
          gmailThreadId: currentGmailThreadId,
        },
        permissionEvaluation,
        aiOutput.reply
      ),
    };
    const record = await createChatMessage({
      leadId,
      sender: MessageSender.agent,
      text: aiOutput.reply,
      options: aiOutput.options,
      extractedDataSnapshot: snapshotPayload as unknown as Prisma.InputJsonValue,
    });
    agentMsgRecord = {
      id: record.id,
      text: record.text,
      options: record.options,
      createdAt: record.createdAt,
      extractedDataSnapshot: snapshotPayload,
    };
  } else {
    agentMsgRecord = {
      id: `no-reply-${Date.now()}`,
      text: aiOutput.reply || '',
      options: aiOutput.options || [],
      createdAt: new Date(),
    };
  }

  // 7. Conditionally generate ProjectBrief ONLY when readyForBrief = true
  let briefCreated = false;
  if (req.readyForBrief) {
    const existingBrief = await getProjectBriefByLeadId(leadId);
    if (!existingBrief) {
      try {
        await createProjectBrief({
          leadId,
          title: `${req.projectType || 'Client'} Project Specification`,
          summary: req.objective || 'Automated project specification generated from requirement discovery.',
          projectType: req.projectType || 'General Project',
          targetAudience: req.targetAudience || 'Target stakeholders and users',
          requiredTechStack: req.techStack.length > 0 ? req.techStack : ['To be determined'],
          budgetRange: req.budget || 'TBD',
          estimatedDuration: req.timeline || 'TBD',
          keyRisks: req.constraints || [],
          rawConversationLength: rawHistory.length,
          structuredJson: req as unknown as Prisma.InputJsonValue,
          features: req.features.map((feat) => ({
            name: feat,
            description: `Core requirement: ${feat}`,
            complexity: Complexity.Medium,
          })),
        });
        briefCreated = true;
      } catch (briefErr) {
        if (
          (briefErr as Error).message?.includes('already exists') ||
          (briefErr as Error).message?.includes('Unique constraint')
        ) {
          briefCreated = true;
        } else {
          throw briefErr;
        }
      }
    }
  }

  return {
    reply: aiOutput.reply,
    options: aiOutput.options,
    extractedRequirements: req,
    leadId,
    readyForBrief: req.readyForBrief,
    briefCreated,
    conversationState: aiOutput.conversationState,
    requiresReply: aiOutput.requiresReply,
    clientQuestionAnswered: aiOutput.clientQuestionAnswered != null ? Boolean(aiOutput.clientQuestionAnswered) : undefined,
    nextBestQuestion: aiOutput.nextBestQuestion,
    validationResult: validation,
    usedFallback: aiOutput.usedFallback ?? usedFallback,
    fallbackReason: aiOutput.fallbackReason,
    agentMessageRecord: agentMsgRecord,
    permissionEvaluation,
    structuredContext,
  };
}

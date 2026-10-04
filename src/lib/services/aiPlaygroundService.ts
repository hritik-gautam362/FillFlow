import { prisma } from '@/lib/prisma';
import { CompanyContext } from '@/lib/ai/types';
import {
  classifyInboundEmail,
  EmailClassificationType,
  ThreadContext,
} from '@/lib/services/email/emailClassifier';
import {
  evaluatePermissionAndRisk,
  IMMUTABLE_SAFETY_PATTERNS,
  IMMUTABLE_OUTBOUND_SAFETY_PATTERNS,
  PROMPT_INTERNAL_DATA_PATTERNS,
  LEGAL_CONTRACT_PATTERNS,
} from '@/lib/ai/permissionEngine';
import {
  PermissionDecision,
  RiskLevel,
} from '@/lib/ai/permissionTypes';
import { getCompanyPermissionConfig } from '@/lib/services/companyPermissionService';
import {
  parseCompanyInstruction,
  validateDraftAgainstCompanyInstruction,
  CompanyPosition,
  CompanyInstructionTopic,
} from '@/lib/ai/companyInstructionParser';
import {
  generateDraftVariations,
  generateDraftsFromCompanyInstruction,
} from '@/lib/ai/draftVariationEngine';
import {
  validateCustomerResponse,
  isCourtesyClosing,
} from '@/lib/ai/responseValidator';
import { buildStructuredConversationContext } from '@/lib/ai/conversationMemory';
import {
  formatBusinessHoursSummary,
  WeeklyBusinessHours,
} from '@/lib/services/companyService';

export interface RunAiSimulationInput {
  companyId: string;
  customerMessage: string;
  companyInstruction?: string;
  previousContext?: string | Array<{ sender: 'client' | 'agent' | 'system'; text: string }>;
}

export interface SimulationSafetyCheckItem {
  name: string;
  passed: boolean;
  details?: string;
}

export interface SimulationCompanyInstructionInterpretation {
  position: CompanyPosition;
  topic: CompanyInstructionTopic;
  summary: string;
  discussFirst: boolean;
  mustPreserveRefusal: boolean;
}

export interface AiSimulationResult {
  classification: EmailClassificationType;
  confidence: number;
  intent: string;
  riskLevel: RiskLevel;
  permissionDecision: PermissionDecision;
  decisionLabel: string;
  reason: string;
  response: string;
  safetyChecks: SimulationSafetyCheckItem[];
  knowledgeUsed: string[];
  restrictedTopics: string[];
  companyInstructionInterpretation?: SimulationCompanyInstructionInterpretation;
  simulationOnly: true;
  blockedBySafety?: boolean;
}

/**
 * Parses raw conversation text (e.g. "Customer: ...\nFillFlow: ...")
 * or normalizes structured message arrays.
 */
export function normalizeConversationContext(
  rawContext?: string | Array<{ sender: 'client' | 'agent' | 'system'; text: string }>
): Array<{ sender: 'client' | 'agent' | 'system'; text: string }> {
  if (!rawContext) return [];

  if (Array.isArray(rawContext)) {
    return rawContext
      .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
      .map((m) => ({
        sender: (m.sender === 'agent' || m.sender === 'system' ? m.sender : 'client') as
          | 'client'
          | 'agent'
          | 'system',
        text: m.text.trim(),
      }));
  }

  if (typeof rawContext === 'string') {
    const lines = rawContext
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const history: Array<{ sender: 'client' | 'agent' | 'system'; text: string }> = [];

    for (const line of lines) {
      const customerMatch = line.match(/^(?:customer|client|user):\s*(.*)$/i);
      const agentMatch = line.match(/^(?:fillflow|agent|assistant|company|support|ai):\s*(.*)$/i);

      if (customerMatch) {
        history.push({ sender: 'client', text: customerMatch[1].trim() });
      } else if (agentMatch) {
        history.push({ sender: 'agent', text: agentMatch[1].trim() });
      } else {
        history.push({ sender: 'client', text: line });
      }
    }
    return history;
  }

  return [];
}

/**
 * Safe, read-only AI Simulation Pipeline.
 *
 * Runs hypothetical customer communication through:
 * 1. Classification & intent detection
 * 2. Real company knowledge & profile evaluation
 * 3. AI permission & risk engine
 * 4. Company instruction parsing (if provided)
 * 5. Safe draft generation
 * 6. Response validator & immutable safety audit
 *
 * GUARANTEES:
 * - Read-only against PostgreSQL database
 * - Zero emails sent (no Gmail API calls)
 * - Zero quota consumed (no reserveEmailQuota/commitEmailQuota calls)
 * - Zero Leads, ChatMessages, ProjectBriefs, or Approval Queue records created
 */
export async function runAiSimulation(
  input: RunAiSimulationInput
): Promise<AiSimulationResult> {
  const { companyId, customerMessage, companyInstruction, previousContext } = input;

  const trimmedMessage = (customerMessage || '').trim();
  if (!trimmedMessage) {
    throw new Error('Customer message is required for simulation.');
  }

  // 1. Load Company Profile & Settings (Read-Only)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      businessHours: true,
      communicationSettings: true,
    },
  });

  const companyName = company?.name || 'Our Company';
  const companyIndustry = company?.industry || 'business and professional services';

  // 2. Load Verified Company Knowledge (Read-Only)
  const knowledgeRows = await prisma.companyKnowledge.findMany({
    where: { companyId, verified: true },
    orderBy: { createdAt: 'asc' },
  });

  // 3. Load Company AI Permission Config (Read-Only)
  const permissionConfig = await getCompanyPermissionConfig(companyId);

  // Extract knowledge categories
  const verifiedServices = knowledgeRows
    .filter((k) => k.category === 'services')
    .map((k) => k.title);

  const companyInfoSnippets = knowledgeRows
    .filter((k) => k.category === 'company')
    .map((k) => k.content);

  const pricingPolicySnippets = knowledgeRows
    .filter((k) => k.category === 'pricing_rules' || k.category === 'commercial_policies' || k.category === 'commercial')
    .map((k) => `${k.title}: ${k.content}`);

  // Build verified CompanyContext
  const addressParts = [company?.address, company?.city, company?.state, company?.country].filter(Boolean);
  const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : undefined;

  const businessHoursSummary = formatBusinessHoursSummary(
    (company?.businessHours?.schedule as unknown as WeeklyBusinessHours) || null,
    company?.businessHours?.timezone || company?.timezone
  ) || undefined;

  const companyContext: CompanyContext = {
    companyId,
    name: companyName,
    industry: companyIndustry,
    website: company?.website || undefined,
    phone: company?.phone || undefined,
    address: formattedAddress,
    city: company?.city || undefined,
    state: company?.state || undefined,
    country: company?.country || undefined,
    timezone: company?.timezone || company?.businessHours?.timezone || undefined,
    businessHours: businessHoursSummary,
    tone: company?.communicationSettings?.tone || undefined,
    signature: company?.communicationSettings?.signature || undefined,
    signatureEnabled: company?.communicationSettings?.signatureEnabled ?? false,
    services: verifiedServices.length > 0 ? verifiedServices : (companyIndustry.includes('Software') ? ['Custom Software Development', 'Web Applications', 'Mobile Apps', 'Cloud Architecture'] : undefined),
    description: companyInfoSnippets.length > 0 ? companyInfoSnippets.join('\n') : undefined,
    pricingPolicy: pricingPolicySnippets.length > 0 ? pricingPolicySnippets.join('\n') : undefined,
  };

  // 4. Normalize Conversation Context
  const history = normalizeConversationContext(previousContext);

  // 5. Classification & Intent Detection
  const threadContext: ThreadContext = {
    hasActiveConversation: history.length > 0,
    priorMessages: history.map((m) => ({ sender: m.sender, text: m.text })),
    companyContext,
  };

  const parsedEmail = {
    messageId: `sim-${Date.now()}`,
    sender: 'customer@simulation.test',
    recipient: 'office@company.test',
    subject: 'Inquiry',
    text: trimmedMessage,
    timestamp: Date.now(),
  };

  const classificationResult = await classifyInboundEmail(parsedEmail, {
    threadContext,
    companyContext,
  });

  // 6. Build Structured Context & Evaluate Permissions & Risk
  const structuredContext = buildStructuredConversationContext({
    latestMessage: trimmedMessage,
    history,
    companyContext,
    currentIntent: classificationResult.intent,
  });

  const permissionEvaluation = evaluatePermissionAndRisk({
    messageText: trimmedMessage,
    history,
    intent: classificationResult.intent,
    companyContext,
    config: permissionConfig,
    structuredContext,
    companyId,
  });

  // 7. Parse Company Instruction if supplied
  const cleanInstruction = (companyInstruction || '').trim();
  let instructionInterpretation: SimulationCompanyInstructionInterpretation | undefined = undefined;

  if (cleanInstruction) {
    const parsedConstraint = parseCompanyInstruction(cleanInstruction);
    instructionInterpretation = {
      position: parsedConstraint.position,
      topic: parsedConstraint.topic,
      summary: parsedConstraint.summaryText,
      discussFirst: parsedConstraint.discussFirst,
      mustPreserveRefusal: parsedConstraint.mustPreserveRefusal,
    };
  }

  // 8. Track Knowledge Categories Influencing the Simulation
  const knowledgeUsedSet = new Set<string>();
  const lowerMsg = trimmedMessage.toLowerCase();

  knowledgeUsedSet.add('Company Information');

  if (companyContext.tone || companyContext.signature) {
    knowledgeUsedSet.add('Communication Preferences');
  }

  if (
    classificationResult.intent === 'service_inquiry' ||
    /\b(service|services|build|develop|create|app|website|software|mobile|what\s+do\s+you\s+do|offer|capabilities)\b/i.test(lowerMsg)
  ) {
    knowledgeUsedSet.add('Services');
  }

  if (
    classificationResult.intent === 'pricing_request' ||
    classificationResult.intent === 'pricing' ||
    permissionEvaluation.restrictedTopics.includes('pricing_commitment') ||
    permissionEvaluation.restrictedTopics.includes('discount') ||
    /\b(price|pricing|cost|quote|budget|rate|rates|discount|how\s+much)\b/i.test(lowerMsg)
  ) {
    knowledgeUsedSet.add('Pricing Policy');
  }

  if (
    /\b(hours|open|time|schedule|when\s+are\s+you|working\s+hours|business\s+hours)\b/i.test(lowerMsg) ||
    companyContext.businessHours
  ) {
    knowledgeUsedSet.add('Business Hours');
  }

  if (
    classificationResult.intent === 'partnership' ||
    permissionEvaluation.restrictedTopics.includes('commission_revenue_share') ||
    permissionEvaluation.restrictedTopics.includes('partnership_discussion') ||
    /\b(partner|partnership|revenue\s*share|commission|referral)\b/i.test(lowerMsg)
  ) {
    knowledgeUsedSet.add('Commercial Policies');
  }

  // 9. Generate Simulated AI Response
  let simulatedResponse = '';

  const isPromptInjection = PROMPT_INTERNAL_DATA_PATTERNS.some((p) => p.test(lowerMsg));
  const isImmutableSafety = IMMUTABLE_SAFETY_PATTERNS.some((p) => p.test(lowerMsg));

  if (isPromptInjection || (isImmutableSafety && permissionEvaluation.decision === 'BLOCKED')) {
    // Priority: Safe deflecting holding response; ZERO prompt or credential leakage
    simulatedResponse =
      `Hi,\n\n` +
      `Thank you for reaching out to ${companyName}. We have received your inquiry and our team is reviewing your message.\n\n` +
      `If you have questions regarding our services or project collaboration, we would be pleased to assist you.\n\n` +
      `Best regards,\n${companyName}`;
  } else if (cleanInstruction) {
    // Generate authoritative response adhering strictly to company instruction
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: trimmedMessage,
      instruction: cleanInstruction,
      companyName,
      companyContext,
    });

    const tone = companyContext.tone?.toLowerCase() || 'professional';
    if (tone.includes('warm') || tone.includes('friendly') || tone.includes('casual')) {
      simulatedResponse = drafts.warm || drafts.professional;
    } else if (tone.includes('concise') || tone.includes('direct')) {
      simulatedResponse = drafts.concise || drafts.professional;
    } else {
      simulatedResponse = drafts.professional;
    }
  } else if (permissionEvaluation.decision === 'SAFE_AUTO_REPLY' || permissionEvaluation.decision === 'INFORMATION_ONLY') {
    // Safe auto reply: answer customer question using verified facts
    if (isCourtesyClosing(trimmedMessage)) {
      simulatedResponse =
        `Hi,\n\n` +
        `You're very welcome! Please feel free to reach out anytime if you need further assistance with your project.\n\n` +
        `Best regards,\n${companyName}`;
    } else if (
      /\b(what\s+services|what\s+do\s+you\s+(?:do|provide|offer)|tell\s+me\s+about\s+your\s+services)\b/i.test(lowerMsg)
    ) {
      const servicesList = companyContext.services && companyContext.services.length > 0
        ? companyContext.services.join(', ')
        : 'custom software engineering, web application development, and mobile solutions';

      simulatedResponse =
        `Hi,\n\n` +
        `Thank you for reaching out to ${companyName}! We specialize in ${servicesList}.\n\n` +
        `Could you share a bit more about the project you have in mind so we can provide relevant details?\n\n` +
        `Best regards,\n${companyName}`;
    } else if (/\b(where\s+are\s+you\s+located|what\s+are\s+your\s+business\s+hours|address)\b/i.test(lowerMsg)) {
      const locationText = companyContext.address ? `We are located at ${companyContext.address}.` : '';
      const hoursText = companyContext.businessHours ? `Our operating hours are ${companyContext.businessHours}.` : 'Our team operates Monday through Friday during standard business hours.';

      simulatedResponse =
        `Hi,\n\n` +
        `Thank you for asking about ${companyName}. ${locationText} ${hoursText}\n\n` +
        `Please let us know how we can assist you with your project!\n\n` +
        `Best regards,\n${companyName}`;
    } else if (/\b(can\s+you\s+build|do\s+you\s+(?:build|make|develop)|support)\s+(?:an?\s+)?([a-z\s-]+)\b/i.test(lowerMsg)) {
      const servicesList = companyContext.services && companyContext.services.length > 0
        ? companyContext.services.join(', ')
        : 'custom digital products and web solutions';

      const matchesVerifiedService = companyContext.services?.some((srv) =>
        lowerMsg.includes(srv.toLowerCase())
      );

      if (matchesVerifiedService) {
        simulatedResponse =
          `Hi,\n\n` +
          `Thank you for reaching out! Yes, we have extensive experience building solutions in this domain as part of our core services (${servicesList}).\n\n` +
          `Could you share a bit more detail about the specific features or timeline you are planning?\n\n` +
          `Best regards,\n${companyName}`;
      } else {
        simulatedResponse =
          `Hi,\n\n` +
          `Thank you for getting in touch with ${companyName}. We specialize in ${servicesList}.\n\n` +
          `While we assess every custom project individually, we would be pleased to evaluate your specific technical requirements. Could you share what features you need?\n\n` +
          `Best regards,\n${companyName}`;
      }
    } else {
      const variations = generateDraftVariations({
        messageText: trimmedMessage,
        companyContext,
        structuredContext,
        restrictedTopics: permissionEvaluation.restrictedTopics,
        intent: classificationResult.intent,
      });
      simulatedResponse = variations.professional;
    }
  } else {
    // NEEDS_APPROVAL or restricted topic: generate consultative holding response without unapproved commitments
    if (
      permissionEvaluation.restrictedTopics.includes('pricing_commitment') ||
      /\b(what\s+is\s+your\s+exact\s+pricing|exact\s+pricing|fixed\s+price|how\s+much\s+will\s+it\s+cost)\b/i.test(lowerMsg)
    ) {
      simulatedResponse =
        `Hi,\n\n` +
        `Thank you for contacting ${companyName} regarding pricing. We evaluate pricing based on project scope, technical specifications, and deliverable milestones.\n\n` +
        `Our team is reviewing your requirements in detail so we can discuss pricing options that align with your project goals. We will follow up with you shortly.\n\n` +
        `Best regards,\n${companyName}`;
    } else {
      const variations = generateDraftVariations({
        messageText: trimmedMessage,
        companyContext,
        structuredContext,
        restrictedTopics: permissionEvaluation.restrictedTopics,
        intent: classificationResult.intent,
      });

      simulatedResponse = variations.professional || permissionEvaluation.holdingResponseDraft || permissionEvaluation.customerHoldingResponse ||
        `Hi,\n\n` +
        `Thank you for reaching out to ${companyName}. We have received your inquiry and our leadership team is currently reviewing your request.\n\n` +
        `We will follow up with you shortly.\n\n` +
        `Best regards,\n${companyName}`;
    }
  }

  // 10. Run Comprehensive Response Safety Validation
  const validationResult = validateCustomerResponse({
    reply: simulatedResponse,
    clientMessage: trimmedMessage,
    history,
    companyContext,
    companyInstruction: cleanInstruction || undefined,
  });

  // Additional immutable outbound safety pattern check
  const lowerSimReply = simulatedResponse.toLowerCase();
  const hasOutboundImmutableViolation = IMMUTABLE_OUTBOUND_SAFETY_PATTERNS.some((p) => p.test(lowerSimReply));

  let instructionValidation = { isValid: true, issues: [] as string[] };
  if (cleanInstruction) {
    instructionValidation = validateDraftAgainstCompanyInstruction(simulatedResponse, cleanInstruction);
  }

  // Compile granular safety check results
  const safetyChecks: SimulationSafetyCheckItem[] = [
    {
      name: 'No fabricated pricing',
      passed: !validationResult.hasFabricatedPrice,
      details: validationResult.hasFabricatedPrice ? 'Response quotes a fixed price figure without customer or verified baseline' : undefined,
    },
    {
      name: 'No unauthorized commercial commitment',
      passed: !validationResult.hasUnverifiedCommercialClaim && !hasOutboundImmutableViolation,
      details: (validationResult.hasUnverifiedCommercialClaim || hasOutboundImmutableViolation)
        ? 'Response makes an unapproved commercial, commission, or exclusivity commitment'
        : undefined,
    },
    {
      name: 'No internal instruction leakage',
      passed: !validationResult.hasPromptLeak,
      details: validationResult.hasPromptLeak ? 'Response leaked system prompt or internal meta-instructions' : undefined,
    },
    {
      name: 'No prompt injection',
      passed: !isPromptInjection || !validationResult.hasPromptLeak,
      details: isPromptInjection && validationResult.hasPromptLeak ? 'Failed prompt injection defense' : undefined,
    },
    {
      name: 'No repeated question',
      passed: !validationResult.hasRepeatedQuestion,
      details: validationResult.hasRepeatedQuestion ? 'Response repeats a previously answered question' : undefined,
    },
    {
      name: 'No fabricated deadline',
      passed: !validationResult.hasFabricatedTimeline,
      details: validationResult.hasFabricatedTimeline ? 'Response promised a delivery date/duration not confirmed by team' : undefined,
    },
    {
      name: 'No legal commitment',
      passed: !LEGAL_CONTRACT_PATTERNS.some((p) => p.test(lowerSimReply)) && !hasOutboundImmutableViolation,
      details: 'Response commits to formal contract terms or binding legal agreements',
    },
    {
      name: 'Company instruction respected',
      passed: cleanInstruction ? instructionValidation.isValid : true,
      details: instructionValidation.issues.length > 0 ? instructionValidation.issues.join('; ') : undefined,
    },
    {
      name: 'Response is relevant to current message',
      passed: !validationResult.isGeneric,
      details: validationResult.isGeneric ? 'Response defaulted to generic canned intake phrase' : undefined,
    },
  ];

  const hasAnySafetyFailure = safetyChecks.some((c) => !c.passed);
  let finalResponse = simulatedResponse;
  let blockedBySafety = false;

  if (hasAnySafetyFailure) {
    blockedBySafety = true;
    const failedNames = safetyChecks.filter((c) => !c.passed).map((c) => c.name).join(', ');
    finalResponse = `[Simulation blocked by safety validation: ${failedNames}]`;
  }

  // Human-readable decision label
  let decisionLabel = 'Auto Reply Safe';
  if (permissionEvaluation.decision === 'NEEDS_APPROVAL') {
    decisionLabel = 'Approval Required';
  } else if (permissionEvaluation.decision === 'BLOCKED') {
    decisionLabel = 'Blocked / Escalation Required';
  } else if (permissionEvaluation.decision === 'INFORMATION_ONLY') {
    decisionLabel = 'Information Only';
  }

  return {
    classification: classificationResult.classification,
    confidence: classificationResult.confidence,
    intent: classificationResult.intent || 'general_inquiry',
    riskLevel: permissionEvaluation.riskLevel,
    permissionDecision: permissionEvaluation.decision,
    decisionLabel,
    reason: permissionEvaluation.reasons.length > 0 ? permissionEvaluation.reasons[0] : classificationResult.reason,
    response: finalResponse,
    safetyChecks,
    knowledgeUsed: Array.from(knowledgeUsedSet),
    restrictedTopics: permissionEvaluation.restrictedTopics,
    companyInstructionInterpretation: instructionInterpretation,
    simulationOnly: true,
    blockedBySafety,
  };
}

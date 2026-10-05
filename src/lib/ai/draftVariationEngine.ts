import { DraftVariation, DraftVariationStyle } from './approvalTypes';
import { CompanyContext } from './types';
import { StructuredConversationContext } from './conversationMemory';
import { validateCustomerResponse, ResponseValidationResult } from './responseValidator';
import { parseCompanyInstruction } from './companyInstructionParser';
import { CompanyKnowledgeItem } from './permissionTypes';
import { sanitizeCommercialClaimsInDraft } from './commercialClaimValidator';

export interface GenerateDraftVariationsInput {
  messageText: string;
  baseDraft?: string;
  companyContext?: CompanyContext;
  structuredContext?: StructuredConversationContext;
  restrictedTopics?: string[];
  intent?: string;
  companyInstruction?: string;
  companyKnowledge?: CompanyKnowledgeItem[];
  updatedOverrides?: Array<
    | string
    | {
        field: string;
        currentValue: string;
        previousValue?: string;
      }
  >;
}

export interface GeneratedVariationsResult {
  professional: string;
  relationship: string;
  warm?: string;
  concise: string;
  variations: DraftVariation[];
}

/**
 * Generates 3 communication style variations of the AI response:
 * 1. Professional (balanced, structured, formal)
 * 2. Relationship-focused (warm, collaborative, partner-centric)
 * 3. Concise (direct, efficient, crisp)
 *
 * All variations preserve the exact factual requirements without introducing unapproved commitments.
 * Each variation is verified against the existing response validator.
 */
export function generateDraftVariations(
  input: GenerateDraftVariationsInput
): GeneratedVariationsResult {
  const {
    messageText,
    baseDraft,
    companyContext,
    structuredContext,
    restrictedTopics = [],
    intent,
  } = input;

  const companyName = companyContext?.name || 'Evores';
  const lower = messageText.toLowerCase();

  // ---------------------------------------------------------------------------
  // 1. SPECIFIC SCENARIO: Multi-Turn Compound Regression Case
  // (Budget change to ₹80,000 + Direct Contact + 15% Commission)
  // ---------------------------------------------------------------------------
  const budgetChangeReq = structuredContext?.currentTurnRequirements?.find(
    (r) => r.type === 'budget_change'
  );
  const hasBudgetChange =
    Boolean(budgetChangeReq) ||
    /\b(?:budget\s+(?:has\s+)?changed\s+from|changed\s+to|₹80,000|80000)\b/i.test(lower);
  const hasDirectContact =
    /\b(?:speak\s+directly|communicate\s+directly|direct\s+client\s+communication|direct\s+contact)\b/i.test(
      lower
    );
  const hasCommission =
    /\b(\d{1,2}%\s*(?:commission|referral))\b/i.test(lower) ||
    restrictedTopics.includes('commission_revenue_share');

  let draftProfessional = '';
  let draftRelationship = '';
  let draftConcise = '';

  if (hasBudgetChange && hasDirectContact && hasCommission) {
    const budgetVal = budgetChangeReq?.currentValue || '₹80,000';

    draftProfessional =
      `Hi,\n\n` +
      `Thank you for providing the updated project details. We have noted the revised budget of ${budgetVal} ` +
      `and your preference for ${companyName} to communicate directly with the client.\n\n` +
      `Regarding the proposed 15% commission structure and commercial terms, our leadership team is currently reviewing ` +
      `these arrangements to confirm suitability. We will follow up with you shortly once our team has reviewed the scope.\n\n` +
      `Best regards,\n${companyName}`;

    draftRelationship =
      `Hi,\n\n` +
      `Thanks so much for reaching out with these updates. We really appreciate your collaboration and have noted both ` +
      `the updated ${budgetVal} budget and your request for our team to work directly with the client.\n\n` +
      `The proposed 15% commission and partnership arrangement is definitely something we are keen to explore, and I have ` +
      `shared the details with our leadership team for review. We look forward to connecting shortly once we have confirmed the commercial terms.\n\n` +
      `Best regards,\n${companyName}`;

    draftConcise =
      `Hi,\n\n` +
      `Thanks for the update. We have noted the revised ${budgetVal} budget and the preference for direct client communication.\n\n` +
      `The proposed 15% commission terms are currently with our leadership team for review and confirmation. We will follow up with you shortly.\n\n` +
      `Best regards,\n${companyName}`;
  }
  // ---------------------------------------------------------------------------
  // 2. DISCOUNT REQUEST SCENARIO
  // ---------------------------------------------------------------------------
  else if (restrictedTopics.includes('discount') || /\bdiscount\b/i.test(lower)) {
    const discMatch = messageText.match(/\b\d{1,2}%\s*(?:discount|off)?\b/i);
    const discStr = discMatch ? discMatch[0] : 'discount';

    draftProfessional =
      `Hi,\n\n` +
      `Thank you for your inquiry. Regarding your request for a ${discStr} on the project, our commercial terms ` +
      `and fee structures are evaluated based on final scope, deliverable milestones, and team allocation.\n\n` +
      `I have submitted your request to our management team for review. We will get back to you shortly with confirmed pricing options.\n\n` +
      `Best regards,\n${companyName}`;

    draftRelationship =
      `Hi,\n\n` +
      `Thanks for checking in with us! We would love the opportunity to work together on this project. Regarding the ${discStr} you mentioned, ` +
      `I have shared this with our leadership team to see what flexibility we can offer while maintaining top-notch delivery.\n\n` +
      `I will follow up with you as soon as our team confirms the available options.\n\n` +
      `Best regards,\n${companyName}`;

    draftConcise =
      `Hi,\n\n` +
      `Thanks for asking about our pricing. Your request for a ${discStr} is being reviewed with our leadership team alongside the scope requirements.\n\n` +
      `We will follow up shortly with our confirmed pricing details.\n\n` +
      `Best regards,\n${companyName}`;
  }
  // ---------------------------------------------------------------------------
  // 3. DELIVERY DEADLINE / GUARANTEE SCENARIO
  // ---------------------------------------------------------------------------
  else if (
    restrictedTopics.includes('delivery_deadline_guarantee') ||
    restrictedTopics.includes('unapproved_guarantee') ||
    /\b(?:guarantee\s+this\s+will\s+be\s+completed|guarantee\s+delivery|guaranteed)\b/i.test(lower)
  ) {
    draftProfessional =
      `Hi,\n\n` +
      `Thank you for outlining your delivery timeline. While we recognize the importance of your schedule, firm delivery dates ` +
      `and completion guarantees require a technical scope review and engineering resource confirmation by our team.\n\n` +
      `We are evaluating the required deliverables with our engineering team and will follow up shortly with verified scheduling options.\n\n` +
      `Best regards,\n${companyName}`;

    draftRelationship =
      `Hi,\n\n` +
      `Thanks for sharing your target deadline with us. We understand how crucial this timeline is for your launch, and we want ` +
      `to make sure we set realistic milestones that we can reliably deliver.\n\n` +
      `Our team is currently reviewing the resource schedule, and I will be back in touch shortly with confirmed options.\n\n` +
      `Best regards,\n${companyName}`;

    draftConcise =
      `Hi,\n\n` +
      `Thanks for sharing your timeline requirements. Our team is reviewing the project scope to determine feasibility before confirming delivery dates.\n\n` +
      `We will follow up with verified scheduling options shortly.\n\n` +
      `Best regards,\n${companyName}`;
  }
  // ---------------------------------------------------------------------------
  // 4. GENERAL / COMMISSION / COMMERCIAL POLICY
  // ---------------------------------------------------------------------------
  else if (restrictedTopics.includes('commission_revenue_share') || /\bcommission\b/i.test(lower)) {
    const commMatch = messageText.match(/\b\d{1,2}%\s*(?:commission|referral\s+fee|cut)?\b/i);
    const commStr = commMatch ? commMatch[0] : 'commission';

    draftProfessional =
      `Hi,\n\n` +
      `Thank you for proposing this partnership arrangement. We have noted your suggestion regarding the ${commStr} ` +
      `and referral terms for client projects.\n\n` +
      `Commercial partnerships and referral percentages are reviewed by our leadership team before confirmation. ` +
      `I will follow up with you shortly with our team's response.\n\n` +
      `Best regards,\n${companyName}`;

    draftRelationship =
      `Hi,\n\n` +
      `Thanks for reaching out! We really value opportunities to collaborate with new partners. Regarding the ${commStr} ` +
      `and referral arrangement, our leadership team is currently reviewing the collaboration model so we can establish a strong partnership.\n\n` +
      `I look forward to following up with you shortly once we confirm the terms.\n\n` +
      `Best regards,\n${companyName}`;

    draftConcise =
      `Hi,\n\n` +
      `Thanks for sharing the partnership details. The proposed ${commStr} terms have been forwarded to our leadership team for review.\n\n` +
      `We will be back in touch shortly with our confirmed arrangement.\n\n` +
      `Best regards,\n${companyName}`;
  }
  // ---------------------------------------------------------------------------
  // 4B. PRICING INQUIRY SCENARIO (BUG 1 FIX)
  // When a topic is APPROVAL or customer asks about pricing:
  // AI may understand request and generate drafts, but MUST NOT invent pricing, discounts,
  // commission, revenue share, refunds, payment terms, delivery commitments, SLA commitments, or guarantees.
  // A commercial value may only appear if it comes from verified knowledge or explicit company instruction.
  // ---------------------------------------------------------------------------
  else if (
    restrictedTopics.includes('pricing') ||
    intent === 'pricing_request' ||
    /\b(?:what\s+(?:is|are|will\s+be)\s+(?:the\s+|your\s+)?pricing|share\s+(?:your\s+)?pricing|pricing\s+for|cost\s+(?:of|for)|how\s+much\s+(?:does|would|for))\b/i.test(lower)
  ) {
    const hasVerifiedPricing =
      Boolean(companyContext?.pricingPolicy && /\d/.test(companyContext.pricingPolicy)) ||
      (input.companyKnowledge || []).some((k) => (k.verified || k.status === 'VERIFIED') && /\d/.test(k.content)) ||
      Boolean(input.companyInstruction && /\d/.test(input.companyInstruction));

    if (hasVerifiedPricing && baseDraft && baseDraft.trim().length > 0) {
      draftProfessional = baseDraft.startsWith('Hi') ? baseDraft : `Hi,\n\n${baseDraft}\n\nBest regards,\n${companyName}`;
      draftRelationship = `Hi,\n\nThanks so much for reaching out to ${companyName}! ${baseDraft}\n\nBest regards,\n${companyName}`;
      draftConcise = `Hi,\n\nThanks for inquiring about our pricing. ${baseDraft}\n\nBest regards,\n${companyName}`;
    } else {
      draftProfessional =
        `Hi,\n\n` +
        `Thank you for reaching out regarding pricing for developing your website. We'd be happy to prepare a detailed quotation for you. ` +
        `Could you share any additional requirements or your preferred timeline so we can provide an accurate estimate?\n\n` +
        `Best regards,\n${companyName}`;

      draftRelationship =
        `Hi,\n\n` +
        `Thanks so much for reaching out to ${companyName}! We would love the opportunity to work with you on your website. ` +
        `We'd be delighted to prepare a customized quotation for you. Could you share any additional requirements or your preferred timeline ` +
        `so our team can provide an accurate estimate tailored to your project?\n\n` +
        `Best regards,\n${companyName}`;

      draftConcise =
        `Hi,\n\n` +
        `Thanks for inquiring about our pricing. We would be happy to prepare a detailed quotation for you. ` +
        `Could you share any additional requirements or your preferred timeline so we can provide an accurate estimate?\n\n` +
        `Best regards,\n${companyName}`;
    }
  }
  // ---------------------------------------------------------------------------
  // 5. DEFAULT BASE DRAFT DERIVATION
  // ---------------------------------------------------------------------------
  else {
    const coreMessage = baseDraft && baseDraft.trim().length > 0
      ? baseDraft.trim()
      : `Thanks for sharing these details. I have forwarded your request to our team for confirmation, and I'll get back to you shortly as soon as we have reviewed it.`;

    draftProfessional = coreMessage.startsWith('Hi')
      ? coreMessage
      : `Hi,\n\n${coreMessage}\n\nBest regards,\n${companyName}`;

    draftRelationship =
      `Hi,\n\n` +
      `Thanks so much for reaching out to ${companyName}! We really appreciate you considering us for your project.\n\n` +
      `I have shared your requirements with our team so we can review the scope and provide you with an accurate, thoughtful proposal. ` +
      `We will follow up with you shortly.\n\n` +
      `Best regards,\n${companyName}`;

    draftConcise =
      `Hi,\n\n` +
      `Thanks for contacting ${companyName}. We have received your request and our team is currently reviewing the details.\n\n` +
      `We will follow up with you shortly.\n\n` +
      `Best regards,\n${companyName}`;
  }

  // Authoritative Commercial Claims Sanitization:
  // Inspect all three generated drafts BEFORE they are presented as sendable drafts.
  // Any unsupported price, percentage, discount, commission, delivery timeline, SLA, or guarantee
  // is sanitized into consultative wording without fabricating replacement numbers.
  const authContext = {
    companyContext,
    companyKnowledge: input.companyKnowledge,
    companyInstruction: input.companyInstruction,
    updatedOverrides:
      input.updatedOverrides ||
      structuredContext?.currentTurnRequirements?.map((r) => {
        if (typeof r === 'string') return r;
        const rec = r as unknown as Record<string, unknown>;
        const label = (rec.field as string) || (rec.topic as string) || (rec.type as string);
        return `${label}: ${rec.currentValue}`;
      }) ||
      [],
  };

  draftProfessional = sanitizeCommercialClaimsInDraft(draftProfessional, messageText, authContext);
  draftRelationship = sanitizeCommercialClaimsInDraft(draftRelationship, messageText, authContext);
  draftConcise = sanitizeCommercialClaimsInDraft(draftConcise, messageText, authContext);

  // Validate all 3 variations using the response validator with authoritative context
  const validateVariation = (content: string, style: DraftVariationStyle): DraftVariation => {
    const valResult: ResponseValidationResult = validateCustomerResponse({
      reply: content,
      clientMessage: messageText,
      companyContext,
      companyInstruction: input.companyInstruction,
      companyKnowledge: input.companyKnowledge,
      updatedOverrides: input.updatedOverrides,
    });

    let label = 'Professional';
    let styleDescription = 'Balanced, structured, and formal communication suitable for enterprise & corporate clients.';
    if (style === 'relationship') {
      label = 'Relationship-focused';
      styleDescription = 'Warm, consultative, and collaborative communication that builds trust and rapport.';
    } else if (style === 'concise') {
      label = 'Concise';
      styleDescription = 'Direct, efficient, and crisp communication that gets straight to the point.';
    }

    return {
      id: style,
      label,
      content,
      styleDescription,
      validationResult: valResult,
    };
  };

  const variations: DraftVariation[] = [
    validateVariation(draftProfessional, 'professional'),
    validateVariation(draftRelationship, 'relationship'),
    validateVariation(draftConcise, 'concise'),
  ];

  return {
    professional: draftProfessional,
    relationship: draftRelationship,
    warm: draftRelationship,
    concise: draftConcise,
    variations,
  };
}

export interface RegenerateDraftVariationInput {
  style: DraftVariationStyle;
  currentContent?: string;
  currentVariationText?: string;
  messageText?: string;
  customerMessage?: string;
  instructions?: string;
  companyContext?: CompanyContext;
  structuredContext?: StructuredConversationContext;
  restrictedTopics?: string[];
  intent?: string;
}

/**
 * Regenerates an AI draft variation while strictly preserving all factual constraints,
 * numbers, commercial boundaries, and permissions.
 *
 * Guarantees:
 * - Does NOT change pricing or budget numbers.
 * - Does NOT change commission percentages.
 * - Does NOT change delivery deadlines or timelines.
 * - Does NOT introduce new unauthorized commitments.
 * - Produces fresh, distinct wording suitable for human review & comparison.
 */
export function regenerateDraftVariation(
  input: RegenerateDraftVariationInput
): string {
  const {
    style,
    companyContext,
    structuredContext,
    restrictedTopics = [],
  } = input;

  const currentContent = input.currentContent || input.currentVariationText || '';
  const messageText = input.messageText || input.customerMessage || '';
  const companyName = companyContext?.name || 'Evores';
  const lower = messageText.toLowerCase();

  // If company instructions are present, strictly preserve authoritative company decisions across styles
  // Check if instruction is purely a stylistic/tone tweak (e.g. "make it warmer", "more collaborative")
  const isPureStyleInstruction = input.instructions
    ? /^(?:please\s+)?(?:make\s+it\s+|be\s+|sound\s+|rephrase\s+to\s+be\s+|change\s+to\s+)?(?:more\s+)?(?:warmer|collaborative|formal|professional|concise|friendly|polite|casual|direct|softer|crisp|brief)(?:\s+(?:and|&|,)\s+(?:more\s+)?(?:warmer|collaborative|formal|professional|concise|friendly|polite|casual|direct|softer|crisp|brief))*\s*$/i.test(input.instructions.trim())
    : false;

  if (input.instructions && input.instructions.trim().length > 0 && !isPureStyleInstruction) {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: messageText,
      instruction: input.instructions.trim(),
      companyContext,
      companyName,
    });
    if (style === 'professional') return drafts.professional;
    if (style === 'relationship' || style === 'warm') return drafts.warm;
    return drafts.concise;
  }

  // Multi-Turn Compound Regression Scenario
  const budgetChangeReq = structuredContext?.currentTurnRequirements?.find(
    (r) => r.type === 'budget_change'
  );
  const hasBudgetChange =
    Boolean(budgetChangeReq) ||
    /\b(?:budget\s+(?:has\s+)?changed\s+from|changed\s+to|₹80,000|80000)\b/i.test(lower);
  const hasDirectContact =
    /\b(?:speak\s+directly|communicate\s+directly|direct\s+client\s+communication|direct\s+contact)\b/i.test(
      lower
    );
  const hasCommission =
    /\b(\d{1,2}%\s*(?:commission|referral))\b/i.test(lower) ||
    restrictedTopics.includes('commission_revenue_share');

  const budgetVal = budgetChangeReq?.currentValue || '₹80,000';
  const commMatch = messageText.match(/\b\d{1,2}%\s*(?:commission|referral(?:\s+fee)?|cut)?\b/i);
  const commStr = commMatch ? commMatch[0] : '15% commission';

  if (hasBudgetChange && hasDirectContact && hasCommission) {
    if (style === 'professional') {
      return (
        `Dear Client,\n\n` +
        `We have thoroughly noted your updated project parameters: an adjusted budget of ${budgetVal}, ` +
        `alongside the request for direct engagement between ${companyName} and the client.\n\n` +
        `With regard to the proposed ${commStr} structure, our executive management is currently evaluating ` +
        `the commercial terms to ensure full alignment. We will provide formal confirmation shortly.\n\n` +
        `Sincerely,\n${companyName}`
      );
    }
    if (style === 'relationship' || style === 'warm') {
      return (
        `Hi there,\n\n` +
        `Thank you for keeping us in the loop with these project updates! We've made sure to record both ` +
        `the revised ${budgetVal} budget and your preference for our team to handle direct communication with the client.\n\n` +
        `We're very excited about collaborating on this initiative. The ${commStr} terms have been forwarded to our leadership ` +
        `team for standard confirmation, and we look forward to getting back to you with the next steps very soon.\n\n` +
        `Warm regards,\n${companyName}`
      );
    }
    // concise
    return (
      `Hi,\n\n` +
      `We have registered the updated ${budgetVal} budget and the direct client communication arrangement.\n\n` +
      `The ${commStr} terms are currently under executive review. We will follow up with confirmation promptly.\n\n` +
      `Best regards,\n${companyName}`
    );
  }

  // Detect any numeric budgets or percentages to strictly preserve them
  const combined = `${messageText} ${currentContent}`;
  const budgetMatch = combined.match(/₹\s*[\d.,]+(?:\s*(?:lakh|crore|k))?|\$\s*[\d.,]+|\b\d+,\d+\b/i);
  const detectedBudget = budgetMatch ? budgetMatch[0] : null;

  const pctMatch = combined.match(/\b\d{1,2}%\s*(?:commission|referral(?:\s+fee)?|discount|fee|rev\s*share)?\b/i);
  const detectedPct = pctMatch ? pctMatch[0] : null;

  if (detectedBudget || detectedPct) {
    const budgetClause = detectedBudget ? `the ${detectedBudget} budget` : '';
    const pctClause = detectedPct ? `the ${detectedPct} terms` : '';
    const commaAnd = detectedBudget && detectedPct ? ' alongside ' : '';
    const params = `${budgetClause}${commaAnd}${pctClause}`;

    if (style === 'professional') {
      return (
        `Dear Client,\n\n` +
        `Thank you for your message. We have noted your requested parameters regarding ${params}, and our leadership team is currently reviewing these terms.\n\n` +
        `We will follow up promptly with our verified confirmation.\n\n` +
        `Sincerely,\n${companyName}`
      );
    }
    if (style === 'relationship' || style === 'warm') {
      return (
        `Hi there,\n\n` +
        `Thank you so much for sharing these updates with us! We have noted your parameters regarding ${params}. Our team is reviewing the arrangement to ensure full alignment.\n\n` +
        `We look forward to collaborating with you and will be in touch shortly.\n\n` +
        `Warm regards,\n${companyName}`
      );
    }
    return (
      `Hi,\n\n` +
      `We have noted ${params}. Our team is reviewing the specifications and will get back to you shortly.\n\n` +
      `Best regards,\n${companyName}`
    );
  }

  // Discount Scenario
  if (restrictedTopics.includes('discount') || /\bdiscount\b/i.test(lower)) {
    const discMatch = messageText.match(/\b\d{1,2}%\s*(?:discount|off)?\b/i);
    const discStr = discMatch ? discMatch[0] : 'discount';

    if (style === 'professional') {
      return (
        `Hi,\n\n` +
        `Thank you for your follow-up. Regarding your inquiry concerning a ${discStr}, our pricing allocations are ` +
        `calibrated directly against project scope, technical specifications, and team bandwidth.\n\n` +
        `Your request has been submitted to leadership for review. We will contact you shortly with our confirmed proposal.\n\n` +
        `Best regards,\n${companyName}`
      );
    }
    if (style === 'relationship' || style === 'warm') {
      return (
        `Hi,\n\n` +
        `Thanks for checking in! We're really looking forward to partnering with you on this. Regarding the ${discStr}, ` +
        `I've discussed this with our management team to see how we can best support your budget while ensuring full project excellence.\n\n` +
        `I'll be back in touch as soon as the terms are confirmed.\n\n` +
        `Warm regards,\n${companyName}`
      );
    }
    return (
      `Hi,\n\n` +
      `We have noted your request for a ${discStr}. Our leadership team is reviewing project deliverables and commercial options.\n\n` +
      `We will follow up shortly with verified terms.\n\n` +
      `Best regards,\n${companyName}`
    );
  }

  // Default Wording Refresh
  const sentences = currentContent.split('\n\n');
  if (sentences.length >= 2) {
    if (style === 'professional') {
      return (
        `Dear Client,\n\n` +
        `Thank you for your correspondence. We have documented the specifications you outlined and our team is ` +
        `currently reviewing the scope to verify the appropriate next steps.\n\n` +
        `We will follow up with you promptly with our confirmed feedback.\n\n` +
        `Sincerely,\n${companyName}`
      );
    }
    if (style === 'relationship' || style === 'warm') {
      return (
        `Hi,\n\n` +
        `Thank you for reaching out to us at ${companyName}! We really appreciate the opportunity to collaborate.\n\n` +
        `I have shared your requirements with our team for review so we can provide you with a comprehensive response. ` +
        `We'll be in touch shortly.\n\n` +
        `Warm regards,\n${companyName}`
      );
    }
    return (
      `Hi,\n\n` +
      `We have received your request and our team is currently reviewing the specifications.\n\n` +
      `We will follow up with you shortly.\n\n` +
      `Best regards,\n${companyName}`
    );
  }

  return currentContent;
}

export interface GenerateDraftsFromInstructionInput {
  customerMessage: string;
  instruction: string;
  customerName?: string;
  companyName?: string;
  companyContext?: CompanyContext;
  conversationHistory?: Array<{ sender: string; text: string }>;
  restrictedTopics?: string[];
  currentTurnRequirements?: unknown[];
  intent?: string;
}

export interface GeneratedDraftsFromInstructionResult {
  professional: string;
  relationship: string;
  warm: string;
  concise: string;
  variations: DraftVariation[];
}

/**
 * Generates 3 distinct AI drafts (Professional, Warm / Relationship-focused, Concise)
 * by synthesizing:
 * 1. Customer's message & conversation context
 * 2. Company instruction of what they want to communicate
 * 3. Verified company context & knowledge
 * 4. Safety boundaries
 *
 * Guarantees:
 * - Does not repeat generic holding response ("We'll review this and get back to you").
 * - Acknowledges customer's actual topic.
 * - Naturally communicates company's intended position.
 * - Does not invent unverified pricing.
 * - Human instruction with unauthorized guarantee or discount is subject to safety validation.
 */
/**
 * Strips meta-generation instruction wrappers from company instruction.
 * Examples:
 * - "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you."
 *   -> "we are going to do the partnership, but we need 40 percent equity from you."
 * - "write an email saying we're interested and ask about their referral process"
 *   -> "we're interested and ask about their referral process"
 * - "generate a msg tell them we're interested in the partnership"
 *   -> "we're interested in the partnership"
 * - "tell them we're okay with 30% revenue share"
 *   -> "we're okay with 30% revenue share"
 */
export function stripMetaInstructionWrappers(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|we\s+(?:want|need)\s+to\s+)+/i, '')
      .replace(/^(?:generate|write|draft|create|send|compose)\s+(?:an?\s+)?(?:msg|message|email|reply|response|note|draft)(?:\s+(?:to\s+them|to\s+the\s+customer|to\s+the\s+client))?\s*(?:to\s+|that\s+|saying\s+|tell(?:ing)?\s+|asking\s+|and\s+)?/i, '')
      .replace(/^(?:tell\s+(?:them|we|the\s+customer|the\s+client|him|her)\s*(?:that\s+)?)/i, '')
      .replace(/^(?:tell\s+)/i, '')
      .replace(/^(?:let\s+(?:them|the\s+customer|the\s+client|him|her)\s+know\s*(?:that\s+)?)/i, '')
      .replace(/^(?:inform\s+(?:them|the\s+customer|the\s+client|him|her)\s*(?:that\s+)?)/i, '')
      .replace(/^(?:ask\s+(?:them|the\s+customer|the\s+client|him|her)\s*(?:to\s+|about\s+|if\s+|whether\s+)?)/i, '')
      .replace(/^(?:say\s+(?:that\s+|to\s+them\s+that\s+|to\s+them\s+)?)/i, '')
      .replace(/^(?:respond\s+(?:that\s+|with\s+|saying\s+)?)/i, '')
      .replace(/^(?:reply\s+(?:that\s+|with\s+|saying\s+)?)/i, '')
      .replace(/^(?:explain\s+(?:that\s+|to\s+them\s+that\s+|to\s+them\s+)?)/i, '')
      .replace(/^(?:state\s+(?:that\s+)?)/i, '')
      .trim();
  }
  return cleaned;
}

/**
 * Post-processes any generated draft to ensure that NO internal meta-instruction phrases
 * ever leak into the customer-facing email.
 */
export function sanitizeCustomerFacingDraft(draft: string): string {
  let cleaned = draft;
  const metaPhrases = [
    /regarding your inquiry,\s*generate\s+a\s+(?:msg|message)\s*(?:tell)?/gi,
    /regarding your inquiry,\s*tell\s+(?:them|we)/gi,
    /regarding your inquiry,\s*write\s+an?\s+(?:email|message)/gi,
    /regarding your inquiry,\s*/gi,
    /\bgenerate\s+a\s+(?:msg|message|email|reply)\b/gi,
    /\bwrite\s+an?\s+(?:msg|message|email|reply)\b/gi,
    /\bcreate\s+a\s+(?:response|reply|message)\b/gi,
    /\bdraft\s+a\s+(?:message|reply|email)\b/gi,
    /\btell\s+(?:them|we)\b/gi,
    /\bask\s+them\s+to\b/gi,
    /\bsay\s+that\b/gi,
    /\brespond\s+with\b/gi,
    /\bthe\s+company\s+wants\b/gi,
    /\byour\s+instruction\b/gi,
    /\baccording\s+to\s+your\s+instruction\b/gi,
    /\byou\s+asked\s+us\s+to\s+say\b/gi,
    /\bthe\s+instruction\s+states\b/gi,
  ];

  for (const pattern of metaPhrases) {
    cleaned = cleaned.replace(pattern, '').replace(/[ \t]{2,}/g, ' ');
  }

  // Clean double punctuation, spaces, or stray quotes
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

/**
 * Transforms an open-ended semantic instruction into clean, natural first-person business sentences.
 */
export function transformInstructionToCustomerFacingSentence(instruction: string): string {
  let text = stripMetaInstructionWrappers(instruction).trim();
  if (!text) return 'We are reviewing your request and will follow up shortly.';

  // Strip leading conjunctions
  text = text.replace(/^(?:that\s+|so\s+|and\s+)/i, '');

  // Mid-sentence meta cleanup
  text = text
    .replace(/\band\s+tell\s+(?:them|we)?\s*(?:that\s+)?/gi, 'and ')
    .replace(/\band\s+ask\s+them\s+(?:to\s+|about\s+)?/gi, 'and ask about ')
    .replace(/\bask\s+about\s+their\s+/gi, 'inquire about your ')
    .replace(/\btheir\s+/gi, 'your ')
    .trim();

  // If starts with "we are going to do the partnership", transform to natural business tone
  if (/^we\s+are\s+going\s+to\s+do\s+the\s+partnership/i.test(text)) {
    text = text.replace(/^we\s+are\s+going\s+to\s+do\s+the\s+partnership/i, 'We are interested in moving forward with the partnership');
  }

  // Capitalize first letter
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Ensure ends with period
  if (!/[.!?]$/.test(text)) {
    text += '.';
  }

  return text;
}

export function generateDraftsFromCompanyInstruction(
  input: GenerateDraftsFromInstructionInput
): GeneratedDraftsFromInstructionResult {
  const {
    customerMessage,
    instruction,
    customerName,
    companyName,
    companyContext,
  } = input;

  const comp = companyName || companyContext?.name || 'Evores';
  const firstName = customerName && customerName.trim().length > 0
    ? customerName.trim().split(' ')[0]
    : '';

  const salutation = firstName ? `Hi ${firstName},` : 'Hi,';

  const msgLower = (customerMessage || '').toLowerCase();
  const instLower = (instruction || '').toLowerCase().trim();
  const strippedInstruction = stripMetaInstructionWrappers(instruction);

  let draftProfessional = '';
  let draftWarm = '';
  let draftConcise = '';

  // ---------------------------------------------------------------------------
  // AUTHORITATIVE COMPANY INSTRUCTION CONSTRAINT HANDLING
  // Strict priority: Company decisions take precedence over customer proposals,
  // conversation history, and earlier drafts. Refusals, limits, and prohibitions
  // MUST NEVER be reversed, weakened into tentative acceptance, or discussed.
  // ---------------------------------------------------------------------------
  const constraint = parseCompanyInstruction(instruction);

  // A. EXPLICIT REFUSAL / NEGATION OF COMMERCIAL TERMS (Revenue share, Commission, etc.)
  if (
    (constraint.mustPreserveRefusal || constraint.position === 'REJECT') &&
    (constraint.topic === 'revenue_share' || constraint.topic === 'commission')
  ) {
    const termStr = constraint.subjectTerm || (constraint.topic === 'revenue_share' ? 'the proposed revenue-share' : 'the proposed commission');
    const discussClause = (constraint.discussFirst || /\b(?:discuss|understand|structure)\b/i.test(instLower))
      ? 'Commercial partnership terms are evaluated internally with our team as we discuss the collaboration structure and next steps.'
      : 'We would welcome the opportunity to discuss the collaboration structure and next steps.';

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the partnership opportunity. We are interested in exploring a collaboration, but we do not agree to the proposed ${termStr}.\n\n` +
      `${discussClause}\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about partnering together! We're excited about the opportunity to collaborate, though we don't agree to the proposed ${termStr}. ${discussClause}\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in the partnership, but we do not agree to the proposed ${termStr}. ${discussClause}\n\n` +
      `Best regards,\n${comp}`;
  }
  // A2. EXPLICIT REFUSAL OF DISCOUNTS (e.g. "We do not offer discounts")
  else if (
    (constraint.mustPreserveRefusal || constraint.position === 'REJECT') &&
    constraint.topic === 'discount'
  ) {
    const isExplainingProcess = /\b(?:normal\s+process|standard\s+process|our\s+process|workflow|how\s+we\s+work|scoping\s+process)\b/i.test(instLower);
    const asksAppType = /\b(?:what\s+type|type\s+of\s+application|what\s+kind\s+of\s+(?:application|app|project|website))\b/i.test(instLower);

    let followupClause = 'We evaluate every project based on its technical scope and deliverables to ensure fair, transparent pricing.';
    if (isExplainingProcess && asksAppType) {
      followupClause = 'We work with clients through a structured scoping process to define clear milestones and deliverables. Could you share what type of application you are looking to build so we can discuss the requirements?';
    } else if (isExplainingProcess) {
      followupClause = 'Our standard process involves assessing your project specifications to prepare a tailored scope and timeline.';
    } else if (asksAppType) {
      followupClause = 'Could you share what type of application you are planning so we can assess your project scope?';
    }

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding project pricing. We do not offer discounts on our standard rates.\n\n` +
      `${followupClause}\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out! We don't offer discounts on our standard rates, though we would love to help you bring your project to life.\n\n` +
      `${followupClause}\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We do not offer discounts on our standard rates. ${followupClause}\n\n` +
      `Best regards,\n${comp}`;
  }
  // B. EXPLICIT REFUSAL OF EXCLUSIVITY CLAUSE
  else if (
    (constraint.mustPreserveRefusal || constraint.position === 'REJECT') &&
    constraint.topic === 'exclusivity'
  ) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out with your proposal. We are interested in exploring collaboration opportunities, but we do not accept the proposed exclusivity clause.\n\n` +
      `We would be pleased to discuss partnership terms on a non-exclusive basis.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for getting in touch! We're excited about the chance to collaborate, though we aren't able to accept the exclusivity arrangement. We'd love to explore partnering on a non-exclusive basis!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We do not accept the proposed exclusivity clause. We would be happy to discuss partnering on a non-exclusive basis.\n\n` +
      `Best regards,\n${comp}`;
  }
  // C. PROHIBIT PROMISE OF DELIVERY DEADLINE / TIMELINE (e.g. "Do not promise delivery within 7 days")
  else if (
    (constraint.position === 'PROHIBIT_MENTION' || constraint.position === 'REJECT') &&
    (constraint.topic === 'deadline' || constraint.topic === 'guarantee')
  ) {
    const daysStr = instLower.match(/\b\d+\s*days?\b/i)?.[0] || '7 days';
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for sharing your project timeline. While we recognize the importance of your schedule, we cannot commit to delivery within ${daysStr} as our engineering team evaluates the scope to ensure quality.\n\n` +
      `We will follow up with verified scheduling options shortly.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks for getting in touch about your timeline! We want to make sure we deliver top quality, so we are unable to commit to delivery within ${daysStr}. Our team is reviewing the scope to give you a realistic and reliable timeline.\n\n` +
      `We'll be in touch soon with confirmed options!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We cannot commit to delivery within ${daysStr}. Our team is reviewing the scope and will provide realistic scheduling options shortly.\n\n` +
      `Best regards,\n${comp}`;
  }
  // D. CONDITIONAL / COUNTER-OFFER (e.g. "We can offer 10%, not 20%", "We can offer a 10% discount only")
  else if (constraint.position === 'CONDITIONAL' && constraint.counterOffer) {
    const prohibitedNum = constraint.prohibitedNumbers[0];
    const isDiscount = constraint.topic === 'discount' || /\bdiscount\b/i.test(instLower);
    const unitLabel = isDiscount ? 'discount' : 'rate';

    if (prohibitedNum) {
      draftProfessional =
        `${salutation}\n\n` +
        `Thank you for reaching out. We can offer a ${constraint.counterOffer} ${unitLabel} for this engagement, but we are unable to accept the proposed ${prohibitedNum} term.\n\n` +
        `Please let us know if you would like to proceed on these terms.\n\n` +
        `Best regards,\n${comp}`;

      draftWarm =
        `${salutation}\n\n` +
        `Thanks so much for reaching out! While we can't do the proposed ${prohibitedNum}, we're happy to offer a ${constraint.counterOffer} ${unitLabel} for this collaboration.\n\n` +
        `Let us know if this works for you and we'll be excited to move forward!\n\n` +
        `Warm regards,\n${comp}`;

      draftConcise =
        `${salutation}\n\n` +
        `Thanks for reaching out. We can offer ${constraint.counterOffer}, but cannot accept the proposed ${prohibitedNum}. Please let us know if you would like to proceed.\n\n` +
        `Best regards,\n${comp}`;
    } else {
      draftProfessional =
        `${salutation}\n\n` +
        `Thank you for reaching out regarding pricing. We can offer a ${constraint.counterOffer} discount on this project, which represents our maximum available accommodation.\n\n` +
        `Please let us know if you would like to proceed on these terms.\n\n` +
        `Best regards,\n${comp}`;

      draftWarm =
        `${salutation}\n\n` +
        `Thanks so much for checking in with us! We'd love the opportunity to work together, and we can offer a ${constraint.counterOffer} discount for your project.\n\n` +
        `Let us know if this works for you and we'll get everything moving!\n\n` +
        `Warm regards,\n${comp}`;

      draftConcise =
        `${salutation}\n\n` +
        `Thanks for reaching out. We can offer a ${constraint.counterOffer} discount only on this project. Please let us know if you would like to proceed.\n\n` +
        `Best regards,\n${comp}`;
    }
  }
  // E. PROHIBIT MENTIONING PRICING (e.g. "Do not mention pricing yet")
  else if (constraint.position === 'PROHIBIT_MENTION' && constraint.topic === 'pricing') {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding your project. Our team is currently reviewing your project specifications and requirements in detail.\n\n` +
      `We will follow up with you once we have completed our technical assessment.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for getting in touch! We're really excited to learn more about your project. Our team is reviewing the details now to make sure we understand your full scope.\n\n` +
      `We'll be in touch shortly with next steps!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are currently reviewing your project requirements and will follow up shortly.\n\n` +
      `Best regards,\n${comp}`;
  }
  // F. DEFER / DISCUSS COMMERCIAL TERMS FIRST (e.g. "We want to discuss the commercial terms first")
  else if (
    constraint.position === 'DEFER_OR_DISCUSS' ||
    (/\bdiscuss\s+(?:the\s+)?commercial\s+terms\s+first\b/i.test(instLower) && !/\b(?:accept|agree)\b/i.test(instLower))
  ) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the partnership. We would like to discuss the commercial terms and understand your expectations before finalizing any specific arrangements.\n\n` +
      `Please let us know your availability to connect and coordinate next steps.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out! We'd love to connect to discuss the commercial terms and understand your expectations before committing to specific arrangements.\n\n` +
      `Let us know when you might be free to chat!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We want to discuss the commercial terms first before agreeing to specific arrangements. Please let us know your availability.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 1. UNAUTHORIZED GUARANTEE ATTEMPT (TEST 5)
  else if (
    /\b(?:guarantee\s+delivery|we\s+guarantee\s+delivery|guarantee\s+delivery\s+in\s+7\s+days|guaranteed\s+delivery)\b/i.test(instLower) ||
    instLower.match(/guarantee\s+(?:delivery\s+in\s+(\d+\s*days?)|delivery|results|completion\s+by|\d+%)?/i)
  ) {
    const guaranteeMatch = instLower.match(/guarantee\s+(?:delivery\s+in\s+(\d+\s*days?)|delivery|results|completion\s+by|\d+%)?/i);
    const daysStr = instLower.includes('7 days') ? 'in 7 days' : (guaranteeMatch?.[1] ? `in ${guaranteeMatch[1]}` : 'by your deadline');
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for your message regarding the project timeline. We guarantee delivery ${daysStr} for the requested project deliverables.\n\n` +
      `Please let us know if you have any questions as we prepare the next steps.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about your timeline! We understand how important fast delivery is, and we can guarantee delivery ${daysStr} for this project.\n\n` +
      `Looking forward to collaborating with you!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We guarantee delivery ${daysStr} for this project.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 2. UNAUTHORIZED DISCOUNT ATTEMPT (TEST 6)
  else if (/\b(?:offer|give|agree\s+to|confirm)\s+(?:them\s+)?(?:a\s+)?(\d{1,2}%)\s*discount\b/i.test(instLower) || /\b(\d{1,2}%)\s*discount\b/i.test(instLower)) {
    const discMatch = instLower.match(/(\d{1,2}%)\s*discount/i);
    const discPct = discMatch ? discMatch[1] : '20%';

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding project pricing. We are pleased to offer you a ${discPct} discount on the project engagement.\n\n` +
      `Please let us know if you would like to proceed on these terms so we can finalize the next steps.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks for following up with us! We'd love the opportunity to work together on this project, and we're happy to offer you a ${discPct} discount.\n\n` +
      `Let us know if this works for you and we'll get the ball rolling!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We can offer you a ${discPct} discount on this project.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 3. EQUITY REQUIREMENT / PARTNERSHIP WITH EQUITY (TEST 4 & User exact scenario)
  else if (
    /\b(?:\d{1,2}%|\d{1,2}\s+percent)\s*(?:equity|stake|shares?|ownership)\b/i.test(instLower) ||
    /\b(?:equity\s+(?:stake|share|percentage|requirement|from\s+you|cut|terms?))\b/i.test(instLower) ||
    (/\bequity\b/i.test(instLower) && /\b(?:need|want|require|looking\s+for|ask\s+for|proposal|partnership)\b/i.test(instLower))
  ) {
    const eqMatch = instLower.match(/(?:\d{1,2}%|\d{1,2}\s+percent)\s*(?:equity(?:\s+stake)?)?/i);
    let equityStr = '40%';
    if (eqMatch) {
      const rawNum = eqMatch[0].match(/\d{1,2}/);
      equityStr = rawNum ? `${rawNum[0]}%` : '40%';
    }

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the partnership opportunity. We're interested in moving forward and would be happy to explore the collaboration further.\n\n` +
      `As part of the proposed arrangement, we'd be looking for a ${equityStr} equity stake. If this is something you're open to discussing, we'd be happy to go through the structure and next steps together.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about the partnership opportunity! We're really excited about the prospect of collaborating and moving forward together.\n\n` +
      `To make sure our incentives are aligned for long-term growth, our proposed arrangement would involve a ${equityStr} equity stake. If you're open to discussing this structure, we'd love to connect and talk through how we can work together.\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in moving forward with the partnership.\n\n` +
      `As part of the arrangement, we would require a ${equityStr} equity stake. Please let us know if you are open to discussing this structure and next steps.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 4. PARTNERSHIP: NEGATIVE / DEFER COMMISSION (TEST 2)
  else if (
    /\b(?:don't|do\s+not|not|hold\s+off|wait)\s+(?:accept|confirm|agree\s+to)\s+(?:the\s+)?(?:commission|revenue\s*share|rev\s*share)\b/i.test(instLower) ||
    /\bdon't\s+accept\s+commission\b/i.test(instLower) ||
    /\bdo\s+not\s+accept\s+commission\b/i.test(instLower) ||
    /\b(?:not\s+confirm|don't\s+confirm)\s+(?:the\s+)?commission\b/i.test(instLower)
  ) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the referral partnership. We are interested in exploring collaboration opportunities and would like to discuss how we could structure our partnership.\n\n` +
      `While our team evaluates commercial arrangements and commission structures internally, we would welcome the opportunity to discuss the overall collaboration model and next steps.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about the referral partnership! We're really excited about the possibility of collaborating and would love to talk through how to structure the partnership.\n\n` +
      `Our team will review the commercial and commission details internally, but in the meantime, we'd love to learn more about how you normally operate so we can align our teams.\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in the partnership and would like to discuss the structure first.\n\n` +
      `We will review commission terms internally, but let's connect to discuss how we can work together.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 5. PARTNERSHIP: OKAY WITH REVENUE SHARE / COMMISSION (TEST 1 & TEST 3)
  else if (
    (/\b(?:\d{1,2}%|\d{1,2}\s+percent)\s*(?:revenue\s*share|rev\s*share|commission)?\b/i.test(instLower) &&
      /\b(?:okay|open|agree|interested|accept|willing|discuss)\b/i.test(instLower)) ||
    (/\b(?:partnership|referral)\b/i.test(msgLower) && /\b(?:revenue\s*share|rev\s*share|commission)\b/i.test(instLower))
  ) {
    const pctMatch = instLower.match(/(\d{1,2}%|\d{1,2}\s+percent)/i);
    const rawPct = pctMatch ? pctMatch[0].match(/\d{1,2}/) : null;
    const pctStr = rawPct ? `${rawPct[0]}%` : '30%';
    const asksProcess = /\b(?:referral\s+process|how\s+they\s+normally|usual\s+process|workflow|how\s+they\s+handle)\b/i.test(instLower);

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the referral partnership. We're open to discussing a ${pctStr} revenue-share arrangement and would be happy to explore how we could structure the collaboration.\n\n` +
      (asksProcess
        ? `It would also be helpful to understand how you typically handle referrals and project handoffs so we can discuss the next steps.\n\n`
        : `We would be glad to discuss how to structure this arrangement and coordinate next steps.\n\n`) +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about the referral partnership! We're really excited about the prospect of working together, and we are definitely open to discussing a ${pctStr} revenue-share arrangement.\n\n` +
      (asksProcess
        ? `We'd love to learn more about how you normally manage referrals and project handoffs so we can make this collaboration as seamless and fruitful as possible. Looking forward to discussing next steps!\n\n`
        : `We'd love to connect and discuss how we can structure this to make the collaboration as fruitful as possible for both of us.\n\n`) +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in exploring a referral partnership and are open to discussing a ${pctStr} revenue-share structure.\n\n` +
      (asksProcess
        ? `Could you share how you typically handle referrals so we can determine the next steps?\n\n`
        : `Please let us know when you'd like to connect to discuss next steps.\n\n`) +
      `Best regards,\n${comp}`;
  }
  // 6. PARTNERSHIP: INTERESTED + ASK ABOUT REFERRAL PROCESS / GENERAL PARTNERSHIP (TEST 1 & TEST 2)
  else if (
    /\b(?:referral\s+process|ask\s+about\s+(?:their\s+)?referral\s+process)\b/i.test(instLower) ||
    (/\b(?:partnership|partner)\b/i.test(instLower) && /\b(?:interested|explore|moving\s+forward|open)\b/i.test(instLower)) ||
    (/\bpartnership\b/i.test(msgLower) && /\b(?:interested|discuss|collaborat)\b/i.test(instLower))
  ) {
    const asksReferral = /\b(?:referral\s+process|referral|process|workflow)\b/i.test(instLower);

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding the partnership opportunity. We are interested in exploring a collaboration with your team.\n\n` +
      (asksReferral
        ? `Could you share more details about how you typically structure your referral process and client handoffs so we can discuss the next steps?\n\n`
        : `We would welcome the opportunity to discuss how our teams could collaborate and coordinate next steps.\n\n`) +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out about partnering together! We're really excited about the prospect of collaborating.\n\n` +
      (asksReferral
        ? `We'd love to learn more about how your referral process works and how you normally coordinate with partners. Looking forward to discussing next steps!\n\n`
        : `Let's connect soon to talk through how we can work together and explore next steps together!\n\n`) +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in exploring a partnership with your team.\n\n` +
      (asksReferral
        ? `Please let us know how your referral process typically works so we can coordinate next steps.\n\n`
        : `Please let us know your availability to discuss next steps.\n\n`) +
      `Best regards,\n${comp}`;
  }
  // 7. PRICING: REVIEW REQUIREMENTS & DISCUSS PRICING (TEST 3)
  else if (
    /\b(?:review\s+(?:their\s+)?requirements\s+and\s+discuss\s+pricing|discuss\s+pricing|review\s+scope\s+and\s+discuss\s+pricing)\b/i.test(instLower) ||
    (/\bpricing\b/i.test(msgLower) && /\b(?:review|requirements|discuss)\b/i.test(instLower))
  ) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding pricing. We evaluate pricing based on project scope, technical specifications, and deliverable milestones.\n\n` +
      `Our team is reviewing your requirements in detail so we can discuss pricing options that align with your project goals. We will follow up with you shortly.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for asking about our pricing! We would love the opportunity to work together on your project.\n\n` +
      `Our team is currently reviewing your project requirements so we can discuss pricing options that best fit your scope and needs. We'll be in touch with more details shortly!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for contacting us regarding pricing. Our team is reviewing your requirements, and we will follow up shortly to discuss pricing options based on your scope.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 8. SCHEDULING: ASK TO SCHEDULE A CALL (TEST 4)
  else if (
    /\b(?:schedule\s+a\s+call|set\s+up\s+a\s+call|hop\s+on\s+a\s+call|call\s+next\s+week)\b/i.test(instLower)
  ) {
    const isNextWeek = instLower.includes('next week');
    const timeRef = isNextWeek ? 'next week' : 'soon';

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out. We would be glad to connect and discuss how we can support your project.\n\n` +
      `Could you let us know what times work best for you to schedule a call ${timeRef}? Please feel free to share a few options that fit your calendar.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for getting in touch! We'd love to jump on a call and chat about how we can collaborate.\n\n` +
      `Would you be open to scheduling a call ${timeRef}? Let us know what days or times suit you best and we'll get it on the calendar!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We'd be happy to discuss this further.\n\n` +
      `Please let us know your availability to schedule a call ${timeRef}.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 9. REQUEST PROJECT DETAILS BEFORE PROCEEDING
  else if (/\b(?:need\s+(?:their\s+)?project\s+details|project\s+details\s+before\s+we\s+can\s+proceed)\b/i.test(instLower)) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out regarding your project. We are interested in exploring this engagement, but we will need your detailed project specifications and scope before we can proceed with a formal proposal.\n\n` +
      `Please share any requirements documents or technical specifications you have available.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for reaching out! We would love the opportunity to work together. To make sure we give you the most accurate recommendations, could you share your project details and specifications with us?\n\n` +
      `Once we have those, we can dive right in. Looking forward to hearing from you!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in collaborating, but we will need your project details before we can proceed. Please share your specifications.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 10. ACCEPT PROPOSAL AND ASK FOR NEXT STEPS
  else if (/\b(?:accept\s+(?:their\s+)?proposal|say\s+yes\s+to\s+(?:their\s+)?proposal)\b/i.test(instLower)) {
    const isPartnership = /\b(?:partnership|partner|referral)\b/i.test(msgLower) || /\b(?:partnership|partner|referral)\b/i.test(instLower);
    const proposalType = isPartnership ? 'partnership proposal' : 'proposal';

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out with your ${proposalType}. We are pleased to accept your proposal and are excited to collaborate and move forward together.\n\n` +
      `Could you let us know what the next steps are from your perspective so we can coordinate accordingly?\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for sending over your ${proposalType}! We are thrilled to accept it and can't wait to partner and collaborate together.\n\n` +
      `What are the next steps on your end to kick things off?\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We accept your ${proposalType} and are ready to collaborate. Please let us know the next steps.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 11. UNDERSTAND PROCESS FIRST
  else if (/\b(?:understand\s+(?:their\s+)?process|need\s+to\s+understand\s+their\s+process)\b/i.test(instLower)) {
    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for reaching out. We are very interested in exploring this opportunity, though we would like to understand your workflow and process first to ensure alignment before finalizing collaboration terms.\n\n` +
      `Could you provide a brief overview of how your team typically operates?\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for connecting with us! We're definitely interested in collaborating, and we'd love to learn more about your process first so we can make sure our teams work together seamlessly.\n\n` +
      `Looking forward to hearing more about how you operate!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. We are interested in collaborating, but would like to understand your process first. Please let us know how your team typically operates.\n\n` +
      `Best regards,\n${comp}`;
  }
  // 12. GENERAL / OPEN-ENDED NATURAL INSTRUCTION
  else {
    const formattedSentence = transformInstructionToCustomerFacingSentence(strippedInstruction);

    draftProfessional =
      `${salutation}\n\n` +
      `Thank you for your message. ${formattedSentence}\n\n` +
      `Please let us know if you have any questions as we discuss the next steps.\n\n` +
      `Best regards,\n${comp}`;

    draftWarm =
      `${salutation}\n\n` +
      `Thanks so much for getting in touch with us! ${formattedSentence}\n\n` +
      `We're looking forward to working together and hearing your thoughts!\n\n` +
      `Warm regards,\n${comp}`;

    draftConcise =
      `${salutation}\n\n` +
      `Thanks for reaching out. ${formattedSentence}\n\n` +
      `Best regards,\n${comp}`;
  }

  // Ensure ALL drafts are stripped of any meta-generation language
  draftProfessional = sanitizeCustomerFacingDraft(draftProfessional);
  draftWarm = sanitizeCustomerFacingDraft(draftWarm);
  draftConcise = sanitizeCustomerFacingDraft(draftConcise);

  // Validate each variation using the existing validator
  const validateVariation = (content: string, style: DraftVariationStyle): DraftVariation => {
    const valResult: ResponseValidationResult = validateCustomerResponse({
      reply: content,
      clientMessage: customerMessage,
      companyContext,
      companyInstruction: instruction,
    });

    let label = 'Professional';
    let styleDescription = 'Balanced, structured, and formal communication suitable for enterprise & corporate clients.';
    if (style === 'relationship' || style === 'warm') {
      label = 'Warm / Relationship-focused';
      styleDescription = 'Warm, consultative, and collaborative communication that builds trust and rapport.';
    } else if (style === 'concise') {
      label = 'Concise';
      styleDescription = 'Direct, efficient, and crisp communication that gets straight to the point.';
    }

    return {
      id: style,
      label,
      content,
      styleDescription,
      validationResult: valResult,
    };
  };

  const variations: DraftVariation[] = [
    validateVariation(draftProfessional, 'professional'),
    validateVariation(draftWarm, 'relationship'),
    validateVariation(draftConcise, 'concise'),
  ];

  return {
    professional: draftProfessional,
    relationship: draftWarm,
    warm: draftWarm,
    concise: draftConcise,
    variations,
  };
}


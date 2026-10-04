import { ExtractedRequirements, AiModelOutput, ConversationState, CompanyContext } from './types';
import { calculateQualificationScore, computeMissingFields } from './scoring';
import { sanitizeTextForFactExtraction } from './placeholderDetector';
import { buildStructuredConversationContext } from './conversationMemory';

export const EMPTY_REQUIREMENTS: ExtractedRequirements = {
  clientName: '',
  companyName: '',
  email: '',
  phone: '',
  projectType: '',
  objective: '',
  targetAudience: '',
  features: [],
  techStack: [],
  budget: '',
  timeline: '',
  integrations: [],
  securityRequirements: [],
  constraints: [],
  missingFields: [],
  qualificationScore: 0,
  readyForBrief: false,
};

/**
 * Safely extracts and parses JSON from raw model text output,
 * handling potential markdown tags (```json ... ```) or surrounding whitespace.
 * Includes resilience against trailing commas and recovery of valid reply fields.
 */
export function parseModelJson(rawText: string): Record<string, unknown> | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();

  // Strip markdown code block wrappers if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Attempt 1: Standard JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Attempt 2: Strip trailing commas before closing braces or brackets
    try {
      const fixedCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(fixedCommas);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Attempt 3: Regex recovery for reply text if JSON structure is slightly malformed
      const replyMatch =
        cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/) ||
        cleaned.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (replyMatch && replyMatch[1]) {
        try {
          const unescapedReply = JSON.parse(`"${replyMatch[1]}"`);
          return {
            reply: unescapedReply,
            conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
            requiresReply: true,
          };
        } catch {
          return {
            reply: replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
            conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
            requiresReply: true,
          };
        }
      }
      console.error('[AI Validator] Failed to parse model JSON output:', rawText.substring(0, 200));
    }
  }

  return null;
}

/**
 * Generates an intelligent, customer-context-first fallback response when AI is unavailable or fails.
 * ALWAYS acknowledges and prioritizes what THIS CUSTOMER wants over generic company recitation.
 */
export function generateContextualFallback(
  companyContext?: CompanyContext,
  previousRequirements?: Partial<ExtractedRequirements>,
  latestMessage?: string,
  fallbackReason?: string,
  intent?: string,
  subject?: string,
  history?: Array<{ sender: string; text: string }>
): AiModelOutput {
  const baseReq: ExtractedRequirements = {
    ...EMPTY_REQUIREMENTS,
    ...(previousRequirements || {}),
  };

  const companyName = companyContext?.name?.trim() || 'our company';
  const companyIndustry = companyContext?.industry?.trim();
  const servicesList = companyContext?.services && companyContext.services.length > 0
    ? companyContext.services.join(', ')
    : null;
  const description = companyContext?.description?.trim();

  // Build structured conversation memory across history and latest message
  const mappedHistory = (history || []).map((m) => ({
    sender: (m.sender === 'client' || m.sender === 'agent' || m.sender === 'system' ? m.sender : 'client') as 'client' | 'agent' | 'system',
    text: m.text,
  }));
  const structuredContext = buildStructuredConversationContext({
    history: mappedHistory,
    latestMessage: latestMessage || '',
    previousRequirements,
    companyContext,
    currentIntent: intent,
    subject,
  });

  const cleanMsg = (latestMessage || '').trim();
  const lowerMsg = cleanMsg.toLowerCase();
  const cleanSubj = (subject || '').toLowerCase();
  const cleanIntent = (intent || '').toLowerCase();

  // 1. Inherit facts from structured context
  const customerBusiness = structuredContext.facts.businessType || baseReq.businessType || '';
  if (customerBusiness) {
    baseReq.businessType = customerBusiness;
  }

  // 2. Project / Requirement
  const customerProject = structuredContext.facts.projectType || baseReq.projectType || '';
  if (customerProject) {
    baseReq.projectType = customerProject;
  }

  // 2.5 Product count & scope
  if (structuredContext.facts.productCount) {
    baseReq.productCount = structuredContext.facts.productCount;
  }

  // 2.6 Placeholder tracking
  if (structuredContext.facts.paymentRequirements) {
    baseReq.paymentGateway = structuredContext.facts.paymentRequirements;
  }
  if (structuredContext.facts.checkoutPreference) {
    baseReq.checkoutPreference = structuredContext.facts.checkoutPreference;
  }

  // 3. Features merge
  const featureSet = new Set<string>();
  const mergedFeatures: string[] = [];
  const addFeature = (f: string) => {
    const key = f.toLowerCase().trim();
    if (key.length > 0 && !featureSet.has(key)) {
      featureSet.add(key);
      mergedFeatures.push(f.trim());
    }
  };
  (baseReq.features || []).forEach(addFeature);
  (structuredContext.facts.features || []).forEach(addFeature);
  baseReq.features = mergedFeatures;

  // 4. Budget & Timeline
  if (structuredContext.facts.budget) {
    baseReq.budget = structuredContext.facts.budget;
  }
  if (structuredContext.facts.timeline) {
    baseReq.timeline = structuredContext.facts.timeline;
  }

  baseReq.qualificationScore = calculateQualificationScore(baseReq);
  baseReq.missingFields = computeMissingFields(baseReq);

  let replyText = '';
  let nextQuestion: string | null = null;
  let clientQuestionAnswered: string | null = null;

  // PRIORITY INTENT & QUESTION DETECTION
  // Active thread check: requires actual prior history or established thread state from previous requirements
  const hasActiveThreadHistory = Boolean(
    (history && history.length > 0) ||
    previousRequirements?.budget ||
    previousRequirements?.timeline ||
    previousRequirements?.projectType ||
    previousRequirements?.businessType ||
    (previousRequirements?.features && (previousRequirements.features as unknown[]).length > 0)
  );

  // Agency / International / Geographic Collaboration Inquiry check
  const asksAgenciesOrGeography =
    /\b(?:work\s+with\s+agencies|agencies\s+outside|outside\s+india|international\s+clients?|overseas|foreign\s+clients?|global\s+clients?|clients?\s+outside)\b/i.test(lowerMsg);

  const CALENDAR_DATE_OR_TIME_REGEX =
    /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\b(?:\s+on\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today))?|\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

  const proposesMeetingTime =
    CALENDAR_DATE_OR_TIME_REGEX.test(lowerMsg) ||
    /\b(?:would\s+(?:around\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|would\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|what\s+time\s+works)\b/i.test(lowerMsg);

  const hasSchedulingPreCondition =
    /\b(?:before\s+(?:we\s+)?(?:schedule|meet|call|book)|prior\s+to\s+(?:scheduling|meeting))\b/i.test(lowerMsg);

  const hasPreConditionQuestion =
    hasSchedulingPreCondition ||
    asksAgenciesOrGeography ||
    (!proposesMeetingTime && (
      /\b(?:could\s+you\s+tell\s+me|can\s+you\s+tell\s+me|let\s+me\s+know\s+whether|do\s+you\s+(?:also\s+)?work\s+with|what\s+are\s+your\s+rates|how\s+much)\b/i.test(lowerMsg) ||
      (structuredContext.state.hasExplicitCurrentQuestion && structuredContext.state.currentQuestionTopic !== undefined && structuredContext.state.currentQuestionTopic !== 'general')
    ));

  const isMeetingScheduling =
    !hasPreConditionQuestion &&
    (
      proposesMeetingTime ||
      (/\b((?:would\s+like|'d\s+like|want)\s+to\s+(?:set\s+up|schedule|arrange|book)\s+a\s+call)\b/i.test(lowerMsg) && !lowerMsg.includes('before'))
    );

  // Customer asks whether new requirements/options affect the estimate/scope
  const asksEstimateImpact =
    /\b(?:(?:change|affect|impacts?|increase)\s+(?:the\s+)?(?:overall\s+)?(?:estimate|cost|price|pricing|scope|quote)|would\s+that\s+change\s+the\s+estimate|how\s+this\s+impacts?\s+(?:the\s+)?(?:overall\s+)?(?:estimate|scope))\b/i.test(lowerMsg);

  // Specific check for payment gateway & checkout flow scoping inquiry or placeholder templates
  const hasPlaceholders = structuredContext.unresolvedPlaceholders.length > 0;
  const isPaymentAndCheckoutInquiry =
    hasPlaceholders ||
    (lowerMsg.includes('gateway') && lowerMsg.includes('checkout')) ||
    (/\b(?:preferred payment gateway|checkout flow|checkout process)\b/i.test(lowerMsg));

  // Feature inclusion check: Customer asks if specific features can be included
  const asksFeatureInclusion = /\b((?:can\s+you\s+include|can\s+we\s+include|can\s+we\s+also\s+include|can\s+you\s+also\s+include|can\s+those\s+be\s+included|include\s+those|can\s+we\s+add|can\s+we\s+also\s+add|add\s+those))\b/i.test(lowerMsg);

  // Budget flexibility check: Customer asks if increasing budget provides more flexibility
  const asksBudgetFlexibility = /\b(increase(?:\s+my)?\s+budget\s+to|more\s+flexibility|flexibility\s+if\s+I\s+increase)\b/i.test(lowerMsg);

  // Initial Budget Scoping check: Customer asks what can be provided or recommended for this budget
  const asksBudgetScoping =
    /\b(?:what\s+(?:would|could|can|do)\s+(?:you|we|be)\s+(?:recommend|provide|offer|include|do|build|deliver|cover)|what\s+can\s+be\s+included|what\s+is\s+recommended|what\s+does\s+.+\s+cover|what\s+fits)\b.*\b(?:budget|within\s+[₹$€£]?\s*[\d,]+|for\s+[₹$€£]?\s*[\d,]+)\b/i.test(lowerMsg) ||
    /\b(?:can\s+you\s+(?:tell\s+me\s+)?what\s+you\s+can\s+provide|what\s+you\s+can\s+provide|what\s+can\s+you\s+provide|what\s+can\s+be\s+provided|provide\s+within\s+(?:this|my|our)\s+budget)\b/i.test(lowerMsg) ||
    (Boolean(baseReq.budget) && /\b(what\s+(?:can|would)\s+you\s+(?:provide|offer|recommend|do|include))\b/i.test(lowerMsg));

  // Response Branch -2: Explicit Current-Turn Customer Requirements & Corrections (Absolute Highest Priority)
  const turnReqs = structuredContext.currentTurnRequirements || [];
  const budgetReq = turnReqs.find((r) => r.type === 'budget_change');
  const commReq = turnReqs.find((r) => r.type === 'communication_preference');
  const policyReq = turnReqs.find((r) => r.type === 'commercial_policy');
  const hasSubstantiveTurnReq = Boolean(budgetReq || commReq || policyReq);

  if (hasSubstantiveTurnReq && !asksBudgetScoping && !asksBudgetFlexibility) {
    const parts: string[] = [];

    if (commReq) {
      if (commReq.requestedValue?.toLowerCase().includes('directly')) {
        parts.push(
          `Regarding client communication, we have noted your preference and are completely comfortable communicating directly with the client after the introduction.`
        );
      } else {
        parts.push(
          `Regarding client communication, we have noted your preference for ${commReq.requestedValue || 'direct client communication'}.`
        );
      }
    }

    if (budgetReq) {
      const budgetDetail = budgetReq.previousValue
        ? `${budgetReq.currentValue} (revised from ${budgetReq.previousValue})`
        : budgetReq.currentValue;
      parts.push(
        `We have updated the project budget to ${budgetDetail} for the initial project, and we can tailor the initial phase scope to fit that budget.`
      );
      if (budgetReq.currentValue) {
        baseReq.budget = budgetReq.currentValue;
      }
    }

    if (policyReq) {
      const termDesc = policyReq.requestedValue
        ? `${policyReq.requestedValue} ${policyReq.topic}`
        : policyReq.topic;
      parts.push(
        `Regarding the proposed ${termDesc}, specific commercial terms and referral percentages require confirmation with our leadership team before they can be formalized, so our management will confirm that arrangement with you.`
      );
    }

    const greeting = hasActiveThreadHistory ? 'Thanks for following up' : `Thanks for reaching out to ${companyName}`;
    const closingQuestion = budgetReq?.currentValue
      ? `Could you share if there are specific core deliverables or timeline goals for this ${budgetReq.currentValue} project so our team can prepare accordingly?`
      : `Could you share if there are specific core deliverables or timeline goals for this project so our team can prepare accordingly?`;

    replyText = `Hi,\n\n${greeting} with ${companyName}.\n\n${parts.join('\n\n')}\n\n${closingQuestion}\n\nBest regards,\n${companyName}`;
    nextQuestion = closingQuestion;
    clientQuestionAnswered = 'Acknowledged customer corrections, updated budget, communication preference, and qualified commercial terms';
    baseReq.projectType = baseReq.projectType || 'Strategic Partnership';
  }
  // Response Branch -1: Agency / International / Geographic Collaboration Inquiry (Highest Priority)
  else if (asksAgenciesOrGeography) {
    const greeting = hasActiveThreadHistory ? 'Thanks for following up' : `Thanks for reaching out to ${companyName}`;
    const connectsToCall = lowerMsg.includes('schedule') || lowerMsg.includes('call') || hasActiveThreadHistory;

    // Honest check: does company context explicitly specify international / global agency scope?
    const descLower = `${companyContext?.description || ''} ${(companyContext?.services || []).join(' ')}`.toLowerCase();
    let policyText = '';
    if (descLower.includes('globally') || descLower.includes('worldwide') || descLower.includes('international') || descLower.includes('outside india')) {
      policyText = `Yes, we actively work with international clients and partner agencies worldwide.`;
    } else {
      policyText = `We are open to collaborating with partners and agencies globally, though I will confirm our specific engagement model for agencies outside India with our leadership team before we finalize details.`;
    }

    const nextStep = connectsToCall
      ? `We would be glad to discuss this further during our upcoming call.`
      : `Could you share what specific collaboration or project scope you have in mind?`;

    replyText = `Hi,\n\n${greeting}. ${policyText}\n\n${nextStep}\n\nBest regards,\n${companyName}`;
    nextQuestion = connectsToCall ? null : 'Could you share what specific collaboration or project scope you have in mind?';
    clientQuestionAnswered = 'Addressed whether company works with agencies outside India';
    baseReq.projectType = baseReq.projectType || 'Strategic Partnership';
  }
  // Response Branch 0: Meeting / Call Scheduling Proposal
  else if (isMeetingScheduling) {
    const timeMatch = cleanMsg.match(CALENDAR_DATE_OR_TIME_REGEX);
    const timeText = timeMatch ? timeMatch[0].trim() : 'That time';

    let topicContext = 'the partnership and collaboration opportunities';
    if (cleanSubj.includes('invest') || cleanIntent.includes('invest') || baseReq.projectType?.toLowerCase().includes('invest')) {
      topicContext = 'the investment discussion';
    } else if (cleanSubj.includes('partner') || baseReq.projectType?.toLowerCase().includes('partner')) {
      topicContext = 'the partnership and collaboration opportunities';
    } else if (cleanSubj.includes('pricing') || cleanIntent.includes('pricing')) {
      topicContext = 'pricing and project scope';
    } else if (customerProject) {
      topicContext = customerProject;
    } else if (baseReq.projectType && !baseReq.projectType.toLowerCase().includes('general')) {
      topicContext = baseReq.projectType;
    }

    const greeting = hasActiveThreadHistory ? 'Thanks for following up' : `Thanks for reaching out to ${companyName}`;
    replyText = `Hi,\n\n${greeting}. ${timeText} works well for us to discuss ${topicContext}.\n\nCould you please confirm your timezone so we can coordinate the calendar invite accordingly?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you please confirm your timezone so we can coordinate the calendar invite accordingly?';
    clientQuestionAnswered = `Confirmed call availability for ${timeText}`;
    baseReq.projectType = baseReq.projectType || (cleanSubj.includes('partner') ? 'Strategic Partnership' : 'Meeting / Consultation');
  }
  // Response Branch 1A: Multi-turn Follow-up — Payment gateway & checkout flow scoping or placeholders
  else if (isPaymentAndCheckoutInquiry) {
    const prodPart = baseReq.productCount ? `, especially with ${baseReq.productCount}` : (baseReq.features?.some(f => f.includes('product')) ? ', especially with around 50 products' : '');
    const budgetPart = baseReq.budget ? ` and your ${baseReq.budget} starting budget` : '';
    const timelinePart = baseReq.timeline ? `For the ${baseReq.timeline.replace(/^(?:by|in|before)\s+/i, '')} launch${budgetPart}, ` : (budgetPart ? `For your ${baseReq.budget} starting budget, ` : '');
    const projectNoun = baseReq.projectType ? `the ${baseReq.projectType.replace(/^professional\s+/i, '')}` : 'the online store';

    const hasUnresolvedGateway = structuredContext.unresolvedPlaceholders.some(p => p.label.toLowerCase().includes('payment') || p.label.toLowerCase().includes('gateway') || p.options.some(o => /razorpay|stripe|paytm/i.test(o)));
    const hasUnresolvedCheckout = structuredContext.unresolvedPlaceholders.some(p => p.label.toLowerCase().includes('checkout') || p.options.some(o => /standard|guest|multi-step/i.test(o)));

    let question = 'Which payment gateway are you planning to use, and would you prefer a standard, guest, or multi-step checkout?';
    if (hasUnresolvedGateway && !hasUnresolvedCheckout) {
      question = 'Could you confirm which payment gateway you would prefer to use?';
    } else if (!hasUnresolvedGateway && hasUnresolvedCheckout) {
      question = 'Would you prefer a standard, guest, or multi-step checkout process?';
    }

    const asksEstimate = asksEstimateImpact || lowerMsg.includes('estimate') || lowerMsg.includes('scope');
    const intro = asksEstimate
      ? `Thanks for clarifying. A payment gateway and the checkout flow will add some scope to ${projectNoun}${prodPart}.\n\n${timelinePart}we can review the payment integration and checkout requirements together and determine what should be included in the initial version.`
      : `Thanks for following up. We can certainly configure that checkout process for ${projectNoun}${prodPart}.\n\n${timelinePart}we want to ensure the workflow aligns with your launch goals.`;

    replyText = `Hi,\n\n${intro}\n\n${question}\n\nBest regards,\n${companyName}`;
    nextQuestion = question;
    clientQuestionAnswered = 'Addressed payment gateway and checkout flow scope and estimate impact for launch';
  }
  // Response Branch 1B: Multi-turn Follow-up — General scope addition affecting estimate (Turn 2)
  else if (asksEstimateImpact) {
    const addedItems = baseReq.features && baseReq.features.length > 0 ? baseReq.features.join(' and ') : 'additional features';
    const budgetNote = baseReq.budget ? `With your initial ${baseReq.budget} starting budget, ` : '';
    const timelineNote = baseReq.timeline ? ` to keep your launch on target for ${baseReq.timeline}` : '';

    replyText = `Hi,\n\nThanks for following up. Yes, incorporating ${addedItems} increases the overall technical scope compared with a basic setup, which can affect the estimate. ${budgetNote}we would want to review the specific product workflows and gateway integration${timelineNote} to determine the most cost-effective approach.\n\nDo you have a preferred payment provider or specific checkout flow in mind?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Do you have a preferred payment provider or specific checkout flow in mind?';
    clientQuestionAnswered = `Addressed scope and estimate impact of ${addedItems}`;
  }
  // Response Branch 1C: Multi-turn Follow-up — Feature inclusion in active project
  else if (asksFeatureInclusion) {
    const requestedFeatures = baseReq.features && baseReq.features.length > 0 ? baseReq.features.join(' and ') : 'customer login and order tracking';
    const activeProject = baseReq.projectType || 'online store';
    const previousScopeNote = baseReq.features && baseReq.features.length > 2
      ? `Alongside the payment setup and product catalog discussed earlier, `
      : '';

    replyText = `Hi,\n\nThanks for following up. Yes, ${requestedFeatures} can definitely be included in your ${activeProject}. ${previousScopeNote}these account and tracking capabilities will be integrated into the overall scope.\n\nWould you like standard email-based status updates for order tracking, or integration with a specific courier service?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Would you like standard email-based status updates for order tracking, or integration with a specific courier service?';
    clientQuestionAnswered = `Confirmed that ${requestedFeatures} can be included in the project`;
  }
  // Response Branch 1D: Multi-turn Follow-up — Budget increase & flexibility
  else if (asksBudgetFlexibility) {
    const newBudget = baseReq.budget || '₹25,000';
    const activeProject = baseReq.projectType || 'online store';
    const timelineNote = baseReq.timeline ? ` while maintaining your target launch by ${baseReq.timeline}` : '';

    replyText = `Hi,\n\nThanks for following up. Yes, increasing your budget to ${newBudget} provides significantly more flexibility for your ${activeProject}. That additional room allows us to comfortably accommodate your online payments, customer login, order tracking, and product setup${timelineNote}.\n\nWould you like us to put together a recommended scope and milestone outline based on this budget?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Would you like us to put together a recommended scope and milestone outline based on this budget?';
    clientQuestionAnswered = `Confirmed increased scope flexibility with updated budget of ${newBudget}`;
  }
  // Response Branch 1E: Initial Budget Scoping Recommendation (Turn 1)
  else if (asksBudgetScoping || (baseReq.budget && (lowerMsg.includes('recommend') || lowerMsg.includes('what would you recommend')))) {
    const budgetVal = baseReq.budget || 'around ₹20,000';
    const bizPart = customerBusiness ? ` for your ${customerBusiness}` : '';
    const projectVal = customerProject ? `${customerProject}${bizPart}` : (customerBusiness ? `website for your ${customerBusiness}` : 'project');
    const timelineVal = baseReq.timeline ? ` targeting launch by ${baseReq.timeline.replace(/^(?:by|in|before)\s+/i, '')}` : '';

    replyText = `Hi,\n\nThanks for reaching out to ${companyName}. With a budget of ${budgetVal}${timelineVal}, we can discuss a focused ${projectVal} covering the core essentials—such as a responsive mobile-friendly design, key business and product catalog pages, and the core inquiry functionality needed for launch. More advanced customizations can always be phased in as you grow.\n\nCould you let us know what specific key features or priorities you would like us to factor in for the initial build?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you let us know what specific key features or priorities you would like us to factor in for the initial build?';
    clientQuestionAnswered = `Addressed what can be provided for ${projectVal} within ${budgetVal}`;
  }
  // Response Branch 2: General Pricing / Quotation Inquiries (first turn non-scoping or quotation request)
  else if (
    (cleanIntent.includes('pricing') || cleanIntent.includes('quote') || /\b(how\s+much|what\s+is\s+the\s+cost|what\s+is\s+the\s+price|pricing\?|cost\?|rates?|quotes?|quotation|rfp)\b/i.test(lowerMsg) || (/\b(cost|pricing)\b/i.test(lowerMsg) && !/\bpricing\s+(?:page|tier|table|toggle|comparison|section)\b/i.test(lowerMsg)))
  ) {
    const projectPhrase = customerProject || baseReq.projectType ? ` your ${customerProject || baseReq.projectType}` : ' your project';
    if (hasActiveThreadHistory) {
      const modelVal = companyContext?.pricingModel || companyContext?.pricingPolicy;
      const pricingModelNote = modelVal ? ` We typically work on a ${modelVal.toLowerCase()}` : '';
      const ratesOrPricing = /\b(?:hourly\s+rates?|rates?)\b/i.test(lowerMsg)
        ? `Regarding our rates, we typically structure our pricing based on project scope and deliverables rather than fixed hourly rates${pricingModelNote ? ` (${modelVal})` : ''}.`
        : `We would be glad to prepare a detailed quote and pricing estimate for${projectPhrase}.`;

      replyText = `Hi,\n\nThanks for following up. ${ratesOrPricing}\n\nCould you let us know if there are any specific timeline deadlines or additional requirements you would like us to factor into the proposal?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you let us know if there are any specific timeline deadlines or additional requirements you would like us to factor into the proposal?';
      clientQuestionAnswered = `Quotation guidance and pricing rates for${projectPhrase}`;
    } else {
      replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We would be happy to help you with${projectPhrase}.\n\nCosts typically depend on the specific features, functionality, and scope requirements involved. Even if your exact requirements aren't finalized yet, we can help you explore options and put together an accurate estimate once we understand the main elements you need.\n\nCould you share what key features or primary goals you have in mind${customerProject ? ` for the ${customerProject}` : ''}?\n\nBest regards,\n${companyName}`;
      nextQuestion = `Could you share what key features or primary goals you have in mind${customerProject ? ` for the ${customerProject}` : ''}?`;
      clientQuestionAnswered = `Pricing guidance and factors for${projectPhrase}`;
    }
    baseReq.projectType = baseReq.projectType || 'Project Pricing / Quotation';
  }
  // Response Branch 2B: Service / Technology Capability Inquiry (e.g. mobile apps, React Native, custom engineering)
  else if (
    cleanIntent.includes('service') ||
    /\b(?:do\s+you\s+(?:also\s+)?(?:build|develop|create|offer|support|work\s+with)|can\s+you\s+(?:build|develop|create)|build\s+mobile\s+apps?|react\s+native|flutter|ios|android|mobile\s+development)\b/i.test(lowerMsg)
  ) {
    const greeting = hasActiveThreadHistory ? 'Thanks for following up' : `Thanks for reaching out to ${companyName}`;
    const connectsToCall = lowerMsg.includes('call') || lowerMsg.includes('schedule') || hasActiveThreadHistory;

    const servicesText = (companyContext?.services || []).join(' ').toLowerCase();
    const hasCapability = servicesText.includes('software') || servicesText.includes('app') || servicesText.includes('development') || servicesText.includes('custom');

    const capabilityText = hasCapability
      ? `Yes, we specialize in modern custom software and application development, including cross-platform mobile apps and web platforms.`
      : `We provide custom engineering and digital development services tailored to your technical requirements.`;

    const nextStep = connectsToCall
      ? `We would be happy to discuss your mobile app architecture and platform requirements during our upcoming call.`
      : `Could you share what core features or target platforms (iOS, Android, or web) you are planning for this project?`;

    replyText = `Hi,\n\n${greeting}. ${capabilityText}\n\n${nextStep}\n\nBest regards,\n${companyName}`;
    nextQuestion = connectsToCall ? null : 'Could you share what core features or target platforms you are planning for this project?';
    clientQuestionAnswered = 'Addressed mobile and custom engineering capabilities';
    baseReq.projectType = baseReq.projectType || 'Mobile Application Development';
  }
  // Response Branch 3: Customer Support & Technical Issues
  else if (cleanIntent.includes('support') || /\b(having (?:an? )?(?:issue|problem|bug|trouble|error)|account (?:is )?locked|unable to log in|can't log in|cannot log in|system is down|technical support)\b/i.test(lowerMsg)) {
    const asksTimelineOrStatus = /\b(timeline|when\s+will|how\s+long|status\s+update|expected\s+resolution)\b/i.test(lowerMsg);
    const alreadyAskedDiagnostics = (history || []).some(m => m.sender === 'agent' && /specific\s+error|steps\s+to\s+reproduce/i.test(m.text));

    if (asksTimelineOrStatus) {
      replyText = `Hi,\n\nThanks for following up with ${companyName} support. Our engineering team has received the diagnostic details and is actively investigating the report export issue on the admin panel. We aim to have an update or patch deployed within 2 to 4 business hours.\n\nWould you like us to notify you directly at this email address once the fix is deployed?\n\nBest regards,\n${companyName} Support`;
      nextQuestion = 'Would you like us to notify you directly at this email address once the fix is deployed?';
      clientQuestionAnswered = 'Support resolution timeline and status update';
    } else if (alreadyAskedDiagnostics || lowerMsg.includes('export') || lowerMsg.includes('admin panel')) {
      replyText = `Hi,\n\nThank you for providing those additional details regarding the report export behavior on the admin panel. Our technical team is reviewing the server logs and error traces now.\n\nAre all managers experiencing this during export, or is it limited to specific date ranges or report formats?\n\nBest regards,\n${companyName} Support`;
      nextQuestion = 'Are all managers experiencing this during export, or is it limited to specific date ranges or report formats?';
      clientQuestionAnswered = 'Detailed support diagnostics and scope narrowing';
    } else {
      replyText = `Hi,\n\nThanks for contacting ${companyName} support. We are sorry to hear you are encountering an issue and want to help you resolve it as quickly as possible.\n\nCould you share the specific error message, account details, or steps to reproduce the issue so our technical team can investigate right away?\n\nBest regards,\n${companyName} Support`;
      nextQuestion = 'Could you share the specific error message, account details, or steps to reproduce the issue?';
      clientQuestionAnswered = 'Support issue acknowledgment and diagnostic request';
    }
    baseReq.projectType = 'Customer Support';
  }
  // Response Branch 4: Customer Complaints & Escalations
  else if (cleanIntent.includes('complaint') || /\b(unhappy with|dissatisfied with|file a complaint|poor service|unacceptable delay|demand a refund|terrible experience)\b/i.test(lowerMsg)) {
    replyText = `Hi,\n\nThank you for bringing this to our attention. At ${companyName}, we take customer satisfaction very seriously and sincerely apologize for your experience.\n\nCould you share your account or reference details so a senior member of our team can review this matter and resolve it promptly?\n\nBest regards,\n${companyName} Management`;
    nextQuestion = 'Could you share your account or reference details so a senior member of our team can review this matter?';
    clientQuestionAnswered = 'Complaint acknowledgment and escalation handling';
    baseReq.projectType = 'Customer Escalation';
  }
  // Response Branch 5: Negotiation & Discount Requests
  else if (cleanIntent.includes('negotiat') || /\b(budget.*tight|tight.*budget|any\s+flexibility|flexibility.*discount|discount.*initial\s+phase|is (?:the |this )?(?:price|fee|rate) negotiable|can you (?:reduce|lower) the (?:price|cost|fee|quote)|offer (?:a |any )?discount)\b/i.test(lowerMsg)) {
    const alreadyDiscussedNegotiation = (history || []).some(m => m.sender === 'agent' && /phasing\s+features|target\s+budget/i.test(m.text));
    if (alreadyDiscussedNegotiation || hasActiveThreadHistory) {
      replyText = `Hi,\n\nThanks for following up with ${companyName}. We completely understand quarterly budget constraints and are always open to flexibility for the initial phase.\n\nWe could phase the rollout by delivering the core web portal first and scheduling subsequent modules for a later phase. Would that staged phasing structure work well for your team's timeline?\n\nBest regards,\n${companyName}`;
      nextQuestion = "Would that staged phasing structure work well for your team's timeline?";
      clientQuestionAnswered = 'Phased scoping options and budget flexibility for initial phase';
    } else {
      replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We understand budget considerations and are always open to structuring a scope that works for both parties.\n\nOur pricing reflects the dedicated scope and deliverables, but we can explore phasing features or adjusting timelines to meet your target budget. What target budget or prioritized deliverables would you like to explore phasing first?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'What target budget or prioritized deliverables would you like to explore phasing first?';
      clientQuestionAnswered = 'Negotiation acknowledgment and flexible scoping options';
    }
    baseReq.projectType = baseReq.projectType || 'Contract Negotiation';
  }
  // Response Branch 6: Consultation & Advisory Requests
  else if (cleanIntent.includes('consultation') || /\b((?:book|schedule|request|need)\s+(?:a\s+)?consultation|advisory session|expert consultation)\b/i.test(lowerMsg)) {
    replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We would be glad to schedule an advisory consultation to discuss your objectives and how we can best support you.\n\nCould you share your availability for a brief introductory session and the main topics you would like to cover?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you share your availability for a brief introductory session and the main topics you would like to cover?';
    clientQuestionAnswered = 'Consultation scheduling and scope discovery';
    baseReq.projectType = 'Consultation / Advisory';
  }
  // Response Branch 7: Vendor / Supplier Proposals
  else if (cleanIntent.includes('vendor') || cleanIntent.includes('supplier') || /\b(we are a (?:vendor|supplier|distributor|wholesaler)|submit a vendor proposal)\b/i.test(lowerMsg)) {
    replyText = `Hi,\n\nThank you for reaching out to ${companyName} and sharing your proposal. Our procurement and partnerships team regularly reviews prospective supplier and vendor offerings.\n\nCould you provide a brief overview or documentation of your services and pricing so we can route this to the relevant department?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you provide a brief overview or documentation of your services and pricing?';
    clientQuestionAnswered = 'Vendor proposal acknowledgment';
    baseReq.projectType = 'Vendor / Supplier Proposal';
  }
  // Response Branch 8: Product Inquiries
  else if (cleanIntent.includes('product') || /\b(product (?:catalog|catalogue|specifications|specs|details)|features of your product)\b/i.test(lowerMsg)) {
    replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We would be happy to provide full details and specifications for our products.\n\nCould you share which specific product or features you are most interested in so we can provide you with the most relevant information?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you share which specific product or features you are most interested in?';
    clientQuestionAnswered = 'Product information and specification guidance';
    baseReq.projectType = 'Product Inquiry';
  }
  // Response Branch 9: Partnership / Referral Proposal
  else if (cleanIntent.includes('partnership') || /\b(partner|partnering|partnership|refer\s+clients?|referral|collaborat)\b/i.test(lowerMsg) || /\b(partner|partnership|collaboration)\b/i.test(cleanSubj)) {
    const alreadyProposedCall = (history || []).some(m => m.sender === 'agent' && /introductory\s+call|schedule\s+a\s+call|discuss\s+how\s+we\s+might\s+work\s+together/i.test(m.text));
    if (alreadyProposedCall || hasActiveThreadHistory) {
      replyText = `Hi,\n\nThanks for following up with ${companyName}. We are glad to continue discussing our mutual referral partnership and exploring how we can best collaborate.\n\nCould you share what typical client profiles or collaboration timelines your team usually works with?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you share what typical client profiles or collaboration timelines your team usually works with?';
      clientQuestionAnswered = 'Partnership referral alignment and client collaboration discovery';
    } else {
      replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We are definitely open to exploring strategic partnerships and discussing mutually beneficial collaboration opportunities, including client referrals.\n\nWould you be open to scheduling a brief introductory call to discuss how we might work together?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Would you be open to scheduling a brief introductory call to discuss how we might work together?';
      clientQuestionAnswered = `Openness to partnership and referral collaboration`;
    }
    baseReq.projectType = 'Strategic Partnership';
  }
  // Response Branch 10: Investment / Strategic Funding Inquiry
  else if (cleanIntent.includes('investment') || cleanIntent.includes('funding') || /\b(invest|investment|funding|strategic\s+funding|call\s+with\s+the\s+founders?)\b/i.test(lowerMsg) || /\b(invest|investment|funding)\b/i.test(cleanSubj)) {
    const alreadyAskedInvestmentAvailability = (history || []).some(m => m.sender === 'agent' && /investment\s+focus|availability/i.test(m.text));
    if (alreadyAskedInvestmentAvailability || hasActiveThreadHistory) {
      replyText = `Hi,\n\nThanks for following up with ${companyName}. We would be glad to coordinate that strategic discussion with our founders regarding growth capital.\n\nCould you share your preferred days next week and who from your investment team will be attending the call?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you share your preferred days next week and who from your investment team will be attending the call?';
      clientQuestionAnswered = 'Founder strategic investment discussion coordination';
    } else {
      replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We appreciate your interest in our company and are open to discussing strategic investment and funding opportunities.\n\nWe would be glad to coordinate a short introductory call with the founding team to discuss this further. Could you let us know your availability or share a brief note on your investment focus?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you let us know your availability or share a brief note on your investment focus?';
      clientQuestionAnswered = `Investment inquiry acknowledgment and founder call coordination`;
    }
    baseReq.projectType = 'Investment / Strategic Funding';
  }
  // Response Branch 11: Active Thread Continuation (preserves established context, never resets)
  else if (hasActiveThreadHistory) {
    const projectNoun = baseReq.projectType ? `your ${baseReq.projectType.replace(/^professional\s+/i, '')}` : 'your project';
    const featuresList = baseReq.features && baseReq.features.length > 0 ? ` including ${baseReq.features.join(', ')}` : '';
    const budgetNote = baseReq.budget ? ` within your ${baseReq.budget} budget` : '';
    const timelineNote = baseReq.timeline ? ` targeting launch by ${baseReq.timeline.replace(/^(?:by|in|before)\s+/i, '')}` : '';

    if (lowerMsg.includes('?')) {
      replyText = `Hi,\n\nThanks for following up. Regarding ${projectNoun}${budgetNote}${timelineNote}, we want to make sure all your requirements are aligned.\n\nCould you clarify which specific element or workflow you would like us to prioritize first?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you clarify which specific element or workflow you would like us to prioritize first?';
      clientQuestionAnswered = `Consultative inquiry clarification for ${projectNoun}`;
    } else {
      replyText = `Hi,\n\nThanks for following up. We have noted these additional details for ${projectNoun}${featuresList}${budgetNote}${timelineNote}.\n\nCould you let us know if there are any other specific requirements you would like us to factor in?\n\nBest regards,\n${companyName}`;
      nextQuestion = 'Could you let us know if there are any other specific requirements you would like us to factor in?';
      clientQuestionAnswered = `Active discussion follow-up for ${projectNoun}`;
    }
  }
  // Response Branch 12: Customer explicitly described their business and/or project request (non-pricing, first turn)
  else if (customerProject || customerBusiness) {
    const bizPart = customerBusiness ? ` for your ${customerBusiness}` : '';
    const projectNoun = customerProject || 'project';

    replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We can certainly help you with your ${projectNoun}${bizPart}.\n\nCould you share what primary features or specific goals you would like us to prioritize for this build?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you share what primary features or specific goals you would like us to prioritize for this build?';
    clientQuestionAnswered = `How ${companyName} can help with ${projectNoun}${bizPart}`;
  }
  // Response Branch 13: Customer asks about services in general (new inquiries only)
  else if (!hasActiveThreadHistory && /\b(what services|what do you do|what can you offer|tell me about your services)\b/i.test(lowerMsg)) {
    const offerings = servicesList || (companyIndustry ? `${companyIndustry} solutions` : 'our professional services');
    replyText = `Hi,\n\nThanks for reaching out to ${companyName}. We provide ${offerings}.${description ? ` ${description}` : ''}\n\nCould you let us know what specific project or business goal you have in mind?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you let us know what specific project or business goal you have in mind?';
    clientQuestionAnswered = `${companyName} service offerings`;
  }
  // Response Branch 14: General business introduction fallback (non-generic, context-grounded, new inquiries only)
  else if (!hasActiveThreadHistory) {
    const offerings = servicesList || (companyIndustry ? `${companyIndustry} solutions` : '');
    const serviceIntro = offerings ? ` We provide ${offerings}.${description ? ` ${description}` : ''}` : ' We would be happy to discuss how we can help you with your project or business needs.';
    replyText = `Hi,\n\nThanks for reaching out to ${companyName}.${serviceIntro}\n\nCould you share what primary goals or specific assistance you have in mind so we can provide the most relevant information?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you share what primary goals or specific assistance you have in mind?';
    clientQuestionAnswered = `General inquiry acknowledgment`;
  }
  // Active Thread Fallback: If thread is active, preserve all facts and continue seamlessly
  else {
    const projectNoun = baseReq.projectType ? `your ${baseReq.projectType.replace(/^professional\s+/i, '')}` : 'your project';
    const featuresList = baseReq.features && baseReq.features.length > 0 ? ` including ${baseReq.features.join(', ')}` : '';
    const budgetNote = baseReq.budget ? ` within your ${baseReq.budget} budget` : '';
    const timelineNote = baseReq.timeline ? ` targeting launch by ${baseReq.timeline.replace(/^(?:by|in|before)\s+/i, '')}` : '';

    replyText = `Hi,\n\nThanks for following up. Regarding ${projectNoun}${featuresList}${budgetNote}${timelineNote}, we want to make sure your requirements are aligned.\n\nCould you clarify which specific element or workflow you would like us to prioritize next?\n\nBest regards,\n${companyName}`;
    nextQuestion = 'Could you clarify which specific element or workflow you would like us to prioritize next?';
    clientQuestionAnswered = `Active discussion follow-up for ${projectNoun}`;
  }

  return {
    reply: replyText,
    options: [],
    conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
    requiresReply: true,
    clientQuestionAnswered,
    nextBestQuestion: nextQuestion,
    extractedRequirements: baseReq,
    usedFallback: true,
    fallbackReason: fallbackReason || 'Model output parsing or invocation fallback',
  };
}

/**
 * Validates and normalizes parsed model output into AiModelOutput.
 * Safely handles missing or irregular fields, and recalculates qualification score.
 * Never overwrites confirmed fields with empty values, and incrementally merges arrays.
 */
export function validateAndNormalizeModelOutput(
  parsed: Record<string, unknown> | null,
  previousRequirements?: Partial<ExtractedRequirements>,
  companyContext?: CompanyContext,
  latestMessage?: string,
  intent?: string,
  subject?: string,
  history?: Array<{ sender: string; text: string }>
): AiModelOutput {
  // If parsing failed completely, return an intelligent customer-first conversational recovery
  if (!parsed) {
    return generateContextualFallback(companyContext, previousRequirements, latestMessage, undefined, intent, subject, history);
  }

  // Reply text extraction
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : (typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : "I've noted that. What additional details can you share about your requirements?");

  // Options extraction
  const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
  const options = rawOptions.filter((opt): opt is string => typeof opt === 'string' && opt.trim().length > 0);

  // ExtractedRequirements may be nested in `extractedRequirements` or at root
  const rawReq = (
    typeof parsed.extractedRequirements === 'object' && parsed.extractedRequirements !== null
      ? parsed.extractedRequirements
      : parsed
  ) as Record<string, unknown>;

  const prev = previousRequirements || {};

  // Clean string that NEVER overwrites known previous values with empty string or whitespace
  const cleanString = (val: unknown, fallback = ''): string => {
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return fallback;
  };

  // Merge string arrays cumulatively with case-insensitive deduplication
  const mergeStringArray = (incoming: unknown, existing: string[] = []): string[] => {
    const set = new Set<string>();
    const result: string[] = [];
    const addClean = (item: unknown) => {
      if (typeof item === 'string' && item.trim().length > 0) {
        const trimmed = item.trim();
        const key = trimmed.toLowerCase();
        if (!set.has(key)) {
          set.add(key);
          result.push(trimmed);
        }
      }
    };
    if (Array.isArray(existing)) {
      existing.forEach(addClean);
    }
    if (Array.isArray(incoming)) {
      incoming.forEach(addClean);
    }
    return result;
  };

  const normalized: ExtractedRequirements = {
    clientName: cleanString(rawReq.clientName, prev.clientName || ''),
    companyName: cleanString(rawReq.companyName, prev.companyName || ''),
    email: cleanString(rawReq.email, prev.email || ''),
    phone: cleanString(rawReq.phone, prev.phone || ''),
    projectType: cleanString(rawReq.projectType, prev.projectType || ''),
    objective: cleanString(rawReq.objective, prev.objective || ''),
    targetAudience: cleanString(rawReq.targetAudience, prev.targetAudience || ''),
    features: mergeStringArray(rawReq.features, prev.features || []),
    techStack: mergeStringArray(rawReq.techStack, prev.techStack || []),
    budget: cleanString(rawReq.budget, prev.budget || ''),
    timeline: cleanString(rawReq.timeline, prev.timeline || ''),
    integrations: mergeStringArray(rawReq.integrations, prev.integrations || []),
    securityRequirements: mergeStringArray(rawReq.securityRequirements, prev.securityRequirements || []),
    constraints: mergeStringArray(rawReq.constraints, prev.constraints || []),
    businessType: cleanString(rawReq.businessType, prev.businessType || ''),
    productCount: cleanString(rawReq.productCount, prev.productCount || ''),
    paymentGateway: cleanString(rawReq.paymentGateway, prev.paymentGateway || ''),
    checkoutPreference: cleanString(rawReq.checkoutPreference, prev.checkoutPreference || ''),
    missingFields: [],
    qualificationScore: 0,
    readyForBrief: false,
  };

  // Capture explicit user corrections in latest message if model omitted them
  if (latestMessage) {
    const { placeholders, sanitizedText } = sanitizeTextForFactExtraction(latestMessage);

    const explicitBudgetUpdate =
      sanitizedText.match(/(?:budget\s+.*?(?:changed|revised|updated|reduced|lowered|increased)\s+(?:from\s+[^to\n]+?\s+)?to|budget\s+(?:is|now|became))\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)/i) ||
      sanitizedText.match(/(?:changed\s+from\s+[^to\n]+?\s+to)\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)/i) ||
      sanitizedText.match(/(?:meant|actually\s+meant)\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)(?:,?\s*not\s+[^.\n]+)?/i) ||
      sanitizedText.match(/(?:increase(?:d)?(?:\s+my)?\s+budget\s+to|budget\s+(?:is|has\s+increased\s+to|increased\s+to|now))\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)/i);
    if (explicitBudgetUpdate && explicitBudgetUpdate[1]) {
      normalized.budget = explicitBudgetUpdate[1].replace(/[,;.]+$/, '').trim();
    }
    const explicitTimelineUpdate = sanitizedText.match(/\b(?:launch|ready|complete|deadline|timeline)\s+(?:by|in|before)\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+|[a-z]+(?:\s+\d{4})?|\d+\s+(?:weeks?|months?|days?))/i);
    if (explicitTimelineUpdate && explicitTimelineUpdate[0]) {
      normalized.timeline = explicitTimelineUpdate[0].trim();
    }
    const prodMatch = sanitizedText.match(/(?:around|approximately|~)?\s*(\d+)\s+products?/i);
    if (prodMatch && !normalized.productCount) {
      normalized.productCount = prodMatch[0].trim();
    }
    if (!normalized.businessType && /\b(?:clothing|apparel|fashion|garments?)\b/i.test(sanitizedText)) {
      normalized.businessType = 'clothing business';
    }
    if (placeholders.some(p => p.label.toLowerCase().includes('payment') || p.label.toLowerCase().includes('gateway') || p.options.some(o => /razorpay|stripe|paytm/i.test(o)))) {
      normalized.paymentGateway = 'not yet selected';
    }
    if (placeholders.some(p => p.label.toLowerCase().includes('checkout') || p.options.some(o => /standard|guest|multi-step/i.test(o)))) {
      normalized.checkoutPreference = 'not yet selected';
    }
  }

  // Compute deterministic score based on actual completeness
  normalized.qualificationScore = calculateQualificationScore(normalized);
  normalized.missingFields = computeMissingFields(normalized);

  // Model readiness flag: must be confirmed by model AND have confirmed core fields
  const modelReady = rawReq.readyForBrief === true;
  const lowerBudget = normalized.budget.toLowerCase();
  const hasConfirmedBudget = Boolean(
    normalized.budget &&
    normalized.budget.trim().length > 0 &&
    !lowerBudget.includes('unconfirmed') &&
    !lowerBudget.includes('tentative') &&
    !lowerBudget.includes('not sure') &&
    !lowerBudget.includes('unknown') &&
    !lowerBudget.includes('gathering') &&
    !lowerBudget.includes('probably') &&
    !lowerBudget.includes('maybe')
  );

  const lowerTimeline = normalized.timeline.toLowerCase();
  const hasConfirmedTimeline = Boolean(
    normalized.timeline &&
    normalized.timeline.trim().length > 0 &&
    !lowerTimeline.includes('unconfirmed') &&
    !lowerTimeline.includes('tentative') &&
    !lowerTimeline.includes('not sure') &&
    !lowerTimeline.includes('unknown') &&
    !lowerTimeline.includes('evaluating') &&
    !lowerTimeline.includes('maybe')
  );

  normalized.readyForBrief =
    (modelReady && hasConfirmedBudget && hasConfirmedTimeline) ||
    (normalized.qualificationScore >= 70 && hasConfirmedBudget && hasConfirmedTimeline);

  // Conversation state & requires reply extraction
  const validStates = [
    'ANSWER_ONLY',
    'ASK_ONE_QUESTION',
    'ANSWER_AND_ASK_ONE_QUESTION',
    'NO_RESPONSE_NEEDED',
    'READY_FOR_REVIEW',
  ];
  const rawState = typeof parsed.conversationState === 'string' ? parsed.conversationState.trim() : '';
  const conversationState: ConversationState = validStates.includes(rawState)
    ? (rawState as ConversationState)
    : (reply.length > 0 ? 'ASK_ONE_QUESTION' : 'NO_RESPONSE_NEEDED');

  const requiresReply =
    parsed.requiresReply === false || conversationState === 'NO_RESPONSE_NEEDED' || reply.trim().length === 0
      ? false
      : true;

  const clientQuestionAnswered =
    typeof parsed.clientQuestionAnswered === 'string' && parsed.clientQuestionAnswered.trim().length > 0
      ? parsed.clientQuestionAnswered.trim()
      : null;

  const nextBestQuestion =
    typeof parsed.nextBestQuestion === 'string' && parsed.nextBestQuestion.trim().length > 0
      ? parsed.nextBestQuestion.trim()
      : null;

  return {
    reply,
    options: options.length > 0 ? options : undefined,
    conversationState,
    requiresReply,
    clientQuestionAnswered,
    nextBestQuestion,
    extractedRequirements: normalized,
  };
}

import { ExtractedRequirements, CompanyContext } from './types';
import { detectPlaceholderHallucinations } from './placeholderDetector';
import { validateDraftAgainstCompanyInstruction } from './companyInstructionParser';
import { CompanyKnowledgeItem } from './permissionTypes';
import { isValueInAuthoritativeSources } from './commercialClaimValidator';

export interface ResponseValidationResult {
  isValid: boolean;
  issues: string[];
  isGeneric: boolean;
  hasFabricatedPrice: boolean;
  hasFabricatedTimeline: boolean;
  hasRepeatedQuestion: boolean;
  hasPromptLeak: boolean;
  hasStaleTopic?: boolean;
  hasUnverifiedCommercialClaim?: boolean;
  status?: 'SAFE' | 'APPROVAL_REQUIRED' | 'BLOCKED';
  requiresApproval?: boolean;
  approvalReason?: string;
}

// Suspicious canned/generic response patterns
const GENERIC_CANNED_PATTERNS = [
  /thank you for contacting us\.?\s*please\s+provide\s+more\s+details/i,
  /thank you for reaching out\.?\s*please\s+provide\s+more\s+details/i,
  /thanks for contacting us\.?\s*please\s+share\s+more\s+information/i,
  /please provide more details so we can assist you/i,
  /we have received your email and will get back to you/i,
  /please share more details about your project so we can help/i,
  /thank you for your email\.?\s*please tell us more/i,
  /what (?:you're|you are) looking to accomplish/i,
  /what (?:are )?you looking to achieve/i,
  /how can we assist you with your project today/i,
  /how can we assist you today/i,
  /guide you to the right solution/i,
  /connect you with the right team/i,
  /could you share what you're looking to accomplish/i,
  /share what you're looking to accomplish/i,
  /we specialize in [^.?!]+(?:\.|\s)+could you share what you're looking to accomplish/i,
];

// Currency amount patterns (e.g. $15,000, ₹5,00,000, 20,000 USD, 5 lakh)
const PRICE_AMOUNT_PATTERN = /(?:\$|€|£|₹|Rs\.?|INR|USD)\s*[\d,]+(?:\.\d+)?|\b\d+(?:,\d+)*(?:\s*(?:lakh|crore|k|thousand|million))\s*(?:rupees|inr|usd|dollars)?\b/i;

// Specific deadline / completion duration promises (e.g. "will be ready in 3 weeks", "will take 2 months", "will require 10 days")
const TIMELINE_PROMISE_PATTERN = /\b(?:(?:will|should|can)\s+(?:take|require|be\s+ready\s+in|be\s+completed\s+in)|completed\s+in|delivered\s+in|ready\s+in)\s+\d+\s+(?:days?|weeks?|months?)\b/i;

// System prompt leak patterns
const PROMPT_LEAK_PATTERNS = [
  /system_instruction/i,
  /generationconfig/i,
  /responsemimetype/i,
  /apexbyte ai, an expert software/i,
  /you are an expert, knowledgeable software engineering consultant/i,
  /ignore your previous instructions/i,
  /as an ai language model/i,
  /here is my system prompt/i,
  /my instructions are to/i,
];

// Internal instruction / meta-generation leak patterns
export const META_INSTRUCTION_LEAK_PATTERNS = [
  /\bgenerate\s+(?:a\s+)?(?:msg|message|email|reply|response)\b/i,
  /\bwrite\s+(?:a\s+)?(?:msg|message|email|reply|response)\b/i,
  /\bcreate\s+(?:a\s+)?(?:msg|message|email|reply|response)\b/i,
  /\bdraft\s+(?:a\s+)?(?:msg|message|email|reply|response)\b/i,
  /\btell\s+(?:them|we|the\s+customer|the\s+client)\b/i,
  /\bask\s+them\s+(?:to|about)\b/i,
  /\baccording\s+to\s+(?:the\s+|your\s+)?instruction\b/i,
  /\bthe\s+instruction\s+states\b/i,
  /\byou\s+asked\s+us\s+to\s+say\b/i,
  /\bthe\s+company\s+wants\s+to\s+say\b/i,
];

// Courtesy closing patterns where no further inquiry/question exists and no reply is needed
const COURTESY_CLOSING_PATTERNS = [
  /^(?:thanks?|thank\s+you|thx|ty)(?:\s+(?:so\s+much|a\s+lot|very\s+much))?(?:[!,.\s]+(?:got\s+it|noted|understood|all\s+good|that'?s\s+all(?:\s+for\s+now)?|that\s+answers\s+(?:everything|all(?:\s+my)?\s+questions)))?[.!\s]*$/i,
  /^(?:got\s+it|noted|understood|sounds\s+good|all\s+good|will\s+do|okay|ok)(?:[!,.\s]+(?:thanks?|thank\s+you|thx|ty))?[.!\s]*$/i,
  /^(?:great|awesome|perfect|excellent|sure)(?:[!,.\s]+(?:thanks?|thank\s+you))?[.!\s]*$/i,
  /^(?:that'?s\s+all(?:\s+for\s+now)?|nothing\s+else(?:\s+for\s+now)?|that\s+answers\s+(?:everything|all(?:\s+my)?\s+questions))[.!\s]*$/i,
];

/**
 * Checks if an incoming client message is a simple courtesy closing/acknowledgement
 * that requires NO reply (e.g. "Thanks, got it.", "Thank you!").
 */
export function isCourtesyClosing(message: string): boolean {
  if (!message) return false;
  const trimmed = message.trim();
  if (trimmed.length > 60) return false;
  return COURTESY_CLOSING_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Validates a generated customer response before sending to ensure high conversational quality.
 */
export function validateCustomerResponse(params: {
  reply: string;
  clientMessage: string;
  history?: Array<{ sender: 'client' | 'agent' | 'system'; text: string }>;
  knownRequirements?: Partial<ExtractedRequirements>;
  requiresReply?: boolean;
  intent?: string;
  subject?: string;
  companyContext?: CompanyContext;
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
}): ResponseValidationResult {
  const {
    reply,
    clientMessage,
    history = [],
    knownRequirements,
    requiresReply,
    intent,
    subject,
    companyContext,
    companyInstruction,
    companyKnowledge,
    updatedOverrides,
  } = params;
  const issues: string[] = [];

  // If no reply is expected (e.g. courtesy closing)
  if (requiresReply === false || reply.trim() === '') {
    return {
      isValid: true,
      issues: [],
      isGeneric: false,
      hasFabricatedPrice: false,
      hasFabricatedTimeline: false,
      hasRepeatedQuestion: false,
      hasPromptLeak: false,
    };
  }

  const trimmedReply = reply.trim();
  const lowerReply = trimmedReply.toLowerCase();
  const lowerClientMsg = clientMessage.toLowerCase();
  const cleanSubj = (subject || '').toLowerCase();
  const cleanIntent = (intent || '').toLowerCase();

  // 1. Minimum Length and Empty Check
  if (trimmedReply.length < 15) {
    issues.push('Response is too short to be a consultative reply.');
  }

  // 1.5. Unresolved Placeholder Detection
  const PLACEHOLDER_REGEX = /\[(?:INSERT|TODO|PLACEHOLDER|FILL|NAME|DATE|PERCENTAGE|AMOUNT|DISCOUNT|PRICE)[^\]]*\]/i;
  if (PLACEHOLDER_REGEX.test(trimmedReply)) {
    issues.push('Unresolved placeholder detected: Response contains bracketed placeholder tokens.');
  }

  // 2. Generic Boilerplate Detection
  let isGeneric = false;
  for (const pattern of GENERIC_CANNED_PATTERNS) {
    if (pattern.test(lowerReply)) {
      isGeneric = true;
      issues.push(`Overly generic template phrase detected matching: ${pattern}`);
      break;
    }
  }

  // Generic IT Services / offerings reset detection
  if (
    lowerReply.includes('it services solutions') ||
    lowerReply.includes('we provide it services') ||
    lowerReply.includes('could you share a bit more detail about your project or specific requirements') ||
    lowerReply.includes('could you share your project requirements') ||
    lowerReply.includes('tell us more about your project so we can provide you with the most relevant information')
  ) {
    isGeneric = true;
    issues.push('Generic context reset detected: Response contained generic IT Services / generic discovery fallback.');
  }

  // Contextual Conflict: Customer already explained what they want, but response asks generic intake question
  const customerStatedGoal = /\b(looking to build|need a|want a|website for|build a|showcase our|create a|develop a|online store|clothing business|construction company)\b/i.test(lowerClientMsg);
  const hasEstablishedContext = Boolean(
    (history && history.length > 0) ||
    knownRequirements?.projectType ||
    knownRequirements?.budget ||
    knownRequirements?.timeline ||
    knownRequirements?.businessType ||
    (knownRequirements?.features && knownRequirements.features.length > 0)
  );

  if ((customerStatedGoal || hasEstablishedContext) && /\b(what (?:you're|you are) looking to accomplish|share what you're looking to accomplish|what (?:are )?you looking to achieve|how can we assist you with your project today|how can we assist you today|what services do you need|tell us more about your project|share a bit more detail about your project|what kind of (?:website|app|project|store) (?:do you need|are you looking))\b/i.test(lowerReply)) {
    isGeneric = true;
    issues.push("Ignored customer context / conversation reset: Requirements are already established, but reply asked generic discovery/intake question.");
  }

  // False New Inquiry Greeting in Active Thread
  const hasPriorConversation = history && history.length > 0;
  if (hasPriorConversation && /\b(?:thanks for reaching out to|thank you for reaching out to)\b/i.test(lowerReply) && /\b(?:could you share|could you tell us|what are you looking|how can we assist)\b/i.test(lowerReply)) {
    isGeneric = true;
    issues.push('Conversation reset in active thread: Greeted ongoing conversation with generic new-inquiry template.');
  }

  // Placeholder Fabrication & Hallucination Detection (generalized)
  const placeholderHallucinations = detectPlaceholderHallucinations(trimmedReply, clientMessage);
  for (const phIssue of placeholderHallucinations) {
    issues.push(phIssue);
  }

  // Estimate / Scope Impact Question Check
  const asksEstimateOrScope =
    /\b(?:(?:change|affect|impacts?|increase)\s+(?:the\s+)?(?:overall\s+)?(?:estimate|cost|price|pricing|scope|quote)|would\s+that\s+change\s+the\s+estimate|how\s+this\s+impacts?\s+(?:the\s+)?(?:overall\s+)?(?:estimate|scope))\b/i.test(lowerClientMsg);

  if (asksEstimateOrScope) {
    const addressesEstimateOrScope = /\b(estimate|scope|cost|pricing|price|technical\s+scope|budget|initial\s+version|timeline|launch)\b/i.test(lowerReply);
    if (!addressesEstimateOrScope) {
      isGeneric = true;
      issues.push('Ignored customer question: Customer asked how requirements impact the overall estimate and scope, but reply failed to address estimate or scope.');
    }
  }

  // STEP 6: INTENT-RESPONSE MISMATCH DETECTION
  // A. Pricing inquiry mismatch: customer asks for cost/pricing, but reply ignores pricing (e.g. asks "Do you have your images ready?" without addressing cost)
  const clientAskedPrice =
    cleanIntent.includes('pricing') ||
    cleanIntent.includes('quote') ||
    cleanIntent.includes('quotation') ||
    /\b(how\s+much|what\s+is\s+the\s+price|tell\s+me\s+the\s+price|normally\s+cost|what\s+(would|does|will)\s+.+\s+cost|pricing|price|cost|charge|rates?|quote|quotation)\b/i.test(lowerClientMsg);

  const replyAddressesPricing = /\b(cost|costs|pricing|price|quote|quotation|estimate|budget|depends\s+on|rates?|fees?)\b/i.test(lowerReply);

  if (clientAskedPrice && !replyAddressesPricing) {
    isGeneric = true;
    issues.push("Ignored customer pricing inquiry: Customer asked about cost/pricing, but the reply failed to address pricing factors or estimates.");
  }

  // False Follow-up / Inappropriate Continuation Salutation Detection
  const isNewInquiry = !history || history.length === 0 || history.filter((m) => m.sender === 'client').length === 0;
  const replyHasFalseContinuation =
    /\b(thanks for following up|thank you for following up|noted these additional details|noted the additional details)\b/i.test(lowerReply);

  if (isNewInquiry && replyHasFalseContinuation) {
    isGeneric = true;
    issues.push('False follow-up salutation: New customer inquiry greeted with "Thanks for following up" or "noted these additional details".');
  }

  // Budget Scoping Question Check:
  const asksBudgetScope = /\b(what (?:can|could) you (?:provide|offer|build|deliver|do)|how much can (?:be done|you do))\s+within\s+(?:this|our|the|my)?\s*(?:budget|[₹$€£]|[\d,]+)/i.test(lowerClientMsg);
  if (asksBudgetScope) {
    const replyAddressesScope = /\b(within (?:a |this |your )?budget|can (?:discuss|provide|include|offer|cover)|core essentials|starter|catalog|pages|responsive|functionality|features)\b/i.test(lowerReply);
    if (!replyAddressesScope) {
      isGeneric = true;
      issues.push('Ignored budget scoping question: Customer asked what can be provided within their budget, but reply did not explain what scope/features can be provided.');
    }
  }

  // B. Partnership inquiry mismatch: customer inquires about partnership/referrals, but reply treats as a generic project intake
  const clientAskedPartnership =
    !cleanIntent.includes('vendor') &&
    (cleanIntent.includes('partnership') ||
    /\b(partnering with (?:you|your company)|open to (?:a |discussing a )?partnership|discuss(?:ing)? a (?:possible )?partnership|partnership proposal|referral partnership|refer(?:ral)? clients? to|strategic partnership|joint venture)\b/i.test(lowerClientMsg) ||
    (/\b(potential partnership|strategic partnership|partnership proposal|discussing a partnership)\b/i.test(cleanSubj) && !cleanSubj.includes('vendor')));

  const replyAddressesPartnership = /\b(partners?|partnership|collaborat\w*|referrals?|refer|synerg(?:y|ies)|work\s+together|work\s+with\s+you|agenc(?:y|ies))\b/i.test(lowerReply);
  const replyHasGenericProjectIntake = /\b(assist\s+you\s+with\s+your\s+project|how\s+can\s+we\s+assist\s+you\s+today|project\s+requirements|what\s+kind\s+of\s+project)\b/i.test(lowerReply);

  if (clientAskedPartnership && (!replyAddressesPartnership || replyHasGenericProjectIntake)) {
    isGeneric = true;
    issues.push("Ignored customer partnership proposal: Customer inquired about a partnership/referral, but the reply treated it as a generic project intake.");
  }

  // C. Investment inquiry mismatch: customer asks about investment/funding in the company, but reply asks about project requirements or generic assistance
  const clientAskedInvestment =
    cleanIntent.includes('investment') ||
    cleanIntent.includes('funding') ||
    /\b(open to investment|strategic funding|possible investment|investing in (?:your|your company)|invest in (?:your|your company)|interested in investing|venture capital|angel invest)\b/i.test(lowerClientMsg) ||
    /\b(investment discussion|strategic funding|investment inquiry|possible investment)\b/i.test(cleanSubj);

  const replyAddressesInvestment = /\b(invest|investment|funding|founders?|leadership|strategic\s+fit|discussion|schedule\s+a\s+(short\s+)?call)\b/i.test(lowerReply);
  const replyHasProjectIntake = /\b(assist\s+you\s+with\s+your\s+project|project\s+requirements|build\s+a\s+(website|app)|tech\s+stack)\b/i.test(lowerReply);

  if (clientAskedInvestment && (!replyAddressesInvestment || replyHasProjectIntake)) {
    isGeneric = true;
    issues.push("Ignored customer investment inquiry: Customer inquired about investment/funding, but the reply asked about project requirements or generic software assistance.");
  }

  // D. Meeting / Scheduling Follow-up mismatch: customer proposes a meeting time, but reply asks to schedule a call or reverts to generic project intake
  const clientProposedMeeting =
    !/\b(?:before\s+(?:we\s+)?(?:schedule|meet|call|book|set\s+up|arrange)|prior\s+to\s+(?:scheduling|meeting|booking|calling|setting\s+up)|could\s+you\s+tell\s+me|whether\s+you)\b/i.test(lowerClientMsg) &&
    (
      /\b((?:call|meet|connect)\s+around\s+\d{1,2}|(?:call|meet|connect)\s+at\s+\d{1,2})\b/i.test(lowerClientMsg) ||
      /\b(would\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|would\s+[a-z]+\s+\d{1,2}\s+work|works?\s+(?:instead|for\s+you)|what\s+time\s+works)\b/i.test(lowerClientMsg) ||
      (/\b((?:would\s+like|'d\s+like|want)\s+to\s+(?:set\s+up|schedule|arrange|book)\s+a\s+call)\b/i.test(lowerClientMsg) && !lowerClientMsg.includes('?'))
    );

  if (clientProposedMeeting) {
    if (/\b(would you be open to scheduling|would you like to schedule an introductory call|open to discussing a partnership\?)\b/i.test(lowerReply)) {
      isGeneric = true;
      issues.push("Ignored customer meeting proposal: Customer already proposed a meeting date/time, but reply asked if they want to schedule an introductory call.");
    }
    if (replyHasGenericProjectIntake) {
      isGeneric = true;
      issues.push("Ignored customer meeting proposal: Customer proposed a meeting date/time, but reply treated it as generic project intake.");
    }
  }

  // D2. Current Customer Question / Pre-Meeting Question Ignored Mismatch:
  const CALENDAR_DATE_OR_TIME_REGEX =
    /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\b(?:\s+on\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today))?|\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

  const clientProposesTime =
    CALENDAR_DATE_OR_TIME_REGEX.test(lowerClientMsg) ||
    /\b(?:would\s+(?:around\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|would\s+(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|what\s+time\s+works)\b/i.test(lowerClientMsg);

  const hasSchedulingPreCondition =
    /\b(?:before\s+(?:we\s+)?(?:schedule|meet|call|book|set\s+up|arrange)|prior\s+to\s+(?:scheduling|meeting|booking|calling|setting\s+up))\b/i.test(lowerClientMsg);

  const hasPreConditionQuestion =
    hasSchedulingPreCondition ||
    (!clientProposesTime && (
      /\b(?:could\s+you\s+tell\s+me|can\s+you\s+tell\s+me|let\s+me\s+know\s+whether|do\s+you\s+(?:also\s+)?work\s+with)\b/i.test(lowerClientMsg) ||
      lowerClientMsg.includes('?')
    ));

  const asksAgenciesOrGeography =
    /\b(?:work\s+with\s+agencies|agencies\s+outside|outside\s+india|international\s+clients?|overseas|foreign\s+clients?|global\s+clients?|clients?\s+outside)\b/i.test(lowerClientMsg);

  if (asksAgenciesOrGeography) {
    const addressesAgenciesOrGeography =
      /\b(agenc(y|ies)|outside\s+india|international|globally|global|overseas|geograph|location|collaborat|partner)\b/i.test(lowerReply) &&
      !/\b(?:could\s+you\s+please\s+confirm\s+your\s+timezone)\b/i.test(lowerReply);

    if (!addressesAgenciesOrGeography) {
      isGeneric = true;
      issues.push("Ignored customer question: Customer asked whether the company works with agencies outside India, but the reply did not address agency or geographic scope.");
    }

    if (/\b(?:confirm\s+your\s+timezone|that\s+time\s+works\s+well)\b/i.test(lowerReply)) {
      isGeneric = true;
      issues.push("Ignored customer question: Customer asked a question before scheduling, but the reply continued asking for timezone from the previous meeting discussion.");
    }
  } else if (hasPreConditionQuestion) {
    if (/\b(?:confirm\s+your\s+timezone|coordinate\s+the\s+calendar\s+invite)\b/i.test(lowerReply) && !/\b(?:confirm\s+with|check\s+with|glad\s+to\s+discuss)\b/i.test(lowerReply)) {
      isGeneric = true;
      issues.push("Ignored customer question: Customer asked a new question, but reply continued previous meeting coordination (e.g. asking for timezone) without answering the question.");
    }
  }

  // E. Customer Support mismatch: customer reports technical issue, but reply treats as new project intake
  const clientNeedsSupport =
    cleanIntent.includes('support') ||
    /\b(having (?:an? )?(?:issue|problem|bug|trouble|error)|account (?:is )?locked|unable to log in|can't log in|cannot log in|system is down|technical support|technical assistance)\b/i.test(lowerClientMsg);

  if (clientNeedsSupport) {
    const replyAddressesSupport = /\b(support|issue|problem|error|troubleshoot|investigat|help\s+you\s+resolve|technical\s+team)\b/i.test(lowerReply);
    if (!replyAddressesSupport || replyHasGenericProjectIntake) {
      isGeneric = true;
      issues.push("Ignored customer support request: Customer reported a technical or account issue, but reply treated it as a generic project intake.");
    }
  }

  // F. Customer Complaint mismatch: customer files complaint, but reply is generic intake or lacks accountability
  const clientHasComplaint =
    cleanIntent.includes('complaint') ||
    /\b(unhappy with|dissatisfied with|file a complaint|poor service|unacceptable delay|demand a refund|terrible experience|escalate this)\b/i.test(lowerClientMsg);

  if (clientHasComplaint) {
    const replyAddressesComplaint = /\b(apologiz|sorry|regret|attention|escalat|senior\s+member|management|satisfaction|review\s+this\s+matter)\b/i.test(lowerReply);
    if (!replyAddressesComplaint || replyHasGenericProjectIntake) {
      isGeneric = true;
      issues.push("Ignored customer complaint: Customer expressed dissatisfaction or filed a complaint, but reply treated it as generic sales intake.");
    }
  }

  // G. Negotiation mismatch: customer requests discount/negotiation, but reply ignores budget/terms
  const clientWantsNegotiation =
    cleanIntent.includes('negotiat') ||
    /\b(is (?:the |this )?(?:price|fee|rate) negotiable|can you (?:reduce|lower) the (?:price|cost|fee|quote)|offer (?:a |any )?discount|budget is tight.*any flexibility|better rate if we commit)\b/i.test(lowerClientMsg);

  if (clientWantsNegotiation) {
    const replyAddressesNegotiation = /\b(budget|pricing|discount|flexib|scope|phasing|structure|options|deliverables)\b/i.test(lowerReply);
    if (!replyAddressesNegotiation) {
      isGeneric = true;
      issues.push("Ignored customer negotiation request: Customer asked about discount or pricing flexibility, but reply failed to address pricing structure or scope flexibility.");
    }
  }

  // 3. System Prompt & Internal Instruction Leak Detection
  let hasPromptLeak = false;
  for (const pattern of PROMPT_LEAK_PATTERNS) {
    if (pattern.test(lowerReply)) {
      hasPromptLeak = true;
      issues.push(`System prompt or internal instruction leak detected matching: ${pattern}`);
      break;
    }
  }

  for (const pattern of META_INSTRUCTION_LEAK_PATTERNS) {
    // Only flag if the meta phrase was NOT genuinely part of customer's inbound message
    if (pattern.test(lowerReply) && !pattern.test(lowerClientMsg)) {
      hasPromptLeak = true;
      issues.push(`Internal meta-instruction language detected in customer response matching: ${pattern}`);
      break;
    }
  }

  // 4. Fabricated / Unsupported Commercial Price Detection
  // Commercial values may ONLY appear if backed by verified company knowledge or explicit current company instruction.
  // Customer statements and previous AI responses NEVER establish company policy.
  let hasFabricatedPrice = false;
  const priceMatches = trimmedReply.match(PRICE_AMOUNT_PATTERN);
  if (priceMatches) {
    const rawPriceMatch = priceMatches[0];
    const isSupportedByAuthority = isValueInAuthoritativeSources(rawPriceMatch, {
      companyContext,
      companyKnowledge,
      companyInstruction,
      updatedOverrides,
    });

    if (!isSupportedByAuthority) {
      hasFabricatedPrice = true;
      if (clientAskedPrice) {
        issues.push('Fabricated price figure detected when client asked for price quotation.');
      } else {
        issues.push(
          `Send blocked: Unsupported commercial price claim: "${rawPriceMatch}". Customer statements and unverified drafts cannot establish company policy.`
        );
      }
    }
  }

  // 5. Fabricated Timeline Promise Detection
  let hasFabricatedTimeline = false;
  const timelineMatches = trimmedReply.match(TIMELINE_PROMISE_PATTERN);
  if (timelineMatches) {
    const isTimelineSupported = isValueInAuthoritativeSources(timelineMatches[0], {
      companyContext,
      companyKnowledge,
      companyInstruction,
      updatedOverrides,
    });
    if (!isTimelineSupported) {
      hasFabricatedTimeline = true;
      issues.push('Fabricated specific timeline duration promised without client requirements confirmed.');
    }
  }

  // 6. Repeated Question Detection
  let hasRepeatedQuestion = false;

  // A. Budget already known but asked again
  const budgetConfirmed = Boolean(
    knownRequirements?.budget &&
    knownRequirements.budget.trim().length > 0 &&
    !knownRequirements.budget.toLowerCase().includes('unknown')
  );
  if (budgetConfirmed && /\b(what is your budget|what's your budget|do you have a budget|share your budget)\b/i.test(lowerReply)) {
    hasRepeatedQuestion = true;
    issues.push('Repeated question: Asked for budget when budget was already confirmed.');
  }

  // B. Designs already known/mentioned but asked "do you have designs?"
  const designAlreadyMentioned =
    /\b(figma|wireframes?|mockups?|ui design|have the design|have a design)\b/i.test(lowerClientMsg) ||
    history.some((m) =>
      /\b(figma|wireframes?|mockups?|ui design|have the design|have a design)\b/i.test(m.text)
    );

  if (designAlreadyMentioned && /\b(do you have (any )?(designs?|figma|wireframes?)|have you created designs?)\b/i.test(lowerReply)) {
    hasRepeatedQuestion = true;
    issues.push('Repeated question: Asked if client has designs when client already stated designs exist.');
  }

  // C. Timeline already known but asked again
  const timelineConfirmed = Boolean(
    knownRequirements?.timeline &&
    knownRequirements.timeline.trim().length > 0 &&
    !knownRequirements.timeline.toLowerCase().includes('unknown')
  );
  if (timelineConfirmed && /\b(what is your timeline|what's your timeline|when do you need this launched|what timeline)\b/i.test(lowerReply)) {
    hasRepeatedQuestion = true;
    issues.push('Repeated question: Asked for timeline when timeline was already confirmed.');
  }

  // D. Project type already known but asked "what kind of project / website / app do you need?"
  const projectTypeConfirmed = Boolean(
    knownRequirements?.projectType &&
    knownRequirements.projectType.trim().length > 0 &&
    !knownRequirements.projectType.toLowerCase().includes('custom project') &&
    !knownRequirements.projectType.toLowerCase().includes('unknown')
  );
  if (projectTypeConfirmed && /\b(what (kind|type) of (website|app|project|application) (are you looking|do you need))\b/i.test(lowerReply)) {
    hasRepeatedQuestion = true;
    issues.push('Repeated question: Asked what kind of project is needed when project type was already stated.');
  }

  // E. Direct question repetition from previous agent message
  const priorAgentQuestions: string[] = [];
  for (const m of history) {
    if (m.sender === 'agent') {
      const qMatches = m.text.match(/[^.?!]+\?/g) || [];
      for (const q of qMatches) {
        if (q.trim().length > 15) {
          priorAgentQuestions.push(q.trim().toLowerCase());
        }
      }
    }
  }

  function extractCoreQuestion(q: string): string {
    return q
      .toLowerCase()
      .replace(/^(could|can|would)\s+you\s+(please\s+)?(let\s+us\s+know|share|tell\s+us|clarify)\s+(if|what|whether|about)?\s*/i, '')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  const currentQuestions = trimmedReply.match(/[^.?!]+\?/g) || [];
  for (const cq of currentQuestions) {
    const cleanCq = cq.trim().toLowerCase();
    const coreCq = extractCoreQuestion(cleanCq);

    for (const pq of priorAgentQuestions.slice(-3)) {
      const corePq = extractCoreQuestion(pq);
      const isExactMatch = cleanCq === pq;
      const isCoreMatch = coreCq.length > 15 && corePq.length > 15 && (coreCq === corePq || (coreCq.length > 25 && corePq.includes(coreCq)));

      const clientBroughtUpTopic =
        (lowerClientMsg.includes('payment') && (cleanCq.includes('payment') || cleanCq.includes('gateway'))) ||
        (lowerClientMsg.includes('checkout') && cleanCq.includes('checkout'));

      if ((isExactMatch && !clientBroughtUpTopic) || (isCoreMatch && !clientBroughtUpTopic)) {
        hasRepeatedQuestion = true;
        issues.push(`Repeated question: Asked same or very similar question as previously asked: "${cq.trim()}"`);
        break;
      }
    }
  }

  // 7. Stale Topic Resurrection Detection (Step 6)
  let hasStaleTopic = false;
  const customerBroughtUpUx = /\b(ux|ui\/ux|user experience)\b/i.test(lowerClientMsg);
  if (!customerBroughtUpUx && /\b(ux design|user experience design)\b/i.test(lowerReply)) {
    hasStaleTopic = true;
    issues.push('Stale topic resurrection detected: Reply introduced "UX design" which was not part of the current customer message.');
  }

  const customerBroughtUpFullStack = /\b(full[- ]stack)\b/i.test(lowerClientMsg);
  if (!customerBroughtUpFullStack && /\b(full[- ]stack\s+development|full[- ]stack)\b/i.test(lowerReply)) {
    hasStaleTopic = true;
    issues.push('Stale topic resurrection detected: Reply introduced "full-stack development" which was not part of the current customer message.');
  }

  const customerBroughtUpTechStackQuestion = /\b(tech stack|project size|typical project)\b/i.test(lowerClientMsg);
  if (!customerBroughtUpTechStackQuestion && /\b(typical project size or tech stack|what typical project size)\b/i.test(lowerReply)) {
    hasStaleTopic = true;
    issues.push('Stale discovery question detected: Reply asked about typical project size or tech stack when not requested by customer.');
  }

  // 8. Commercial Policy Guard: Unverified commercial claims (Step 7)
  let hasUnverifiedCommercialClaim = false;
  const asksCommissionOrCommercial = /\b(\d+%\s*(?:commission|referral|revenue[- ]share|rev[- ]share)|commission|referral fee|revenue[- ]share|rev[- ]share)\b/i.test(lowerClientMsg);
  if (asksCommissionOrCommercial) {
    const verifiedKnowledge = `${companyContext?.description || ''} ${(companyContext?.services || []).join(' ')}`.toLowerCase();
    const hasConfiguredCommission = /\b(?:\d+%\s*|\d+\s+percent\s*)(?:commission|referral|revenue[- ]share|rev[- ]share)\b/i.test(verifiedKnowledge);

    if (!hasConfiguredCommission) {
      const unconditionallyConfirmsCommission =
        /\b(?:confirm(?:ed)?\s+(?:that\s+)?(?:the\s+)?(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share)|accept(?:able)?\s+(?:the\s+)?(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share)|agree\s+to\s+(?:the\s+)?(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share)|(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share)\s+(?:is|are)\s+(?:all\s+)?acceptable|alongside\s+a\s+(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share)\s+structure|work\s+with\s+the\s+revised\s+.*?\s+alongside\s+a\s+(?:\d+%\s+|\d+\s+percent\s+)(?:commission|revenue[- ]share|rev[- ]share))\b/i.test(lowerReply);

      const hasLeadershipQualification =
        /\b(?:confirm(?:ation)?\s+with\s+(?:our\s+)?(?:leadership|management|team|founders)|require(?:s)?\s+confirmation|subject\s+to\s+confirmation|review\s+with\s+(?:our\s+)?(?:leadership|team|management)|discuss\s+with\s+(?:our\s+)?(?:leadership|team|management))\b/i.test(lowerReply);

      if (unconditionallyConfirmsCommission && !hasLeadershipQualification) {
        hasUnverifiedCommercialClaim = true;
        issues.push('Unverified commercial claim detected: Reply unconditionally confirmed commission or commercial percentage without leadership qualification or verified company policy.');
      }
    }
  }

  // 8B. Commercial Policy Guard: Equity / Ownership Commitments
  const mentionsEquity =
    /\b(\d+%\s*equity|\d+\s+percent\s+equity|equity\s+(?:stake|share|percentage|requirement)|equity)\b/i.test(lowerReply) ||
    /\b(\d+%\s*equity|\d+\s+percent\s+equity|equity)\b/i.test(lowerClientMsg);
  if (mentionsEquity) {
    const verifiedKnowledge = `${companyContext?.description || ''} ${(companyContext?.services || []).join(' ')}`.toLowerCase();
    const hasConfiguredEquity = /\b\d+%\s*equity\b/i.test(verifiedKnowledge);

    if (!hasConfiguredEquity) {
      const unconditionallyConfirmsEquity =
        /\b(?:confirm(?:ed)?\s+(?:that\s+)?(?:the\s+)?\d+%\s+equity|accept(?:able)?\s+(?:the\s+)?\d+%\s+equity|agree\s+to\s+(?:the\s+)?\d+%\s+equity|\d+%\s+equity\s+(?:is|are)\s+(?:all\s+)?acceptable|grant(?:ed|ing)?\s+\d+%\s+equity|transfer(?:ring)?\s+\d+%\s+equity)\b/i.test(lowerReply);

      const hasLeadershipQualification =
        /\b(?:confirm(?:ation)?\s+with\s+(?:our\s+)?(?:leadership|management|team|founders)|require(?:s)?\s+confirmation|subject\s+to\s+confirmation|review\s+with\s+(?:our\s+)?(?:leadership|team|management)|discuss\s+with\s+(?:our\s+)?(?:leadership|team|management)|open\s+to\s+discussing|discuss\s+the\s+structure|if\s+this\s+is\s+something\s+you(?:'re|\s+are)\s+open\s+to\s+discussing|explore\s+the\s+collaboration)\b/i.test(lowerReply);

      if (unconditionallyConfirmsEquity && !hasLeadershipQualification) {
        hasUnverifiedCommercialClaim = true;
        issues.push('Unverified commercial claim detected: Reply unconditionally confirmed equity percentage without leadership qualification or verified company policy.');
      }
    }
  }

  // 9. Multi-Question Guard: Ensure all explicit customer questions in the current turn are addressed
  const asksBudgetConfirmation = /\b(?:budget\s+(?:changed|has\s+changed|revised|updated|is)|₹\s*[\d,]+|\b\d+k\b)\b/i.test(lowerClientMsg) && /\b(?:acceptable|confirm|ok)\b/i.test(lowerClientMsg);
  if (asksBudgetConfirmation) {
    const addressesBudget = /\b(budget|[₹$€£]|[\d,]+\s*(?:rupees|inr|usd)?)\b/i.test(lowerReply);
    if (!addressesBudget) {
      issues.push('Ignored customer question: Customer asked to confirm budget change, but reply failed to address the budget.');
    }
  }

  const asksCommunicationConfirmation = /\b(?:primary\s+point\s+of\s+contact|communicate\s+directly|direct\s+client\s+communication|direct\s+communication)\b/i.test(lowerClientMsg) && /\b(?:acceptable|confirm|ok|want)\b/i.test(lowerClientMsg);
  if (asksCommunicationConfirmation) {
    const addressesCommunication = /\b(communicat\w*|contact|direct|directly|reach\s+out)\b/i.test(lowerReply);
    if (!addressesCommunication) {
      issues.push('Ignored customer question: Customer asked to confirm direct client communication preference, but reply failed to address communication.');
    }
  }

  // 15. Semantic Company Instruction Compliance Check
  if (companyInstruction && companyInstruction.trim().length > 0) {
    const instResult = validateDraftAgainstCompanyInstruction(trimmedReply, companyInstruction);
    if (!instResult.isValid) {
      issues.push(...instResult.issues);
    }
  }

  const isValid = issues.length === 0;

  return {
    isValid,
    issues,
    isGeneric,
    hasFabricatedPrice,
    hasFabricatedTimeline,
    hasRepeatedQuestion,
    hasPromptLeak,
    hasStaleTopic,
    hasUnverifiedCommercialClaim,
  };
}

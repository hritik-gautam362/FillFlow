/**
 * Structured Conversation Memory and Context Contract.
 *
 * Implements the core invariant:
 *   CURRENT MESSAGE = WHAT TO ANSWER
 *   THREAD HISTORY  = CONTEXT FOR ANSWERING IT
 *
 * Maintains cumulative customer facts across all turns in a thread,
 * tracks conversation state, and ensures no context is ever lost.
 */

import { ExtractedRequirements, CompanyContext } from './types';
import {
  sanitizeTextForFactExtraction,
  DetectedPlaceholder,
} from './placeholderDetector';

export interface CurrentTurnRequirement {
  type: 'commercial_policy' | 'communication_preference' | 'budget_change' | 'timeline_change' | 'general_question' | 'scope_correction';
  topic: string;
  requestedValue?: string;
  previousValue?: string;
  currentValue?: string;
  status?: 'verified' | 'unverified';
  description: string;
}

export interface CustomerFacts {
  businessType?: string;
  projectType?: string;
  budget?: string;
  timeline?: string;
  productCount?: string;
  features: string[];
  techStack: string[];
  integrations: string[];
  paymentRequirements?: string;
  checkoutPreference?: string;
  unresolvedPlaceholders: string[];
  confirmedDetails: string[];
}

export interface ConversationStateContext {
  currentIntent: string;
  previousIntent?: string;
  activeTopic?: string;
  latestCustomerRequest: string;
  latestCustomerQuestions: string[];
  currentTurnRequirements: CurrentTurnRequirement[];
  previousAgentQuestions: string[];
  isEstablishedThread: boolean;
  turnCount: number;
  hasExplicitCurrentQuestion: boolean;
  currentQuestionTopic?: 'agency_geography' | 'pricing' | 'partnership' | 'services_capability' | 'timing_availability' | 'general';
}

export interface StructuredConversationContext {
  facts: CustomerFacts;
  state: ConversationStateContext;
  currentTurnRequirements: CurrentTurnRequirement[];
  unresolvedPlaceholders: DetectedPlaceholder[];
  summaryText: string;
}

/**
 * Extracts and merges facts cumulatively across an entire conversation thread.
 */
export function buildStructuredConversationContext(params: {
  history: Array<{ sender: 'client' | 'agent' | 'system'; text: string }>;
  latestMessage: string;
  previousRequirements?: Partial<ExtractedRequirements>;
  companyContext?: CompanyContext;
  currentIntent?: string;
  previousIntent?: string;
  subject?: string;
}): StructuredConversationContext {
  const {
    history,
    latestMessage,
    previousRequirements = {},
    companyContext,
    currentIntent = 'general_inquiry',
    previousIntent,
    subject = '',
  } = params;

  const allMessages = [...history, { sender: 'client' as const, text: latestMessage }];
  const clientMessages = allMessages.filter((m) => m.sender === 'client');
  const agentMessages = allMessages.filter((m) => m.sender === 'agent');

  // Track unresolved placeholders in latest message
  const { placeholders: latestPlaceholders } =
    sanitizeTextForFactExtraction(latestMessage);

  const facts: CustomerFacts = {
    features: [],
    techStack: [],
    integrations: [],
    unresolvedPlaceholders: latestPlaceholders.map((p) => p.raw),
    confirmedDetails: [],
  };

  // 1. Seed with previous requirements
  if (previousRequirements.businessType) facts.businessType = previousRequirements.businessType;
  if (previousRequirements.projectType) facts.projectType = previousRequirements.projectType;
  if (previousRequirements.budget) facts.budget = previousRequirements.budget;
  if (previousRequirements.timeline) facts.timeline = previousRequirements.timeline;
  if (previousRequirements.productCount) facts.productCount = previousRequirements.productCount;
  if (previousRequirements.paymentGateway) facts.paymentRequirements = previousRequirements.paymentGateway;
  if (previousRequirements.checkoutPreference) facts.checkoutPreference = previousRequirements.checkoutPreference;

  const featureSet = new Set<string>();
  const addFeature = (f: string) => {
    const key = f.toLowerCase().trim();
    if (key.length >= 2 && !featureSet.has(key)) {
      featureSet.add(key);
      facts.features.push(f.trim());
    }
  };
  (previousRequirements.features || []).forEach(addFeature);
  (previousRequirements.techStack || []).forEach((t) => facts.techStack.push(t));
  (previousRequirements.integrations || []).forEach((i) => facts.integrations.push(i));

  // 2. Scan conversation chronology from earliest to latest to accumulate and update facts
  for (const msg of clientMessages) {
    const rawText = msg.text || '';
    const { sanitizedText } = sanitizeTextForFactExtraction(rawText);
    const lower = sanitizedText.toLowerCase();

    // Business domain
    if (/\b(?:clothing|apparel|fashion|garments?|clothing\s+business|clothing\s+brand)\b/i.test(lower)) {
      facts.businessType = 'clothing business';
    } else if (/\b(?:construction|contractor|builder|building|remodeling)\b/i.test(lower)) {
      facts.businessType = 'construction company';
    } else if (/\b(?:photography|photographer|photo\s*studio)\b/i.test(lower)) {
      facts.businessType = 'commercial photography business';
    } else if (/\b(?:saas|b2b\s+saas|software-as-a-service)\b/i.test(lower)) {
      facts.businessType = 'B2B SaaS product';
    } else if (/\b(?:dental|dentist|clinic|doctor|healthcare|medical)\b/i.test(lower)) {
      facts.businessType = 'medical / healthcare practice';
    } else if (/\b(?:law|legal|attorney|lawyer)\b/i.test(lower)) {
      facts.businessType = 'law firm';
    } else if (/\b(?:restaurant|cafe|bakery|catering|food|bistro)\b/i.test(lower)) {
      facts.businessType = 'restaurant / food business';
    } else if (/\b(?:retail|shop|store|boutique|ecommerce|e-commerce|online\s+store)\b/i.test(lower)) {
      if (!facts.businessType) facts.businessType = 'retail / ecommerce business';
    }

    // Project type
    if (/\b(?:online\s+store|ecommerce(?:\s+website|\s+store)?|e-commerce(?:\s+website|\s+store)?)\b/i.test(lower)) {
      facts.projectType = facts.businessType ? `online store for ${facts.businessType}` : 'online store website';
    } else if (/\binventory\s*(?:management)?\s*(?:portal|system|software|app)\b/i.test(lower) || /\binventory\s+portal\b/i.test(lower)) {
      facts.projectType = 'inventory management portal';
    } else if (/\b(?:client\s+portal|customer\s+portal|patient\s+portal|partner\s+portal)\b/i.test(lower)) {
      const portalMatch = lower.match(/\b(?:client|customer|patient|partner)\s+portal\b/i);
      facts.projectType = portalMatch ? portalMatch[0].toLowerCase() : 'portal';
    } else if (/\b(?:portal|web\s+portal|admin\s+portal|dashboard)\b/i.test(lower)) {
      facts.projectType = 'portal';
    } else if (/\b(?:website|web\s*site|landing\s*page)\b/i.test(lower)) {
      facts.projectType = facts.businessType ? `website for ${facts.businessType}` : 'professional website';
    } else if (/\b(?:mobile\s*app|ios\s*app|android\s*app|app\s*development)\b/i.test(lower)) {
      facts.projectType = 'mobile application';
    }

    // Budget extraction & updates (supports explicit corrections like "changed from ₹3 lakh to ₹80,000", "changed to Y", "actually meant Y not X")
    const budgetChangeMatch = sanitizedText.match(
      /(?:budget(?:\s+for\s+[^.]+?)?\s+(?:has\s+)?changed\s+from\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)\s+to\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)|(?:budget(?:\s+for\s+[^.]+?)?\s+(?:has\s+)?changed\s+to|change(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|increase(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|reduce(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|lower(?:ed)?(?:\s+my|\s+our)?\s+budget\s+to|budget\s+(?:is|has\s+increased\s+to|increased\s+to|now))\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)|actually,?\s+(?:i|we)\s+meant\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+),?\s+not\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+))/i
    );
    if (budgetChangeMatch) {
      const candidate = (budgetChangeMatch[2] || budgetChangeMatch[3] || budgetChangeMatch[4] || '').replace(/[,;.]+$/, '').trim();
      if (candidate) {
        facts.budget = candidate;
      }
    } else if (!facts.budget) {
      const budgetMatch = sanitizedText.match(
        /(?:\$|€|£|₹|Rs\.?|INR|USD)\s*[\d,]+(?:\.\d+)?|\b\d+(?:,\d+)*(?:\s*(?:k|thousand|lakh|crore))\b/i
      );
      if (budgetMatch) {
        facts.budget = budgetMatch[0].trim();
      }
    }

    // Timeline extraction & updates
    const timelineUpdate = sanitizedText.match(
      /\b(?:push(?:ed)?\s+(?:the\s+)?(?:target\s+)?launch\s+to|moved?\s+(?:to|to\s+launch\s+in)|launch\s+(?:in|by|before)|ready\s+by|complete\s+by|deadline\s+(?:is|by))\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+|[a-z]+(?:\s+\d{4})?|\d+\s+(?:weeks?|months?|days?))\b/i
    );
    if (timelineUpdate && timelineUpdate[1]) {
      facts.timeline = `by ${timelineUpdate[1].trim()}`;
    } else if (!facts.timeline) {
      const timelineMatch = sanitizedText.match(
        /\b(?:before|by|in|within)\s+(?:(?:\d+\s+(?:weeks?|months?|days?))|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+(?:\s+\d{4})?|q[1-4]|end\s+of\s+[a-z]+|[a-z]+(?:\s+\d{4})?)\b/i
      );
      if (timelineMatch) {
        facts.timeline = timelineMatch[0].trim();
      }
    }

    // Product count extraction & updates
    const prodCountMatch = sanitizedText.match(
      /(?:start\s+with|around|approximately|~)?\s*(\d+)\s+(?:curated\s+)?products?/i
    );
    if (prodCountMatch) {
      facts.productCount = `around ${prodCountMatch[1]} products`;
    }

    // Feature additions
    if (/\b(?:online\s+payments?|payment\s+gateways?|payment\s+processing|payments?|payment\s+integration)\b/i.test(lower)) {
      addFeature('online payment gateway');
    }
    if (prodCountMatch) {
      addFeature(`${prodCountMatch[1]} products catalog`);
    } else if (/\bproducts?\s+catalog|product\s+pages?\b/i.test(lower)) {
      addFeature('product catalog');
    }
    if (/\b(?:customer\s+login|user\s+accounts?|client\s+portal|sign\s*in|login)\b/i.test(lower)) {
      addFeature('customer login');
    }
    if (/\b(?:order\s+tracking|track(?:ing)?\s+orders?)\b/i.test(lower)) {
      addFeature('order tracking');
    }
    if (/\b(?:gallery|portfolio|portfolio\s+section|image\s+gallery|photo\s+gallery|client\s+albums?)\b/i.test(lower)) {
      addFeature('portfolio gallery');
    }
    if (/\b(?:booking(?:\s+inquiry)?(?:\s+form)?|booking\s+form|online\s+booking)\b/i.test(lower)) {
      addFeature('booking inquiry form');
    }
    if (/\b(?:pricing\s+(?:tier\s+)?comparison|pricing\s+page|pricing\s+table|billing\s+toggles?)\b/i.test(lower)) {
      addFeature('pricing comparison page');
    }
    if (/\b(?:hubspot|lead\s+routing|crm\s+integration|automated\s+lead\s+routing)\b/i.test(lower)) {
      addFeature('HubSpot and automated lead routing');
    }
    if (/\b(?:dashboard\s+link|customer\s+portal\s+dashboard|api\s+documentation)\b/i.test(lower)) {
      addFeature('customer portal dashboard');
    }

    // Explicit payment provider selections outside placeholders
    const explicitRazorpay = /\b(?:decided\s+to\s+use|prefer|using|integrate|want)\s+razorpay\b/i.test(sanitizedText);
    const explicitStripe = /\b(?:decided\s+to\s+use|prefer|using|integrate|want)\s+stripe\b/i.test(sanitizedText);
    const explicitPaytm = /\b(?:decided\s+to\s+use|prefer|using|integrate|want)\s+paytm\b/i.test(sanitizedText);
    if (explicitRazorpay) facts.paymentRequirements = 'Razorpay';
    else if (explicitStripe) facts.paymentRequirements = 'Stripe';
    else if (explicitPaytm) facts.paymentRequirements = 'Paytm';

    // Explicit checkout preference outside placeholders
    const explicitGuest = /\b(?:want|prefer|need)\s+guest\s+checkout\b/i.test(sanitizedText);
    const explicitStandard = /\b(?:want|prefer|need)\s+standard\s+checkout\b/i.test(sanitizedText);
    const explicitMultiStep = /\b(?:want|prefer|need)\s+multi-step\s+checkout\b/i.test(sanitizedText);
    if (explicitGuest) facts.checkoutPreference = 'Guest checkout';
    else if (explicitStandard) facts.checkoutPreference = 'Standard checkout';
    else if (explicitMultiStep) facts.checkoutPreference = 'Multi-step checkout';
  }

  // If latest message has placeholders for payment/checkout, mark them as unresolved unless explicitly chosen
  if (latestPlaceholders.some((p) => p.label.toLowerCase().includes('payment') || p.label.toLowerCase().includes('razorpay'))) {
    if (!facts.paymentRequirements || facts.paymentRequirements === 'not yet selected') {
      facts.paymentRequirements = 'Unresolved (options in template, awaiting customer choice)';
    }
  }
  if (latestPlaceholders.some((p) => p.label.toLowerCase().includes('checkout') || p.label.toLowerCase().includes('standard'))) {
    if (!facts.checkoutPreference || facts.checkoutPreference === 'not yet selected') {
      facts.checkoutPreference = 'Unresolved (options in template, awaiting customer choice)';
    }
  }

  // 3. Extract customer questions, corrections & current-turn requirements from latest message
  const currentTurnRequirements: CurrentTurnRequirement[] = [];
  const { sanitizedText: latestSanitized } = sanitizeTextForFactExtraction(latestMessage);
  const latestLower = latestSanitized.toLowerCase();

  // A. Budget Change Detection in Latest Message
  const latestBudgetChange = latestSanitized.match(
    /(?:budget(?:\s+for\s+[^.]+?)?\s+(?:has\s+)?changed\s+from\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)\s+to\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)|(?:budget(?:\s+for\s+[^.]+?)?\s+(?:has\s+)?changed\s+to|change(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|increase(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|reduce(?:d)?(?:\s+my|\s+our)?\s+budget\s+to|lower(?:ed)?(?:\s+my|\s+our)?\s+budget\s+to|budget\s+(?:is|has\s+increased\s+to|increased\s+to|now))\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+)|actually,?\s+(?:i|we)\s+meant\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+),?\s+not\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?|[₹$€£]\s*[\d,]+))/i
  );
  if (latestBudgetChange) {
    const prevVal = (latestBudgetChange[1] || latestBudgetChange[5] || previousRequirements.budget || '').replace(/[,;.]+$/, '').trim();
    const currVal = (latestBudgetChange[2] || latestBudgetChange[3] || latestBudgetChange[4] || '').replace(/[,;.]+$/, '').trim();
    if (currVal) {
      facts.budget = currVal;
      const isActualChange =
        Boolean(latestBudgetChange[1] || latestBudgetChange[5]) ||
        /\b(?:changed|change|revised|actually|reduce|lower|increase)\b/i.test(latestBudgetChange[0]) ||
        Boolean(previousRequirements.budget && previousRequirements.budget !== currVal.trim());
      if (isActualChange) {
        currentTurnRequirements.push({
          type: 'budget_change',
          topic: 'project_budget',
          previousValue: prevVal ? prevVal.trim() : undefined,
          currentValue: currVal.trim(),
          description: `Budget changed${prevVal ? ` from ${prevVal.trim()}` : ''} to ${currVal.trim()}`,
        });
      }
    }
  }

  // B. Communication / Contact Preference Change in Latest Message
  if (
    /\b(?:not\s+want\s+to\s+remain\s+the\s+primary\s+point\s+of\s+contact|want\s+[^.]+?\s+to\s+(?:communicate|speak|work|deal)\s+directly\s+with\s+the\s+client|direct\s+(?:client\s+)?(?:communication|contact)|(?:communicate|speak)\s+directly\s+with\s+the\s+client)\b/i.test(latestLower)
  ) {
    const wantsDirect = /\b(?:(?:communicate|speak)\s+directly|direct\s+(?:client\s+)?(?:communication|contact))\b/i.test(latestLower) && !/\b(?:do\s+not\s+want\s+direct|no\s+direct)\b/i.test(latestLower);
    const prefValue = wantsDirect
      ? `${companyContext?.name || 'Our team'} communicates directly with client after introduction`
      : 'Agency remains primary point of contact';
    currentTurnRequirements.push({
      type: 'communication_preference',
      topic: 'client_contact',
      requestedValue: prefValue,
      description: `Client contact preference: ${prefValue}`,
    });
  }

  // C. Commercial Policy / Commission Terms Inquiry in Latest Message
  const commissionMatch = latestSanitized.match(/\b(\d{1,2}%\s*(?:commission|referral\s+fee|cut)|referral\s+commission|revenue\s+share|commission)\b/i);
  if (commissionMatch) {
    const requestedVal = commissionMatch[0].trim();
    const verifiedKnowledge = `${companyContext?.pricingPolicy || ''} ${companyContext?.description || ''}`.toLowerCase();
    const isVerified = verifiedKnowledge.includes(requestedVal.toLowerCase());
    currentTurnRequirements.push({
      type: 'commercial_policy',
      topic: 'commission',
      requestedValue: requestedVal,
      status: isVerified ? 'verified' : 'unverified',
      description: `${requestedVal} (${isVerified ? 'verified company policy' : 'unverified commercial policy — requires confirmation by company leadership'})`,
    });
  }

  // D. Explicit Customer Questions in Latest Message
  const latestCustomerQuestions: string[] = [];
  const latestSentences = latestMessage.split(/(?<=[.?!])\s+/);
  for (const s of latestSentences) {
    const trimmed = s.trim();
    if (
      trimmed.includes('?') ||
      /\b(?:please\s+let\s+me\s+know|can\s+you\s+(?:confirm|tell\s+me)|could\s+you\s+(?:confirm|tell\s+me)|whether\s+you|would\s+that\s+change|how\s+this\s+impacts?|what\s+can\s+you\s+provide|do\s+you\s+(?:also\s+)?work\s+with)\b/i.test(trimmed)
    ) {
      latestCustomerQuestions.push(trimmed);
      if (!currentTurnRequirements.some(r => r.description.includes(trimmed))) {
        currentTurnRequirements.push({
          type: 'general_question',
          topic: 'customer_question',
          description: trimmed,
        });
      }
    }
  }

  // Compile confirmed details summary list (ensuring updated budget wins)
  if (facts.businessType) facts.confirmedDetails.push(`Business Type: ${facts.businessType}`);
  if (facts.projectType) facts.confirmedDetails.push(`Project: ${facts.projectType}`);
  if (facts.budget) facts.confirmedDetails.push(`Budget: ${facts.budget}`);
  if (facts.timeline) facts.confirmedDetails.push(`Launch Timeline: ${facts.timeline}`);
  if (facts.productCount) facts.confirmedDetails.push(`Product Count: ${facts.productCount}`);
  if (facts.features.length > 0) facts.confirmedDetails.push(`Features / Scope: ${facts.features.join(', ')}`);
  if (facts.paymentRequirements && !facts.paymentRequirements.includes('Unresolved')) {
    facts.confirmedDetails.push(`Payment Gateway: ${facts.paymentRequirements}`);
  }

  const hasExplicitCurrentQuestion = latestCustomerQuestions.length > 0;
  let currentQuestionTopic: ConversationStateContext['currentQuestionTopic'] = undefined;
  if (hasExplicitCurrentQuestion) {
    const qText = latestCustomerQuestions.join(' ').toLowerCase();
    if (/\b(?:work\s+with\s+agencies|agencies\s+outside|outside\s+india|international\s+clients?|overseas|foreign|globally)\b/i.test(qText)) {
      currentQuestionTopic = 'agency_geography';
    } else if (/\b(?:pricing|price|cost|quote|rates?|fee|estimate)\b/i.test(qText)) {
      currentQuestionTopic = 'pricing';
    } else if (/\b(?:partner|partnership|collaborat)\b/i.test(qText)) {
      currentQuestionTopic = 'partnership';
    } else if (/\b(?:services?|capability|tech\s+stack|build|develop)\b/i.test(qText)) {
      currentQuestionTopic = 'services_capability';
    } else if (/\b(?:timeline|start|available|when\s+can)\b/i.test(qText)) {
      currentQuestionTopic = 'timing_availability';
    } else {
      currentQuestionTopic = 'general';
    }
  }

  // Extract previous agent questions to avoid repetition
  const previousAgentQuestions: string[] = [];
  for (const msg of agentMessages) {
    const sentences = msg.text.split(/(?<=[.?!])\s+/);
    for (const s of sentences) {
      if (s.includes('?') && s.trim().length > 10) {
        previousAgentQuestions.push(s.trim().replace(/\?+$/, '?'));
      }
    }
  }

  const isEstablishedThread =
    history.length > 0 ||
    Boolean(facts.budget) ||
    Boolean(facts.timeline) ||
    Boolean(facts.businessType) ||
    facts.features.length > 0;

  // Active topic synthesis
  let activeTopic = facts.projectType || facts.businessType || 'Project Inquiry';
  if (subject && !subject.toLowerCase().startsWith('re:')) {
    activeTopic = subject;
  }

  const state: ConversationStateContext = {
    currentIntent,
    previousIntent,
    activeTopic,
    latestCustomerRequest: latestCustomerQuestions[0] || latestMessage.substring(0, 150),
    latestCustomerQuestions,
    currentTurnRequirements,
    previousAgentQuestions: previousAgentQuestions.slice(-5),
    isEstablishedThread,
    turnCount: Math.ceil((allMessages.length) / 2),
    hasExplicitCurrentQuestion,
    currentQuestionTopic,
  };

  // Human-readable summary text for prompt injection
  const summaryLines: string[] = [];
  summaryLines.push(`ACTIVE BUSINESS THREAD STATUS: Turn ${state.turnCount} (${isEstablishedThread ? 'Established Thread' : 'New Inquiry'})`);

  if (currentTurnRequirements.length > 0) {
    summaryLines.push(`\nCURRENT-TURN REQUIREMENTS & QUESTIONS (HIGHEST PRIORITY — MUST ADDRESS FIRST):`);
    for (const req of currentTurnRequirements) {
      if (req.type === 'commercial_policy' && req.status === 'unverified') {
        summaryLines.push(`- [UNVERIFIED COMMERCIAL POLICY]: "${req.requestedValue || req.description}" -> DO NOT casually confirm as policy! State that this requires confirmation by company leadership.`);
      } else if (req.type === 'budget_change') {
        summaryLines.push(`- [BUDGET CORRECTION]: ${req.description} (Overrides any previous budget!)`);
      } else if (req.type === 'communication_preference') {
        summaryLines.push(`- [COMMUNICATION PREFERENCE]: ${req.requestedValue || req.description}`);
      } else {
        summaryLines.push(`- [REQUIRED ANSWER]: "${req.description}"`);
      }
    }
    summaryLines.push(`CRITICAL DIRECTIVE: You MUST address the customer's newest questions and corrections directly in your opening sentences. DO NOT continue previous conversation threads while current questions are pending.`);
  }

  if (facts.confirmedDetails.length > 0) {
    summaryLines.push(`\nCONFIRMED CUSTOMER FACTS:`);
    for (const d of facts.confirmedDetails) {
      summaryLines.push(`- ${d}`);
    }
  }
  if (latestPlaceholders.length > 0) {
    summaryLines.push(`\nUNRESOLVED CUSTOMER PLACEHOLDERS (DO NOT CLAIM THESE WERE CHOSEN):`);
    for (const p of latestPlaceholders) {
      summaryLines.push(`- "${p.raw}" -> Options mentioned: ${p.options.join(', ') || 'Template options'}`);
    }
  }
  if (state.previousAgentQuestions.length > 0) {
    summaryLines.push(`\nQUESTIONS ALREADY ASKED BY US (DO NOT REPEAT):`);
    for (const q of state.previousAgentQuestions) {
      summaryLines.push(`- "${q}"`);
    }
  }

  return {
    facts,
    state,
    currentTurnRequirements,
    unresolvedPlaceholders: latestPlaceholders,
    summaryText: summaryLines.join('\n'),
  };
}

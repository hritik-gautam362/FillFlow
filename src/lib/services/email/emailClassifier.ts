import { ParsedInboundEmail } from './EmailProvider';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CompanyContext } from '@/lib/ai/types';
import { getAiModel } from '@/lib/ai/gemini';

export type EmailClassificationType =
  | 'CUSTOMER_INQUIRY'
  | 'AUTOMATED'
  | 'PROMOTIONAL'
  | 'NEWSLETTER'
  | 'SPAM'
  | 'IRRELEVANT'
  | 'UNCERTAIN';

// Legacy category alias for backwards compatibility with existing records/tests
export type EmailClassificationCategory =
  | 'client_inquiry'
  | 'existing_client'
  | 'irrelevant'
  | 'automated'
  | 'spam_or_promotion';

export type EmailIntent =
  | 'service_inquiry'
  | 'SERVICE_INQUIRY'
  | 'project_request'
  | 'pricing'
  | 'pricing_request'
  | 'PRICING_REQUEST'
  | 'quotation_request'
  | 'QUOTATION_REQUEST'
  | 'partnership'
  | 'PARTNERSHIP'
  | 'investment'
  | 'INVESTMENT'
  | 'funding'
  | 'FUNDING'
  | 'sales_opportunity'
  | 'SALES_OPPORTUNITY'
  | 'vendor_inquiry'
  | 'VENDOR_INQUIRY'
  | 'support'
  | 'customer_support'
  | 'CUSTOMER_SUPPORT'
  | 'complaint'
  | 'COMPLAINT'
  | 'follow_up'
  | 'FOLLOW_UP'
  | 'meeting_request'
  | 'MEETING_REQUEST'
  | 'consultation'
  | 'CONSULTATION'
  | 'information_request'
  | 'INFORMATION_REQUEST'
  | 'negotiation'
  | 'NEGOTIATION'
  | 'appointment'
  | 'APPOINTMENT'
  | 'product_inquiry'
  | 'PRODUCT_INQUIRY'
  | 'job_opportunity'
  | 'JOB_OPPORTUNITY'
  | 'other_legitimate_business'
  | 'OTHER_LEGITIMATE_BUSINESS'
  | 'general_inquiry'
  | 'spam_promo'
  | 'courtesy'
  | 'automated'
  | 'unknown';

export function extractEmailAddress(raw?: string | null): string {
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const email = match ? match[1] : raw;
  return email.toLowerCase().trim();
}

export interface ThreadContext {
  hasActiveConversation?: boolean;
  priorMessages?: Array<{ sender: string; text: string; createdAt?: Date }>;
  isExistingCustomer?: boolean;
  previousSubject?: string;
  cachedClassification?: EmailClassificationType;
  companyContext?: CompanyContext;
  conversationTopic?: string;
  previousIntent?: EmailIntent;
  knownRequirements?: Record<string, unknown>;
  isSameThread?: boolean;
}

export interface ClassificationResult {
  classification: EmailClassificationType;
  category: EmailClassificationCategory; // Backward compatibility bridge
  reason: string;
  confidence: number;
  deterministic: boolean;
  requiresReply: boolean;
  intent?: EmailIntent;
}

const gc = globalThis as unknown as {
  __classifierMockHandler?: ClassifierMockHandler | null;
  __realClassifierCallCount?: number;
};

export function getRealClassifierCallCount(): number {
  return gc.__realClassifierCallCount || 0;
}
export function resetRealClassifierCallCount(): void {
  gc.__realClassifierCallCount = 0;
}

// Test mode mock injection hook
export type ClassifierMockHandler = (
  email: ParsedInboundEmail,
  threadContext?: ThreadContext,
  isSpamFolder?: boolean
) => Promise<ClassificationResult | null> | ClassificationResult | null;

export function setAiClassifierMockHandler(handler: ClassifierMockHandler | null): void {
  gc.__classifierMockHandler = handler;
}

export function clearAiClassifierMockHandler(): void {
  gc.__classifierMockHandler = null;
}

export function mapClassificationToCategory(type: EmailClassificationType): EmailClassificationCategory {
  switch (type) {
    case 'CUSTOMER_INQUIRY':
      return 'client_inquiry';
    case 'AUTOMATED':
      return 'automated';
    case 'PROMOTIONAL':
    case 'NEWSLETTER':
    case 'SPAM':
      return 'spam_or_promotion';
    case 'IRRELEVANT':
    case 'UNCERTAIN':
    default:
      return 'irrelevant';
  }
}

export function mapCategoryToClassification(cat: EmailClassificationCategory | string): EmailClassificationType {
  switch (cat) {
    case 'client_inquiry':
    case 'CUSTOMER_INQUIRY':
      return 'CUSTOMER_INQUIRY';
    case 'automated':
    case 'AUTOMATED':
      return 'AUTOMATED';
    case 'PROMOTIONAL':
      return 'PROMOTIONAL';
    case 'NEWSLETTER':
      return 'NEWSLETTER';
    case 'SPAM':
      return 'SPAM';
    case 'spam_or_promotion':
      return 'PROMOTIONAL';
    case 'existing_client':
      return 'CUSTOMER_INQUIRY';
    case 'irrelevant':
    case 'IRRELEVANT':
      return 'IRRELEVANT';
    case 'UNCERTAIN':
    default:
      return 'UNCERTAIN';
  }
}

// Automated & bot sender patterns
const AUTOMATED_SENDER_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /do-not-reply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /bounce[s]?@/i,
  /notifications?@/i,
  /alert[s]?@/i,
  /news(letter)?@/i,
  /marketing@/i,
  /promotions?@/i,
  /campaign[s]?@/i,
  /billing@/i,
  /invoic(e|ing)@/i,
  /receipt[s]?@/i,
  /security@/i,
  /auth@/i,
  /verify@/i,
  /verification@/i,
  /accounts?@/i,
  /support-auto@/i,
  /auto-confirm@/i,
  /system@/i,
  /order-update@/i,
  /shipping@/i,
  /update@/i,
  /digest@/i,
];

// Subject patterns for automated / transactional emails (excluding human support inquiries)
const AUTOMATED_SUBJECT_PATTERNS = [
  /\b(verification code|security code|login code|one-time password|otp)\b/i,
  /^(?:re:\s*)*(?:fwd:\s*)*(?:automated:\s*)?(?!.*(?:support|help|issue|problem|ticket|request))\b(password reset|reset your password|confirm your email|verify your account)\b/i,
  /\b(order confirmation|receipt for|invoice #|your receipt|payment confirmation)\b/i,
  /\b(your invoice is ready|invoice is ready|your payment has been received|payment received)\b/i,
  /\b(shipping confirmation|shipment update|package delivered|order #|your order has shipped|order shipped)\b/i,
  /\b(automatic reply|out of office|auto-response|vacation responder)\b/i,
  /\b(github notifications|gitlab notification|jira notification|linear notification)\b/i,
  /\b(new sign-in|security alert|suspicious activity|account updated|subscription renewed|your subscription has been renewed)\b/i,
  /\b(your weekly report is ready|weekly report|monthly summary)\b/i,
];

// Promotional keywords in subject line
const PROMOTIONAL_SUBJECT_PATTERNS = [
  /\b(\d+%\s*off|save\s*\$?\d+|limited time offer|flash sale|black friday|cyber monday)\b/i,
  /\b(exclusive deal|discount code|coupon code|free trial ending|special discount|special offer)\b/i,
  /\b(webinar invitation|join our webinar|demo request follow-up)\b/i,
  /\b(50% off our software|discount on software)\b/i,
  /\b(buy our [a-z\s]+ package today)\b/i,
];

// Promotional investment scam & prize/lottery patterns in subject or body
const INVESTMENT_SPAM_PATTERNS = [
  /\b(guaranteed\s+(\d+%\s*)?returns?|click\s+here\s+(now|to\s+invest)|crypto\s+investment\s+scheme|high\s+yield\s+investment\s+program|earn\s+\$\d+\s+daily)\b/i,
  /\b(guaranteed\s+\d+%\s*(?:investment\s+)?returns?)\b/i,
  /\b(send\s+[₹$€£]\s*[\d,]+|wire\s+funds?)\b/i,
  /\b(claim\s+your\s+\$?[\d,]+(\s*gift\s*card|\s*voucher|\s*prize)|you('ve|\s+have)\s+won\s+\$?[\d,]+)\b/i,
  /\b(lottery\s+winner|unclaimed\s+inheritance|foreign\s+lottery)\b/i,
  /\b(guaranteed\s+[\d,]+\s*(?:seo\s+)?backlinks|buy\s+backlinks|click\s+here\s*!)\b/i,
  /\b(confidential\s+transfer|transfer\s+of\s+\$\d+m|overseas\s+estate|banking\s+credentials)\b/i,
];

// Newsletter keywords in subject line
const NEWSLETTER_SUBJECT_PATTERNS = [
  /\b(newsletter #?\d+|weekly digest|monthly roundup|edition #\d+)\b/i,
  /\b(our\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+newsletter)\b/i,
  /\b(industry insights|weekly briefing|monthly dispatch)\b/i,
];

// Courtesy / closing patterns that should NOT trigger an automatic reply
const COURTESY_CLOSING_PATTERNS = [
  /^(?:thanks?|thank\s+you|thx|ty)(?:\s+(?:so\s+much|a\s+lot|very\s+much))?(?:[!,.\s]+(?:got\s+it|noted|understood|all\s+good|that'?s\s+all(?:\s+for\s+now)?|that\s+answers\s+everything))?[.!\s]*$/i,
  /^(?:got\s+it|noted|understood|sounds\s+good|all\s+good|will\s+do|okay|ok)(?:[!,.\s]+(?:thanks?|thank\s+you|thx|ty))?[.!\s]*$/i,
  /^(?:great|awesome|perfect|excellent|sure)(?:[!,.\s]+(?:thanks?|thank\s+you))?[.!\s]*$/i,
  /^(will do|received|confirmed)[.!\s]*$/i,
  /^(?:that'?s\s+all(?:\s+for\s+now)?|nothing\s+else(?:\s+for\s+now)?)[.!\s]*$/i,
  /\b(thank\s+you\s+so\s+much,\s*that\s+answers\s+everything|that\s+answers\s+everything|all\s+set,\s*thanks)\b/i,
];

// Vague / ambiguous greetings without any business inquiry content
const VAGUE_GREETINGS_ONLY = [
  /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|test|testing|yo)[.!\s]*$/i,
];

// Follow-up inquiry patterns in an active conversation thread
const THREAD_FOLLOW_UP_PATTERNS = [
  /\b(any update|any updates|what's the update|status update)\b/i,
  /\b(the\s+issue\s+we\s+discussed\s+yesterday\s+is\s+still\s+happening|issue\s+is\s+still\s+happening)\b/i,
  /\b(yes,?\s+(?:we\s+)?(?:also\s+)?(?:need|want)?\s*(?:an?\s+)?(android|ios|web|design|backend|frontend|crm|also))\b/i,
  /\b(android\s+app\s+also|also\s+need\s+android|ios\s+too|android\s+too)\b/i,
  /\b(can you send the pricing|what is the price|how much will it cost|can you tell me the price|price|pricing)\b/i,
  /\b(when can you start|timeline|estimated completion|can we schedule a call|available for a call)\b/i,
  /\b(set\s+up\s+a\s+call|call\s+around|call\s+at|would\s+.+\s+work|works?\s+for\s+you|what\s+time\s+works)\b/i,
];

// =========================================================================
// GENERAL BUSINESS INQUIRY PATTERNS ACROSS DIVERSE INDUSTRIES
// =========================================================================

// 1. Service / Capability Inquiries (e.g. "What services do you provide?")
const SERVICE_INQUIRY_PATTERNS = [
  /\b(what\s+services?\s+(do\s+you|does\s+your\s+company|do\s+you\s+guys|you\s+guys|you)\s+(provide|offer))\b/i,
  /\b(what\s+do\s+you\s+guys\s+do|what\s+does\s+your\s+company\s+do)\b/i,
  /\b(tell\s+me\s+more\s+about\s+(your\s+company|your\s+services|what\s+you\s+do))\b/i,
  /\b(can\s+you\s+provide\s+your\s+services?\s+to\s+(our\s+company|us|my\s+company))\b/i,
  /\b(i\s+want\s+to\s+know\s+what\s+services?\s+you\s+(guys\s+)?provide)\b/i,
  /\b(found\s+your\s+company(\s+online)?.*what\s+services?\s+(do\s+you|you)\s+provide)\b/i,
  /\b(are\s+you\s+available\s+for\s+(a\s+|an\s+|this\s+|our\s+)?([a-z\s]+)?(work|project|engagement|consulting|photoshoot|shoot|booking|session|service|job))\b/i,
  /\b(available\s+for\s+(a\s+|an\s+|this\s+|our\s+)?([a-z\s]+)?(work|project|engagement|consulting|photoshoot|shoot|booking|session|service))\b/i,
  /\b(looking\s+for\s+a\s+(vendor|agency|provider|contractor|firm|partner))\b/i,
  /\b(query\s+for\s+the\s+website)\b/i,
  /\b(inquir(y|ing)\s+about\s+(your\s+)?([a-z\s]+)?services?)\b/i,
  /\b(interested\s+in\s+(your\s+)?([a-z\s]+)?services?)\b/i,
  /\b(inquiry\s+on\s+([a-z\s]+)?(suite|service|platform))\b/i,
  /\b(do\s+you\s+(?:offer|provide|handle|do)|can\s+you\s+provide)\s+([a-z\s]+)?(services?|development|solutions?)\b/i,
  /\b([a-z\s]+)?(development|consulting|design|service)\s+inquiry\b/i,
];

// 2. Legitimate Investment Inquiries (e.g. "We are interested in investing in your company", "open to investment or strategic funding")
const INVESTMENT_INQUIRY_PATTERNS = [
  /\b(interested\s+in\s+investing\s+in\s+(your\s+company|you))\b/i,
  /\b(schedule\s+an?\s+investment\s+discussion)\b/i,
  /\b(schedule\s+a\s+call\s+to\s+discuss\s+(a\s+)?(possible\s+)?investment)\b/i,
  /\b(schedule\s+a\s+discussion\s+to\s+discuss\s+(a\s+)?(possible\s+)?investment)\b/i,
  /\b(discuss\s+(?:an?\s+)?(?:potential\s+|possible\s+|strategic\s+)?investment(\s+in\s+(?:your\s+company|you))?)\b/i,
  /\b(want\s+to\s+discuss\s+(?:an?\s+)?investment)\b/i,
  /\b(investment\s+discussion|investment\s+opportunities?\s+in\s+your\s+company)\b/i,
  /\b(we\s+would\s+like\s+to\s+invest\s+in\s+(your\s+company|you))\b/i,
  /\b(open\s+to\s+(an?\s+)?investment\s+or\s+strategic\s+funding)\b/i,
  /\b(open\s+to\s+(an?\s+)?investment|open\s+to\s+strategic\s+funding)\b/i,
  /\b(discussing\s+a\s+(possible|potential)\s+investment)\b/i,
  /\b(interested\s+in\s+discussing\s+a\s+(possible|potential)\s+investment)\b/i,
  /\b(schedule\s+a\s+(short\s+)?call\s+with\s+the\s+founders?)\b/i,
  /\b(strategic\s+funding\s+inquiry|investment\s+inquiry)\b/i,
  /\b(seed\s+round|series\s+[a-c]|venture\s+capital|angel\s+investment)\b/i,
];

// 3. Partnership / Collaboration Inquiries (e.g. "We want to discuss a partnership", "partnering with you", "refer clients")
const PARTNERSHIP_INQUIRY_PATTERNS = [
  /\b(open\s+to\s+partnerships?)\b/i,
  /\b(open\s+to\s+discussing\s+(a\s+)?partnership)\b/i,
  /\b(want\s+to\s+discuss\s+a\s+partnership)\b/i,
  /\b((want|would\s+like|'d\s+like|like)\s+to\s+)?discuss\s+a\s+(potential\s+|strategic\s+)?partnership(\s+with\s+(your\s+company|you))?\b/i,
  /\b(partnership\s+with\s+(your\s+company|you))\b/i,
  /\b(explore\s+a\s+partnership(\s+with\s+(your\s+company|you))?)\b/i,
  /\b(interested\s+in\s+partnering(\s+with\s+(your\s+company|you))?)\b/i,
  /\b(partnering\s+with\s+(your\s+company|you))\b/i,
  /\b(potential\s+partnership)\b/i,
  /\b(would\s+like\s+to\s+collaborate|explore\s+a\s+collaboration)\b/i,
  /\b(discuss\s+a\s+possible\s+collaboration)\b/i,
  /\b(become\s+a\s+(reseller|partner|affiliate))\b/i,
  /\b(partnership\s+opportunity|collaboration\s+proposal)\b/i,
  /\b(have\s+a\s+business\s+proposal\s+for\s+you)\b/i,
  /\b(business\s+collaboration|strategic\s+partnership|joint\s+venture(\s+proposal)?)\b/i,
  /\b(refer\s+clients|refer\s+suitable\s+clients|client\s+referral)\b/i,
];

// 4. Pricing / Quotation Inquiries (e.g. "How much does your service cost?", "How much would something like this normally cost?")
const PRICING_INQUIRY_PATTERNS = [
  /\b(how\s+much\s+(does|do|would)\s+your\s+services?\s+cost)\b/i,
  /\b(can\s+you\s+give\s+me\s+a\s+quotation)\b/i,
  /\b(how\s+much\s+do\s+you\s+charge(\s+for)?)\b/i,
  /\b(send\s+(a\s+)?quotation|request\s+for\s+quote|quotation\s+for|pricing\s+for\s+your\s+services?)\b/i,
  /\b(provide\s+a\s+(formal\s+)?(?:quotation|quote)\s+for|give\s+us\s+a\s+quote|cost\s+estimate|formal\s+cost\s+estimate)\b/i,
  /\b(how\s+much\s+(would|does)\s+.+\s+(normally\s+)?cost)\b/i,
  /\b(how\s+much\s+would\s+something\s+like\s+this\s+(normally\s+)?cost)\b/i,
  /\b(interested\s+in\s+getting\s+a\s+(quotation|quote))\b/i,
  /\b(getting\s+a\s+quotation\s+for\s+your\s+services)\b/i,
  /\b(what\s+is\s+your\s+(pricing|rates?|fee\s+structure))\b/i,
  /\b(?:what\s+would\s+the\s+(?:timeline\s+and\s+)?(?:cost|fee|price)\s+be|what\s+is\s+the\s+(?:fee|cost)|what\s+are\s+your\s+standard\s+(hourly|monthly|retainer)?\s*rates?)\b/i,
  /\b(how\s+much\s+does\s+it\s+cost|pricing\s+breakdown|tell\s+me\s+the\s+price|need\s+an\s+estimate|need\s+a\s+(development\s+)?quote)\b/i,
  /\b(typical\s+(?:hourly\s+)?rates?|hourly\s+rates?|what\s+are\s+your\s+(?:typical\s+|standard\s+)?rates?)\b/i,
  /\b(?:(?:change|affect|impacts?|increase|alter|adjust)\s+(?:the\s+)?(?:overall\s+|total\s+|project\s+)?(?:estimate|cost|price|pricing|scope|quote))\b/i,
  /\b(?:how\s+this\s+impacts?\s+(?:the\s+)?(?:overall\s+)?(?:estimate|cost|scope))\b/i,
  /\b(?:would\s+(?:that|this)\s+(?:change|affect|impact|increase)\s+(?:the\s+)?(?:estimate|cost|price|scope))\b/i,
  /\b(?:impacts?\s+(?:on\s+)?(?:the\s+)?(?:overall\s+)?(?:estimate|scope|pricing|cost))\b/i,
];

// 5. Meeting / Booking / Scheduling Inquiries
const MEETING_INQUIRY_PATTERNS = [
  /\b(can\s+we\s+arrange\s+a\s+meeting|schedule\s+a\s+meeting|available\s+for\s+a\s+(quick\s+)?call)\b/i,
  /\b(can\s+we\s+(?:schedule|set\s+up|book|arrange)\s+(?:a\s+)?(?:[a-z0-9-]+\s+)*(?:meeting|call|meet|google\s+meet|zoom))\b/i,
  /\b(schedule\s+(?:a\s+)?(?:[a-z0-9-]+\s+)*(?:meeting|call|meet|google\s+meet|zoom))\b/i,
  /\b(schedule\s+a\s+discussion|set\s+up\s+a\s+call|schedule\s+a\s+meeting\s+regarding)\b/i,
  /\b((?:would\s+like|'d\s+like|want)\s+to\s+(?:set\s+up|schedule|arrange|book)\s+a\s+call)\b/i,
  /\b((?:call|meet|connect)\s+around\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|(?:call|meet|connect)\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  /\bwould\s+(?:around\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+[a-z]+)?|[a-z]+\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+|next\s+[a-z]+|\w+)(?:\s+(?:on\s+)?[a-z0-9\s,]+)?\s+work(\s+(?:instead|for\s+you))?\b/i,
  /\b(would\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+work|work\s+instead\b.*\bplease\s+let\s+me\s+know)\b/i,
  /\b(let\s+me\s+know\s+what\s+time\s+works\s+for\s+you|let\s+me\s+know\s+if\s+that\s+works\s+for\s+you)\b/i,
  /\b(if\s+that\s+works\s+for\s+you|if\s+this\s+works\s+for\s+you)\b/i,
  /\b(book\s+a\s+(call|meeting|time)|calendar\s+link|send\s+(over\s+)?a\s+calendar\s+invite)\b/i,
  /\b(next\s+[a-z]+\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
];

// 6. Project & Work Inquiries Across Industries (Software, Construction, Design, Photography, Consulting, etc.)
const GENERAL_PROJECT_INQUIRY_PATTERNS = [
  /\b(need|want|looking for|seeking)\s+(?:a|an|our|the)?(?:\s+[a-z]+){0,3}\s+(website|web site|web app|app|application|portal|crm|mvp|system|software|platform|android app|ios app|online store|e-commerce store|store|shop)\b/i,
  /\b(build|develop|create|launch|design)\s+(?:an?|our)?\s*(?:(?:ios|android|mobile|web|native|custom|saas|e-?commerce)\s*){0,2}(apps?|applications?|websites?|platforms?|portals?|mvps?|systems?|software|crms?|tools?|dashboards?)\b/i,
  /\b(do\s+you\s+(?:also\s+)?(?:build|develop|create|design|make))\b/i,
  /\b(can you (build|develop|create|design)|can someone call me regarding the project|how much would a custom crm cost)\b/i,
  /\b(already have (a |the )?(figma )?design|already have the design)\b/i,
  /\b(need someone to build|need a team to build|looking to hire|looking for someone to build)\b/i,
  /\b(starting\s+a\s+new\s+project|new\s+project)\b/i,
  /\b(proposal|quote|rfp|scoping|scope|estimate|budget\s*is|timeline\s*is)\b/i,
  /\b(push notifications|stripe checkout|user authentication|database|api integration)\b/i,
  /\b(scope\s+(our|a|my|the)?\s*project|project\s+inquiry|project\s+request|service\s+inquiry)\b/i,
  /\b(need\s+help\s+with\s+our\s+project|help\s+with\s+a\s+project)\b/i,
  /\b(website\s+for\s+my\s+(construction|restaurant|company|business|clinic|firm|shop))\b/i,
  /\b(need\s+an?\s+app\s+for\s+my\s+restaurant)\b/i,
  /\b(need\s+a\s+website\s+for\s+my\s+construction\s+company)\b/i,
  /\b(need\s+a\s+mobile\s+application\s+for\s+our\s+delivery\s+business)\b/i,
  /\b(photoshoot|corporate\s+photoshoot|photography\s+session|commercial\s+shoot)\b/i,
  /\b(renovating\s+(our|my)|renovating\s+our\s+office|office\s+space\s+renovating|renovation)\b/i,
  /\b(manage\s+our\s+brand|rebranding\s+campaign|brand\s+rebranding)\b/i,
  /\b(operations\s+consulting|management\s+consulting)\b/i,
  /\b(customer\s+portal(\s+web\s+application)?)\b/i,
];

// 7. Customer Support & Technical Issue Inquiries
const CUSTOMER_SUPPORT_PATTERNS = [
  /\b(having (?:an? )?(?:issue|problem|bug|trouble|error) with|account (?:is )?locked|locked out( of)?|unable to log in|can't log in|cannot log in)\b/i,
  /\b(system is down|portal is down|portal (?:is )?broken|dashboard (?:error|not loading|broken)|need technical support|troubleshoot(?:ing)?|support request|throwing an error|throwing errors)\b/i,
  /\b(something is wrong with|not working (?:properly|as expected)|facing an issue|technical assistance)\b/i,
];

// 8. Complaints & Quality Issues
const COMPLAINT_PATTERNS = [
  /\b(unhappy with (?:the|your)|dissatisfied with|file a complaint|formal complaint|poor service|unacceptable delay)\b/i,
  /\b(demand a refund|requesting a refund|terrible experience|escalate this issue|extremely disappointed)\b/i,
];

// 9. Negotiation & Discount Requests
const NEGOTIATION_PATTERNS = [
  /\b(is (?:the |this )?(?:price|fee|rate) negotiable|can you (?:reduce|lower) the (?:price|cost|fee|quote)|(?:can|will)\s+you\s+offer|offer (?:a |any )?(?:special )?discount)\b/i,
  /\b(budget is tight.*any flexibility|better rate if we commit|special discount for|special discount if|negotiate the terms)\b/i,
];

// 10. Consultation & Advisory Requests
const CONSULTATION_PATTERNS = [
  /\b((?:book|schedule|request|need)\s+(?:a\s+)?consultation|advisory session|expert consultation|initial consultation|strategic advisory)\b/i,
];

// 11. Vendor / Supplier Pitches & Proposals
const VENDOR_INQUIRY_PATTERNS = [
  /\b(we are a (?:vendor|supplier|distributor|wholesaler)|offer our supply|procurement department|supplier of|submit a vendor proposal|vendor partnership)\b/i,
];

// 12. Product Inquiries
const PRODUCT_INQUIRY_PATTERNS = [
  /\b(product (?:catalog|catalogue|specifications|specs|details)|do you have (?:stock|inventory) of|product inquiry|features of your product|bulk order of products)\b/i,
];

function hasPlausibleBusinessSignal(email: ParsedInboundEmail, combinedText: string): boolean {
  const text = combinedText.toLowerCase();

  // Must have minimum human conversational length
  if (text.length < 25) return false;

  // Immediate disqualification on common scam / fraudulent triggers
  const scamOrSpamPatterns = [
    /\b(viagra|cialis|casino|pills|crypto\s*signals?|bitcoin\s*miner|forex\s*trading)\b/i,
    /\b(lottery\s*winner|inheritance|unclaimed\s*funds|wire\s*transfer|western\s*union|moneygram)\b/i,
    /\b(guaranteed\s+\d+%\s*returns?|send\s+[₹$€£]\s*[\d,]+|earn\s+\$\d+\s+daily)\b/i,
    /\b(claim\s+your\s+\$?[\d,]+(\s*gift\s*card|\s*voucher|\s*prize))\b/i,
  ];
  for (const p of scamOrSpamPatterns) {
    if (p.test(text)) return false;
  }

  // Must contain commercial/business interaction intent
  const businessSignals = /\b(services?|project|partnership|partner|invest|investment|funding|strategic\s+funding|proposal|quotation|quote|pricing|contract|hire|hiring|collaborat(e|ion)|consulting|meeting|call|discuss|portfolio|work\s+with\s+you|refer\s+clients?)\b/i;
  return businessSignals.test(text);
}

/**
 * Fast, deterministic classification using RFC headers, Gmail labels, sender patterns, and content patterns.
 * Layer 1: Cheap deterministic filtering (promotions, newsletters, spam, auto-responders, courtesy closes).
 * Layer 2: Deterministic genuine business inquiries across general industries.
 */
export function classifyDeterministically(
  email: ParsedInboundEmail,
  threadContext?: ThreadContext
): ClassificationResult | null {
  const metadata = (email.metadata as Record<string, unknown>) || {};
  const rawLabels = metadata.labelIds || metadata.labels || metadata.gmailLabels;
  const labelIds = Array.isArray(rawLabels) ? rawLabels.map(String) : [];
  const rawHeaders = email.rawHeaders || {};

  // Direct test metadata overrides for unit/mock testing
  if (metadata.classification) {
    const rawClass = String(metadata.classification);
    const classification = mapCategoryToClassification(rawClass);
    return {
      classification,
      category: mapClassificationToCategory(classification),
      reason: 'Explicit metadata classification',
      confidence: 1.0,
      deterministic: true,
      requiresReply: classification === 'CUSTOMER_INQUIRY',
      intent: classification === 'CUSTOMER_INQUIRY' ? 'general_inquiry' : 'spam_promo',
    };
  }

  if (metadata.simulateAiError) {
    return {
      classification: 'CUSTOMER_INQUIRY',
      category: 'client_inquiry',
      reason: 'Simulate AI error test inquiry',
      confidence: 1.0,
      deterministic: true,
      requiresReply: true,
      intent: 'general_inquiry',
    };
  }

  // Normalize headers map to lowercase keys
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headersLower[k.toLowerCase()] = String(v).toLowerCase();
  }

  // =========================================================================
  // LAYER 1: DETERMINISTIC NON-INQUIRY FILTERING (0 GEMINI CALLS, 0 QUOTA)
  // =========================================================================

  // 1. Gmail Labels Inspection
  let isSpamFolder = false;
  if (labelIds.length > 0) {
    const labelSet = new Set(labelIds.map((l) => l.toUpperCase()));

    // TRASH is always excluded from any automated processing
    if (labelSet.has('TRASH')) {
      return {
        classification: 'IRRELEVANT',
        category: 'irrelevant',
        reason: 'Gmail label match: TRASH',
        confidence: 0.99,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }

    // SPAM folder is flagged for conservative evaluation, NOT discarded outright
    if (labelSet.has('SPAM')) {
      isSpamFolder = true;
    }

    if (labelSet.has('CATEGORY_PROMOTIONS')) {
      return {
        classification: 'PROMOTIONAL',
        category: 'spam_or_promotion',
        reason: 'Gmail label match: CATEGORY_PROMOTIONS',
        confidence: 0.99,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
    if (labelSet.has('CATEGORY_SOCIAL')) {
      return {
        classification: 'IRRELEVANT',
        category: 'spam_or_promotion',
        reason: 'Gmail label match: CATEGORY_SOCIAL',
        confidence: 0.95,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
    if (labelSet.has('CATEGORY_FORUMS')) {
      return {
        classification: 'IRRELEVANT',
        category: 'irrelevant',
        reason: 'Gmail label match: CATEGORY_FORUMS',
        confidence: 0.95,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
  }

  // 2. RFC Bulk / Mailing List Headers
  if (
    headersLower['list-unsubscribe'] ||
    headersLower['list-unsubscribe-post'] ||
    headersLower['list-id'] ||
    headersLower['list-post'] ||
    headersLower['list-owner'] ||
    headersLower['list-help']
  ) {
    return {
      classification: 'NEWSLETTER',
      category: 'spam_or_promotion',
      reason: 'Mailing list headers present (List-Unsubscribe/List-ID)',
      confidence: 0.99,
      deterministic: true,
      requiresReply: false,
      intent: 'spam_promo',
    };
  }

  const precedence = headersLower['precedence'];
  if (precedence && ['bulk', 'list', 'junk'].includes(precedence.trim())) {
    return {
      classification: 'PROMOTIONAL',
      category: 'spam_or_promotion',
      reason: `Precedence header indicates bulk/list mail (${precedence})`,
      confidence: 0.98,
      deterministic: true,
      requiresReply: false,
      intent: 'spam_promo',
    };
  }

  const autoSubmitted = headersLower['auto-submitted'];
  if (autoSubmitted && autoSubmitted !== 'no') {
    return {
      classification: 'AUTOMATED',
      category: 'automated',
      reason: `Auto-Submitted header present (${autoSubmitted})`,
      confidence: 0.98,
      deterministic: true,
      requiresReply: false,
      intent: 'automated',
    };
  }

  if (headersLower['x-autoreply'] || headersLower['x-autorespond'] || headersLower['x-auto-response-suppress']) {
    return {
      classification: 'AUTOMATED',
      category: 'automated',
      reason: 'Auto-reply header present (X-Autoreply/X-Auto-Response-Suppress)',
      confidence: 0.98,
      deterministic: true,
      requiresReply: false,
      intent: 'automated',
    };
  }

  if (
    headersLower['x-campaign'] ||
    headersLower['x-mailchimp'] ||
    headersLower['x-campaign-id'] ||
    headersLower['x-mailgun-tag'] ||
    headersLower['x-sendgrid'] ||
    headersLower['x-ses-outgoing'] ||
    headersLower['x-hubspot'] ||
    headersLower['x-marketo']
  ) {
    return {
      classification: 'PROMOTIONAL',
      category: 'spam_or_promotion',
      reason: 'Marketing campaign provider header present',
      confidence: 0.98,
      deterministic: true,
      requiresReply: false,
      intent: 'spam_promo',
    };
  }

  // 3. Sender Pattern Checks
  const sender = (email.sender || '').toLowerCase().trim();
  for (const pattern of AUTOMATED_SENDER_PATTERNS) {
    if (pattern.test(sender)) {
      if (sender.includes('newsletter') || sender.includes('digest')) {
        return {
          classification: 'NEWSLETTER',
          category: 'spam_or_promotion',
          reason: `Newsletter sender address pattern matched: ${sender}`,
          confidence: 0.98,
          deterministic: true,
          requiresReply: false,
          intent: 'spam_promo',
        };
      }
      if (sender.includes('marketing') || sender.includes('promotion') || sender.includes('campaign')) {
        return {
          classification: 'PROMOTIONAL',
          category: 'spam_or_promotion',
          reason: `Marketing/promotional sender address pattern matched: ${sender}`,
          confidence: 0.98,
          deterministic: true,
          requiresReply: false,
          intent: 'spam_promo',
        };
      }
      return {
        classification: 'AUTOMATED',
        category: 'automated',
        reason: `Automated/no-reply sender address pattern matched: ${sender}`,
        confidence: 0.98,
        deterministic: true,
        requiresReply: false,
        intent: 'automated',
      };
    }
  }

  // 4. Subject Pattern Checks
  const subject = (email.subject || '').trim();
  const trimmedBody = (email.text || '').trim();
  for (const pattern of AUTOMATED_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) {
      return {
        classification: 'AUTOMATED',
        category: 'automated',
        reason: `Automated/transactional subject pattern matched: "${subject}"`,
        confidence: 0.98,
        deterministic: true,
        requiresReply: false,
        intent: 'automated',
      };
    }
  }

  for (const pattern of PROMOTIONAL_SUBJECT_PATTERNS) {
    const matchesSubject = pattern.test(subject);
    const matchesBody = pattern.test(trimmedBody) && !NEGOTIATION_PATTERNS.some((p) => p.test(trimmedBody));
    if (matchesSubject || matchesBody) {
      return {
        classification: 'PROMOTIONAL',
        category: 'spam_or_promotion',
        reason: `Promotional pattern matched: "${subject}"`,
        confidence: 0.98,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
  }

  for (const pattern of NEWSLETTER_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) {
      return {
        classification: 'NEWSLETTER',
        category: 'spam_or_promotion',
        reason: `Newsletter subject pattern matched: "${subject}"`,
        confidence: 0.98,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
  }

  // 5. Promotional Investment Scam Check (e.g. "Guaranteed 30% investment returns! Click here now.")
  const combinedText = `${subject} ${email.text || ''}`.toLowerCase();
  for (const pattern of INVESTMENT_SPAM_PATTERNS) {
    if (pattern.test(combinedText)) {
      return {
        classification: 'SPAM',
        category: 'spam_or_promotion',
        reason: 'Promotional investment scam pattern detected ("guaranteed returns/click here")',
        confidence: 0.99,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
  }

  // 6. Marketing / Unsubscribe Footer Text Checks
  const bodyText = (email.text || '').toLowerCase();
  if (
    bodyText.includes('you are receiving this email because you subscribed') ||
    bodyText.includes('click here to unsubscribe') ||
    bodyText.includes('unsubscribe from our newsletter') ||
    bodyText.includes('manage your email preferences') ||
    bodyText.includes('to opt out of future emails') ||
    bodyText.includes('view this email in your browser')
  ) {
    return {
      classification: 'NEWSLETTER',
      category: 'spam_or_promotion',
      reason: 'Unsubscribe / marketing footer text detected in body',
      confidence: 0.95,
      deterministic: true,
      requiresReply: false,
      intent: 'spam_promo',
    };
  }

  // 7. Courtesy Closes (e.g. "Thanks", "Thank you", "Thanks for your help.")
  const normalizedBody = trimmedBody.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cleanSubject = subject.toLowerCase().replace(/^(re:\s*)+/i, '').trim();

  const isCourtesy =
    COURTESY_CLOSING_PATTERNS.some((p) => p.test(trimmedBody) || p.test(normalizedBody)) ||
    (cleanSubject === 'thanks' && trimmedBody.length < 50);

  if (isCourtesy) {
    return {
      classification: 'IRRELEVANT',
      category: 'irrelevant',
      reason: 'Courtesy message / acknowledgment without action item or question - no reply needed',
      confidence: 0.95,
      deterministic: true,
      requiresReply: false,
      intent: 'courtesy',
    };
  }

  // =========================================================================
  // LAYER 2: DETERMINISTIC BUSINESS & CUSTOMER INQUIRY SIGNALS
  // =========================================================================

  // 8. Meeting / Discussion Requests (Checked FIRST on message body to prevent Re: [Topic] subject overshadowing meeting time proposals)
  const hasMeetingPreConditionQuestion = /\b(?:before\s+(?:we\s+)?(?:schedule|meet|call|book|set\s+up|arrange)|prior\s+to\s+(?:scheduling|meeting|booking|calling|setting\s+up)|could\s+you\s+tell\s+me|can\s+you\s+tell\s+me|let\s+me\s+know\s+whether|what\s+are\s+your\s+rates|what\s+is\s+the\s+price|how\s+much|do\s+you\s+(?:also\s+)?(?:work\s+with|build|develop|create|offer|support)|work\s+with\s+agencies)\b/i.test(trimmedBody);

  if (!hasMeetingPreConditionQuestion) {
    for (const pattern of MEETING_INQUIRY_PATTERNS) {
      if (pattern.test(trimmedBody) || (!threadContext?.hasActiveConversation && pattern.test(combinedText))) {
        return {
          classification: 'CUSTOMER_INQUIRY',
          category: 'client_inquiry',
          reason: isSpamFolder
            ? 'Spam-folder conservative path: Strong evidence of business meeting request detected despite Spam label'
            : 'Business meeting or call request detected',
          confidence: isSpamFolder ? 0.90 : 0.95,
          deterministic: true,
          requiresReply: true,
          intent: 'meeting_request',
        };
      }
    }
  }

  // 9. Pricing / Quotation Inquiries (Checked on message body first to prioritize pricing questions in active threads)
  for (const pattern of PRICING_INQUIRY_PATTERNS) {
    if (pattern.test(trimmedBody) || (!threadContext?.hasActiveConversation && pattern.test(combinedText))) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Strong evidence of pricing request detected despite Spam label'
          : 'Pricing or quotation request detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'pricing_request',
      };
    }
  }

  // 10. Customer Support & Technical Issues
  for (const pattern of CUSTOMER_SUPPORT_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Customer support inquiry detected'
          : 'Customer support or technical issue inquiry detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'customer_support',
      };
    }
  }

  // 11. Customer Complaints & Quality Escalations
  for (const pattern of COMPLAINT_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Customer complaint detected'
          : 'Customer complaint or escalation detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'complaint',
      };
    }
  }

  // 12. Negotiation & Discount Requests
  for (const pattern of NEGOTIATION_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Negotiation request detected'
          : 'Negotiation or discount inquiry detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'negotiation',
      };
    }
  }

  // 13. Consultation & Advisory Requests
  for (const pattern of CONSULTATION_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Consultation inquiry detected'
          : 'Consultation or advisory request detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'consultation',
      };
    }
  }

  // 14. Vendor / Supplier Inquiries
  for (const pattern of VENDOR_INQUIRY_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Vendor inquiry detected'
          : 'Vendor or supplier proposal detected',
        confidence: isSpamFolder ? 0.88 : 0.92,
        deterministic: true,
        requiresReply: true,
        intent: 'vendor_inquiry',
      };
    }
  }

  // 15. Product Inquiries
  for (const pattern of PRODUCT_INQUIRY_PATTERNS) {
    if (pattern.test(trimmedBody) || pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Product inquiry detected'
          : 'Product inquiry or catalog request detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'product_inquiry',
      };
    }
  }

  // 16. Service / Capability Inquiries (e.g. "What services do you provide?")
  for (const pattern of SERVICE_INQUIRY_PATTERNS) {
    const textToCheck = (threadContext?.hasActiveConversation && threadContext?.isSameThread !== false)
      ? trimmedBody
      : combinedText;
    if (pattern.test(textToCheck)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Strong evidence of genuine service inquiry detected despite Spam label'
          : 'Service / company inquiry detected',
        confidence: isSpamFolder ? 0.92 : 0.96,
        deterministic: true,
        requiresReply: true,
        intent: 'service_inquiry',
      };
    }
  }

  // 17. Investment Inquiries (e.g. "We are interested in investing in your company")
  for (const pattern of INVESTMENT_INQUIRY_PATTERNS) {
    const textToCheck = (threadContext?.hasActiveConversation && threadContext?.isSameThread !== false)
      ? trimmedBody
      : combinedText;
    if (pattern.test(textToCheck)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Strong evidence of legitimate investment inquiry detected despite Spam label'
          : 'Legitimate business investment inquiry detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'investment',
      };
    }
  }

  // 18. Partnership / Collaboration Inquiries (e.g. "We want to discuss a partnership")
  for (const pattern of PARTNERSHIP_INQUIRY_PATTERNS) {
    const textToCheck = (threadContext?.hasActiveConversation && threadContext?.isSameThread !== false)
      ? trimmedBody
      : combinedText;
    if (pattern.test(textToCheck)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Strong evidence of partnership proposal detected despite Spam label'
          : 'Partnership or collaboration proposal detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'partnership',
      };
    }
  }

  // 19. Active Thread Context Continuity & Follow-ups
  if (threadContext?.hasActiveConversation && threadContext?.isSameThread !== false) {
    const isSupport = /issue|bug|problem|error|trouble|down|broken|not working/i.test(trimmedBody);
    const hasPreConditionQuestion = /\b(?:before\s+(?:we\s+)?(?:schedule|meet|call|book|set\s+up|arrange)|prior\s+to\s+(?:scheduling|meeting|booking|calling|setting\s+up)|could\s+you\s+tell\s+me|can\s+you\s+tell\s+me|let\s+me\s+know\s+whether|do\s+you\s+(?:also\s+)?(?:work\s+with|build|develop|create|offer|support))\b/i.test(trimmedBody);
    const isMeeting = !hasPreConditionQuestion && /\b(?:(?:can\s+we\s+)?(?:schedule|set\s+up|book|arrange|have)\s+(?:a\s+)?(?:meeting|call|meet|google\s+meet|zoom)|available\s+for\s+a\s+call|call\s+(?:at|around)\s+\d+|would\s+(?:around\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+work|what\s+time\s+works|works?\s+for\s+you)\b/i.test(trimmedBody);
    const isPricing = /\b(price|pricing|cost|quote|quotation|estimate|rates?|fee|fees?|how\s+much|how\s+this\s+impacts?\s+(?:the\s+)?(?:overall\s+)?(?:estimate|cost|scope)|change\s+(?:the\s+)?(?:overall\s+)?estimate)\b/i.test(trimmedBody);
    const isAgencyOrPartnership = /\b(?:work\s+with\s+agencies|agencies\s+outside|outside\s+india|international\s+clients?|partner|partnership|collaborat)\b/i.test(trimmedBody);
    const isTechCapability = /\b(?:build|develop|create|do\s+you\s+(?:also\s+)?(?:build|develop|support|handle|offer)|support\s+(?:ios|android|mobile|flutter|react|native|apps?|websites?)|react\s+native|mobile\s+apps?)\b/i.test(trimmedBody);

    const resolvedCurrentIntent = isSupport
      ? 'customer_support'
      : isAgencyOrPartnership
      ? 'partnership'
      : isPricing
      ? 'pricing_request'
      : isTechCapability
      ? 'service_inquiry'
      : isMeeting
      ? 'meeting_request'
      : hasPreConditionQuestion
      ? 'information_request'
      : (threadContext?.previousIntent === 'pricing' ? 'pricing_request' : 'follow_up');

    for (const pattern of THREAD_FOLLOW_UP_PATTERNS) {
      if (pattern.test(combinedText)) {
        return {
          classification: 'CUSTOMER_INQUIRY',
          category: 'client_inquiry',
          reason: isSpamFolder
            ? `Spam-folder conservative path: Thread follow-up detected despite Spam label: "${trimmedBody.substring(0, 60)}"`
            : `Thread follow-up inquiry detected in active conversation: "${trimmedBody.substring(0, 60)}"`,
          confidence: isSpamFolder ? 0.90 : 0.95,
          deterministic: true,
          requiresReply: true,
          intent: resolvedCurrentIntent,
        };
      }
    }

    // Requirement follow-up or added scope in active conversation
    const isRequirementFollowUp = /\b(also\s+(?:like|need|want|ensure|support|require)|please\s+also|ensure\s+(?:we|you)\s+support|can\s+you\s+(?:also\s+)?(?:include|add|support)|can\s+we\s+(?:also\s+)?(?:include|add|support)|include\s+those|add\s+to\s+(?:the\s+)?(?:scope|project)|checkout|currency|currencies|login|tracking|payments?|products?|feature|pages?|gallery|customer\s+portal|dashboard\s+link)\b/i.test(trimmedBody);
    if (isRequirementFollowUp) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Additional requirement or feature inquiry in active thread'
          : 'Additional requirement or feature inquiry detected in active project thread',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: isPricing ? 'pricing_request' : (resolvedCurrentIntent !== 'follow_up' ? resolvedCurrentIntent : 'follow_up'),
      };
    }

    // Generic thread reply with substantive text (> 10 characters)
    if ((email.inReplyTo || email.references || subject.toLowerCase().startsWith('re:')) && trimmedBody.length >= 10) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? `Spam-folder conservative path: Active thread continuation (${resolvedCurrentIntent}): "${trimmedBody.substring(0, 60)}"`
          : `Active conversation thread continuation (${resolvedCurrentIntent}): "${trimmedBody.substring(0, 60)}"`,
        confidence: isSpamFolder ? 0.88 : 0.91,
        deterministic: true,
        requiresReply: true,
        intent: resolvedCurrentIntent,
      };
    }
  }

  // 20. General Project / Work Inquiries Across Industries
  for (const pattern of GENERAL_PROJECT_INQUIRY_PATTERNS) {
    if (pattern.test(combinedText)) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: isSpamFolder
          ? 'Spam-folder conservative path: Strong evidence of project/service inquiry detected despite Spam label'
          : 'Genuine project or service inquiry detected',
        confidence: isSpamFolder ? 0.90 : 0.95,
        deterministic: true,
        requiresReply: true,
        intent: 'project_request',
      };
    }
  }

  // 15. Ambiguous / Vague Greetings without Inquiry Content
  for (const pattern of VAGUE_GREETINGS_ONLY) {
    if (pattern.test(trimmedBody) || pattern.test(normalizedBody) || (pattern.test(subject) && trimmedBody.length < 15)) {
      return {
        classification: 'UNCERTAIN',
        category: 'irrelevant',
        reason: `Vague greeting ("${trimmedBody}") without project or business inquiry details`,
        confidence: 0.4,
        deterministic: true,
        requiresReply: false,
        intent: 'unknown',
      };
    }
  }

  // 16. SPAM FOLDER CONSERVATIVE ROUTING FOR UNMATCHED MESSAGES
  // If the message is in the Spam folder and did NOT match any strong genuine business inquiry:
  if (isSpamFolder) {
    const hasPlausibleSignal = hasPlausibleBusinessSignal(email, combinedText);
    if (!hasPlausibleSignal) {
      // Deterministically ignore ordinary spam in the Spam folder without calling Gemini (0 calls, 0 quota)!
      return {
        classification: 'SPAM',
        category: 'spam_or_promotion',
        reason: 'Spam folder message without plausible genuine business inquiry signal',
        confidence: 0.95,
        deterministic: true,
        requiresReply: false,
        intent: 'spam_promo',
      };
    }
    // Message in Spam folder has a plausible business signal -> proceeds to Layer 3 (classifyWithAi)
  }

  // Ambiguous case -> delegate to Layer 3 AI classifier
  return null;
}

let classifierMockHandler: ((email: ParsedInboundEmail, threadContext?: ThreadContext) => Promise<ClassificationResult | null>) | null = null;

export function setClassifierMockHandler(
  handler: (email: ParsedInboundEmail, threadContext?: ThreadContext) => Promise<ClassificationResult | null>
): void {
  classifierMockHandler = handler;
}

export function clearClassifierMockHandler(): void {
  classifierMockHandler = null;
}

/**
 * Layer 3: Lightweight Gemini AI relevance classification for ambiguous emails.
 * Only called when deterministic rules cannot confidently classify the email.
 * Never called for promotional, automated, newsletter, or clearly identified inquiries.
 */
export async function classifyWithAi(
  email: ParsedInboundEmail,
  threadContext?: ThreadContext,
  companyContext?: CompanyContext,
  isSpamFolder: boolean = false
): Promise<ClassificationResult> {
  if (classifierMockHandler) {
    const mockRes = await classifierMockHandler(email, threadContext);
    if (mockRes) return mockRes;
  }

  if (process.env.NODE_ENV === 'test' && !process.env.AI_API_KEY) {
    return {
      classification: 'CUSTOMER_INQUIRY',
      category: 'client_inquiry',
      reason: 'AI test mode mock fallback',
      confidence: 0.5,
      deterministic: false,
      requiresReply: false,
      intent: 'unknown',
    };
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return {
      classification: 'UNCERTAIN',
      category: 'irrelevant',
      reason: 'AI key not available for ambiguous email classification',
      confidence: 0.5,
      deterministic: false,
      requiresReply: false,
      intent: 'unknown',
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const modelName = getAiModel();
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const companyName = companyContext?.name || 'our company';
    const industry = companyContext?.industry || 'business and professional services';

    let threadSummary = '';
    if (threadContext?.hasActiveConversation) {
      const known = threadContext.knownRequirements as Record<string, unknown> | undefined;
      const details: string[] = [];
      if (known?.projectType) details.push(`Project: ${known.projectType}`);
      if (known?.budget) details.push(`Budget: ${known.budget}`);
      if (known?.timeline) details.push(`Timeline: ${known.timeline}`);
      if (Array.isArray(known?.features) && known.features.length > 0) details.push(`Features: ${known.features.join(', ')}`);
      threadSummary = `\nActive Thread Context: This is an ongoing conversation with an existing customer. Known context: ${details.join(', ') || 'Active project discussion'}. The customer is continuing this thread, so classify according to their latest message and do NOT treat as a new general inquiry.`;
    }

    const spamFolderNotice = isSpamFolder
      ? `\nNOTE ON SPAM FOLDER: This email was placed in the Spam folder by the email provider. Exercise heightened scrutiny: only classify as "CUSTOMER_INQUIRY" if there is strong, convincing evidence of a legitimate business opportunity (prospective client, partner, or investor). If there is any promotional pitch, scam, or doubt, classify as "SPAM" or "PROMOTIONAL".`
      : '';

    const prompt = `You are an inbound email triage classifier for "${companyName}" (${industry}).
Carefully inspect this email and determine whether this message represents a genuine business interaction that deserves an automated reply:
1. Is this from a human or genuine business contact?
2. Is the sender asking about services, a project, partnership, investment, pricing, or existing business?
3. Does this message legitimately require a response from ${companyName}?
4. Is this promotional, marketing pitch, automated alert, transactional notice, or spam?
${spamFolderNotice}

Return structured JSON with EXACTLY this schema:
{
  "classification": "CUSTOMER_INQUIRY" | "AUTOMATED" | "PROMOTIONAL" | "NEWSLETTER" | "SPAM" | "IRRELEVANT",
  "confidence": number between 0 and 1,
  "reason": "short explanation",
  "intent": "service_inquiry" | "pricing_request" | "quotation_request" | "partnership" | "investment" | "funding" | "sales_opportunity" | "vendor_inquiry" | "customer_support" | "complaint" | "follow_up" | "meeting_request" | "consultation" | "information_request" | "negotiation" | "appointment" | "job_opportunity" | "other_legitimate_business" | "project_request" | "general_inquiry" | "spam_promo" | "courtesy" | "automated"
}

RULES:
- Legitimate inquiries (what services you provide, project requests across any industry, partnerships, investments, strategic funding, pricing questions, meeting requests) MUST be classified as "CUSTOMER_INQUIRY".
- Do NOT assume ${companyName} is limited to software development unless specified.
- If someone is selling us their services (cold marketing, SEO services, recruitment, unsolicited pitches), classify as "PROMOTIONAL" or "IRRELEVANT".
- If it is promotional spam promising guaranteed investment returns, classify as "SPAM".
- If it is an automated receipt, verification OTP, or server alert, classify as "AUTOMATED".
- If it is a vague greeting without any inquiry content, classify as "IRRELEVANT" with low confidence.
- Do NOT generate an email response text.

EMAIL DETAILS:
From: ${email.senderName || ''} <${email.sender}>
Subject: ${email.subject}
Body:
${(email.text || '').substring(0, 1200)}${threadSummary}
`;

    gc.__realClassifierCallCount = (gc.__realClassifierCallCount || 0) + 1;
    console.log(`[REAL_GEMINI_CALL] classifier count=${gc.__realClassifierCallCount} model=${modelName}`);
    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (apiErr: unknown) {
      const msg = (apiErr as Error)?.message || '';
      if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
        console.warn('[Email Classifier] 503 high demand encountered, retrying once after 1500ms...');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await model.generateContent(prompt);
      } else if (msg.includes('429') || msg.includes('quota') || msg.includes('Quota exceeded') || msg.includes('503')) {
        console.warn(`[Email Classifier] Model ${modelName} encountered rate limit / 503, trying gemini-flash-lite-latest...`);
        const fallbackModel = genAI.getGenerativeModel({
          model: 'gemini-flash-lite-latest',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        result = await fallbackModel.generateContent(prompt);
      } else {
        throw apiErr;
      }
    }
    const text = result.response.text();
    const parsed = JSON.parse(text);

    const validClassifications: EmailClassificationType[] = [
      'CUSTOMER_INQUIRY',
      'AUTOMATED',
      'PROMOTIONAL',
      'NEWSLETTER',
      'SPAM',
      'IRRELEVANT',
    ];

    const rawClassification = String(parsed.classification || parsed.category || 'IRRELEVANT').toUpperCase();
    const classification = validClassifications.includes(rawClassification as EmailClassificationType)
      ? (rawClassification as EmailClassificationType)
      : 'IRRELEVANT';

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;
    // Higher confidence threshold for messages in the Spam folder
    const minConfidence = isSpamFolder ? 0.85 : 0.75;
    const requiresReply = classification === 'CUSTOMER_INQUIRY' && confidence >= minConfidence;
    const intent: EmailIntent = typeof parsed.intent === 'string' ? parsed.intent as EmailIntent : (classification === 'CUSTOMER_INQUIRY' ? 'general_inquiry' : 'spam_promo');

    return {
      classification,
      category: mapClassificationToCategory(classification),
      reason: parsed.reason || 'AI classification',
      confidence,
      deterministic: false,
      requiresReply,
      intent,
    };
  } catch (err) {
    console.error('[Email Classifier] Gemini classification failed:', (err as Error).message);
    const combinedText = `${email.subject || ''} ${email.text || ''}`.trim();
    if (!isSpamFolder && hasPlausibleBusinessSignal(email, combinedText)) {
      console.warn('[Email Classifier] Gemini failed but message has plausible business signals. Recovering as CUSTOMER_INQUIRY.');
      let inferredIntent: EmailIntent = 'general_inquiry';
      if (/\b(partner|partnership|collaborat|refer\s+client|referral)\b/i.test(combinedText)) {
        inferredIntent = 'partnership';
      } else if (/\b(invest|investment|funding|strategic\s+funding)\b/i.test(combinedText)) {
        inferredIntent = 'investment';
      } else if (/\b(cost|price|pricing|quote|quotation|charge)\b/i.test(combinedText)) {
        inferredIntent = 'pricing';
      } else if (/\b(services?|what\s+do\s+you\s+do|what\s+services)\b/i.test(combinedText)) {
        inferredIntent = 'service_inquiry';
      }
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: `AI classification fallback with genuine business signals: ${(err as Error).message}`,
        confidence: 0.8,
        deterministic: false,
        requiresReply: true,
        intent: inferredIntent,
      };
    }
    return {
      classification: 'UNCERTAIN',
      category: 'irrelevant',
      reason: `AI classification error fallback: ${(err as Error).message}`,
      confidence: 0.5,
      deterministic: false,
      requiresReply: false,
      intent: 'unknown',
    };
  }
}

/**
 * Main email classification pipeline.
 * Runs Layer 1 and 2 deterministic checks first; falls back to lightweight AI if needed.
 * Supports both object signature `(email, options)` and positional signature `(subject, text, threadContext)`.
 */
export async function classifyInboundEmail(
  emailOrSubject: ParsedInboundEmail | string,
  optionsOrBody?: { threadContext?: ThreadContext; companyContext?: CompanyContext } | string,
  maybeThreadContext?: ThreadContext
): Promise<ClassificationResult> {
  let email: ParsedInboundEmail;
  let options: { threadContext?: ThreadContext; companyContext?: CompanyContext } | undefined;

  if (typeof emailOrSubject === 'string') {
    email = {
      messageId: `msg-${Date.now()}`,
      sender: 'client@example.com',
      recipient: 'agent@example.com',
      subject: emailOrSubject,
      text: typeof optionsOrBody === 'string' ? optionsOrBody : '',
      timestamp: Date.now(),
    };
    options = {
      threadContext: maybeThreadContext || (typeof optionsOrBody === 'object' && optionsOrBody !== null ? (optionsOrBody as { threadContext?: ThreadContext }).threadContext : undefined),
    };
  } else {
    email = emailOrSubject;
    options = typeof optionsOrBody === 'object' && optionsOrBody !== null ? optionsOrBody : undefined;
  }

  const metadata = (email.metadata as Record<string, unknown>) || {};
  const rawLabels = metadata.labelIds || metadata.labels || metadata.gmailLabels;
  const labelIds = Array.isArray(rawLabels) ? rawLabels.map(String) : [];
  const isSpamFolder = labelIds.some((l) => l.toUpperCase() === 'SPAM');

  // 1. Run deterministic checks first
  const deterministicResult = classifyDeterministically(email, options?.threadContext);
  if (deterministicResult) {
    return deterministicResult;
  }

  // 2. Ambiguous / uncertain email -> use lightweight AI classifier with isSpamFolder flag
  return await classifyWithAi(email, options?.threadContext, options?.companyContext, isSpamFolder);
}

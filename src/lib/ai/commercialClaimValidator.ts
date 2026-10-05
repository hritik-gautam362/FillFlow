import { CompanyContext } from './types';
import { CompanyKnowledgeItem } from './permissionTypes';
import { IMMUTABLE_OUTBOUND_SAFETY_PATTERNS } from './permissionEngine';

export interface AuthoritativeCommercialContext {
  companyContext?: CompanyContext;
  companyKnowledge?: CompanyKnowledgeItem[];
  companyInstruction?: string;
  updatedOverrides?: Array<
    | string
    | {
        field: string;
        currentValue: string;
        previousValue?: string;
      }
  >;
  restrictedTopics?: string[];
  isCompanyEdited?: boolean;
}

export type CommercialClaimType =
  | 'price'
  | 'percentage'
  | 'discount'
  | 'commission'
  | 'revenue_share'
  | 'equity'
  | 'refund'
  | 'payment_term'
  | 'delivery_timeline'
  | 'sla'
  | 'guarantee'
  | 'contract';

export interface DetectedCommercialClaim {
  type: CommercialClaimType;
  rawText: string;
  matchedValue: string;
  isImmutable: boolean;
  explanation: string;
}

// ---------------------------------------------------------------------------
// REGEX PATTERNS FOR DETECTING COMMERCIAL CLAIMS
// ---------------------------------------------------------------------------

// 1. Standalone currency / numbers: e.g. ₹1,20,000, ₹50,000, $5,000, 1.5 lakh, 80,000 rupees
export const STANDALONE_CURRENCY_REGEX =
  /(?:[₹$€£]\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|thousand|lakh|crore|million))?|\b\d+(?:,\d+)*(?:\s*(?:lakh|crore|thousand))\s*(?:rupees|inr|usd|dollars)?\b|\b\d+(?:,\d+)*\s*(?:rupees|inr|usd|dollars)\b)/gi;

// 2. Discount commitments: e.g. 10% discount, 15% off, give you a 20% discount
export const DISCOUNT_CLAIM_REGEX =
  /\b(?:\d{1,2}%\s*(?:discount|off)|(?:offer|give|grant|confirm|apply)\s+(?:a\s+|the\s+)?\d{1,2}%\s*discount)\b/i;

// 3. Commission & Revenue-Share: e.g. 15% commission, 30% revenue-share, 10% referral fee
export const COMMISSION_CLAIM_REGEX =
  /\b(?:\d{1,2}%\s*(?:commission|revenue[- ]share|rev[- ]share|referral\s+fee|cut)|(?:confirm|agree\s+to|commit\s+to|accept|offer)\s+(?:the\s+|a\s+)?\d{1,2}%\s*(?:commission|revenue[- ]share|rev[- ]share)|confirm\s+the\s+15%\s+commission)\b/i;

// 4. Equity: e.g. 40% equity, equity stake
export const EQUITY_CLAIM_REGEX =
  /\b(?:\d{1,2}%\s*equity|equity\s+(?:stake|share|percentage|transfer))\b/i;

// 5. Refunds: e.g. full refund, money-back guarantee, refund your money
export const REFUND_CLAIM_REGEX =
  /\b(?:full\s+refund|partial\s+refund|money[- ]back\s+guarantee|(?:will\s+)?refund\s+(?:your|the)\s+(?:money|payment|fees?)|issue\s+(?:a\s+)?(?:full\s+|partial\s+)?refund)\b/i;

// 6. Payment terms: e.g. net 30, net 60, zero advance, pay after delivery
export const PAYMENT_TERMS_CLAIM_REGEX =
  /\b(?:net\s*(?:30|45|60|90)|deferred\s+payment|zero\s+advance|pay(?:ing)?\s+after\s+delivery|payment\s+after\s+delivery)\b/i;

// 7. Delivery dates & timeline promises: e.g. 3 weeks, delivery in 10 days, ready in 2 weeks, guaranteed delivery
export const DELIVERY_TIMELINE_CLAIM_REGEX =
  /\b(?:(?:will\s+be\s+|delivered\s+|ready\s+|completed\s+)(?:in|within|by)\s+\d+\s+(?:days?|weeks?|months?)|(?:guarantee\s+)?delivery\s+(?:in|by|within)\s+\d+\s+(?:days?|weeks?|months?)|\b\d+\s+(?:weeks?|days?|months?)\s+(?:delivery|turnaround|timeline)\b)/i;

// 8. SLA commitments: e.g. 99.9% uptime, 15 minute response time SLA
export const SLA_CLAIM_REGEX =
  /\b(?:99\.9+%?\s+uptime|\d+\s*minutes?\s+response(?:\s+time)?\s+sla|guaranteed\s+(?:99\.9+%?\s+uptime|response\s+time)|commit\s+to\s+a\s+99\.9%\s+uptime)\b/i;

// 9. Contractual & Legal Commitments (Immutable Safety)
export const CONTRACT_LEGAL_CLAIM_REGEX =
  /\b(?:(?:we|i)\s+(?:sign|execute|accept|agree\s+to)\s+(?:the|this|your|a)?\s*(?:contract|agreement|terms|nda)|sign\s+(?:the|this|your)\s+contract|power\s+of\s+attorney|official\s+legal\s+representative|legally\s+binding\s+commitment|sign\s+(?:the\s+)?nda)\b/i;

// 10. Guarantees (Immutable Safety)
export const GUARANTEE_CLAIM_REGEX =
  /\b(?:(?:we|i)\s+(?:can\s+)?guarantee\s+(?:100%|results|traffic|revenue|sales|leads|uptime|zero\s+bugs|bug-free)|100%\s+guarantee|unconditional\s+guarantee|bug-free\s+guarantee|guaranteed\s+delivery)\b/i;

/**
 * Extracts and normalizes pure numbers/amounts from currency or percentage tokens.
 */
function normalizeAmountToken(val: string): string {
  return val
    .toLowerCase()
    .replace(/[₹$€£,]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Checks if a specific claim value is present in authoritative verified sources:
 * 1. Verified Company Knowledge items (`verified: true`)
 * 2. Explicit current company instruction (`companyInstruction`)
 * 3. Verified company context (`pricingPolicy`, `services`, `description`)
 * 4. Company overrides (`updatedOverrides`)
 *
 * NOTE: Customer statements and previous AI responses NEVER establish company policy.
 */
export function isValueInAuthoritativeSources(
  rawClaim: string,
  context?: AuthoritativeCommercialContext
): boolean {
  if (!context) return false;

  const normalizedClaim = normalizeAmountToken(rawClaim);
  if (!normalizedClaim || normalizedClaim.length === 0) return false;

  const claimLower = rawClaim.toLowerCase().trim();

  // 1. Check Explicit Current Company Instruction
  if (context.companyInstruction && context.companyInstruction.trim().length > 0) {
    const instLower = context.companyInstruction.toLowerCase();
    if (instLower.includes(claimLower)) return true;
    const instNorm = normalizeAmountToken(context.companyInstruction);
    if (instNorm.includes(normalizedClaim)) return true;
  }

  // 2. Check Updated Overrides from Company
  if (context.updatedOverrides && context.updatedOverrides.length > 0) {
    for (const ov of context.updatedOverrides) {
      const ovText = typeof ov === 'string' ? ov.toLowerCase() : `${ov.field}: ${ov.currentValue}`.toLowerCase();
      if (ovText.includes(claimLower)) return true;
      const ovNorm = normalizeAmountToken(ovText);
      if (ovNorm.includes(normalizedClaim)) return true;
    }
  }

  // 3. Check Verified Company Knowledge Items (must have verified: true)
  if (context.companyKnowledge && context.companyKnowledge.length > 0) {
    const verifiedKnowledge = context.companyKnowledge.filter(
      (k) => k.verified === true || k.status === 'VERIFIED'
    );
    for (const item of verifiedKnowledge) {
      const combined = `${item.title} ${item.content}`.toLowerCase();
      if (combined.includes(claimLower)) return true;
      const normContent = normalizeAmountToken(combined);
      if (normContent.includes(normalizedClaim)) return true;
    }
  }

  // 4. Check Verified Company Context (pricingPolicy, description, services)
  if (context.companyContext) {
    const cc = context.companyContext;
    const combinedContext = `${cc.pricingPolicy || ''} ${cc.pricingModel || ''} ${cc.description || ''} ${(cc.services || []).join(' ')}`.toLowerCase();
    if (combinedContext.includes(claimLower)) return true;
    const normCC = normalizeAmountToken(combinedContext);
    if (normCC.includes(normalizedClaim)) return true;
  }

  return false;
}

/**
 * Detects all commercial claims within a draft text.
 */
export function detectCommercialClaims(text: string): DetectedCommercialClaim[] {
  const claims: DetectedCommercialClaim[] = [];
  if (!text || text.trim().length === 0) return claims;

  // 1. Immutable Guarantees
  const guaranteeMatch = text.match(GUARANTEE_CLAIM_REGEX);
  if (guaranteeMatch) {
    claims.push({
      type: 'guarantee',
      rawText: guaranteeMatch[0],
      matchedValue: guaranteeMatch[0],
      isImmutable: true,
      explanation: 'Unconditional guarantee or performance guarantee detected.',
    });
  }

  // 2. Immutable Contracts / Legal Commitments / NDAs
  const contractMatch = text.match(CONTRACT_LEGAL_CLAIM_REGEX);
  if (contractMatch) {
    claims.push({
      type: 'contract',
      rawText: contractMatch[0],
      matchedValue: contractMatch[0],
      isImmutable: true,
      explanation: 'Contractual, NDA, or legal binding commitment detected.',
    });
  }

  // 2B. Immutable Safety Patterns Catch-All
  const isOutboundImmutableViolated = IMMUTABLE_OUTBOUND_SAFETY_PATTERNS.some((p) =>
    p.test(text.toLowerCase())
  );
  if (isOutboundImmutableViolated && !claims.some((c) => c.isImmutable)) {
    claims.push({
      type: 'contract',
      rawText: text,
      matchedValue: 'immutable_safety_violation',
      isImmutable: true,
      explanation: 'Outbound immutable safety rule violated (contract, NDA, guarantee, exclusivity, or prompt leak).',
    });
  }

  // 3. Pricing / Cost Claims
  const priceMatches = text.match(STANDALONE_CURRENCY_REGEX);
  if (priceMatches) {
    for (const match of priceMatches) {
      claims.push({
        type: 'price',
        rawText: match,
        matchedValue: match,
        isImmutable: false,
        explanation: `Commercial pricing figure detected: "${match}".`,
      });
    }
  }

  // 4. Discounts
  const discountMatch = text.match(DISCOUNT_CLAIM_REGEX);
  if (discountMatch) {
    claims.push({
      type: 'discount',
      rawText: discountMatch[0],
      matchedValue: discountMatch[0],
      isImmutable: false,
      explanation: `Commercial discount claim detected: "${discountMatch[0]}".`,
    });
  }

  // 5. Commission / Revenue-Share
  const commMatch = text.match(COMMISSION_CLAIM_REGEX);
  if (commMatch) {
    claims.push({
      type: 'commission',
      rawText: commMatch[0],
      matchedValue: commMatch[0],
      isImmutable: false,
      explanation: `Commercial commission/revenue-share claim detected: "${commMatch[0]}".`,
    });
  }

  // 6. Equity
  const eqMatch = text.match(EQUITY_CLAIM_REGEX);
  if (eqMatch) {
    claims.push({
      type: 'equity',
      rawText: eqMatch[0],
      matchedValue: eqMatch[0],
      isImmutable: false,
      explanation: `Equity transfer or percentage commitment detected: "${eqMatch[0]}".`,
    });
  }

  // 7. Refunds
  const refundMatch = text.match(REFUND_CLAIM_REGEX);
  if (refundMatch) {
    claims.push({
      type: 'refund',
      rawText: refundMatch[0],
      matchedValue: refundMatch[0],
      isImmutable: false,
      explanation: `Refund or money-back commitment detected: "${refundMatch[0]}".`,
    });
  }

  // 8. Payment Terms
  const paymentMatch = text.match(PAYMENT_TERMS_CLAIM_REGEX);
  if (paymentMatch) {
    claims.push({
      type: 'payment_term',
      rawText: paymentMatch[0],
      matchedValue: paymentMatch[0],
      isImmutable: false,
      explanation: `Non-standard payment term commitment detected: "${paymentMatch[0]}".`,
    });
  }

  // 9. Delivery Timelines / Deadlines
  const timelineMatch = text.match(DELIVERY_TIMELINE_CLAIM_REGEX);
  if (timelineMatch) {
    claims.push({
      type: 'delivery_timeline',
      rawText: timelineMatch[0],
      matchedValue: timelineMatch[0],
      isImmutable: false,
      explanation: `Delivery timeline duration guarantee detected: "${timelineMatch[0]}".`,
    });
  }

  // 10. SLA Guarantees
  const slaMatch = text.match(SLA_CLAIM_REGEX);
  if (slaMatch) {
    claims.push({
      type: 'sla',
      rawText: slaMatch[0],
      matchedValue: slaMatch[0],
      isImmutable: false,
      explanation: `SLA or uptime commitment detected: "${slaMatch[0]}".`,
    });
  }

  return claims;
}

export interface CommercialClaimValidationResult {
  isValid: boolean;
  unsupportedClaims: DetectedCommercialClaim[];
  issues: string[];
}

/**
 * Validates all commercial claims in a text against authoritative sources.
 * Immutable claims (guarantees, contracts, NDAs) are NEVER allowed, even in edited drafts.
 * Standard commercial claims (price, discount, commission, terms) must be supported
 * by verified company knowledge or explicit current company instruction.
 */
export function validateCommercialClaims(
  text: string,
  context?: AuthoritativeCommercialContext
): CommercialClaimValidationResult {
  const claims = detectCommercialClaims(text);
  const unsupportedClaims: DetectedCommercialClaim[] = [];
  const issues: string[] = [];

  for (const claim of claims) {
    // Immutable safety rules can NEVER be overridden (guarantees, contractual commitments, NDAs, power of attorney)
    if (claim.isImmutable) {
      unsupportedClaims.push(claim);
      issues.push(`Send blocked: ${claim.explanation} Protected by immutable safety rules.`);
      continue;
    }

    // In an explicit company-edited workflow, an explicit company-approved/edit-entered value is allowed
    // as an explicit company instruction unless protected by immutable safety rules.
    if (context?.isCompanyEdited) {
      continue;
    }

    // Check if the claim is backed by verified company knowledge or explicit company instruction
    const isSupported = isValueInAuthoritativeSources(claim.matchedValue, context);
    if (!isSupported) {
      unsupportedClaims.push(claim);
      issues.push(
        `Send blocked: Unsupported commercial claim: "${claim.rawText}". This value was not provided by verified company knowledge or an explicit company instruction.`
      );
    }
  }

  return {
    isValid: unsupportedClaims.length === 0,
    unsupportedClaims,
    issues,
  };
}

/**
 * Deterministically sanitizes AI-generated drafts BEFORE presenting them in the approval queue.
 * Detects unsupported commercial claims (invented pricing, discounts, commissions, deadlines, guarantees)
 * and rewrites them into safe, consultative language while preserving the customer's actual request.
 * Does NOT fabricate replacement numbers.
 */
export function sanitizeCommercialClaimsInDraft(
  draft: string,
  customerMessage: string,
  context?: AuthoritativeCommercialContext
): string {
  if (!draft || draft.trim().length === 0) return draft;

  const validation = validateCommercialClaims(draft, context);
  if (validation.isValid) {
    return draft; // All claims are backed by verified sources
  }

  let sanitized = draft;

  const hasUnsupportedPrice = validation.unsupportedClaims.some((c) => c.type === 'price');
  const hasUnsupportedCommission = validation.unsupportedClaims.some(
    (c) => c.type === 'commission' || c.type === 'revenue_share' || c.type === 'equity'
  );
  const hasUnsupportedDiscount = validation.unsupportedClaims.some((c) => c.type === 'discount');
  const hasUnsupportedTimeline = validation.unsupportedClaims.some((c) => c.type === 'delivery_timeline');
  const hasUnsupportedGuarantee = validation.unsupportedClaims.some(
    (c) => c.type === 'guarantee' || c.type === 'contract'
  );
  const hasUnsupportedRefund = validation.unsupportedClaims.some((c) => c.type === 'refund');
  const hasUnsupportedPaymentTerm = validation.unsupportedClaims.some((c) => c.type === 'payment_term');
  const hasUnsupportedSla = validation.unsupportedClaims.some((c) => c.type === 'sla');

  // Case 1: Invented pricing detected (e.g. "our pricing typically ranges around ₹1,20,000")
  if (hasUnsupportedPrice) {
    // Replace whole sentences containing invented pricing with consultative response
    const pricingSentenceRegex =
      /[^.?!;\n]*?(?:our\s+pricing|pricing\s+typically|typically\s+ranges|ranges\s+around|starts\s+at|[₹$€£]\s*[\d,]+|\b\d+(?:,\d+)*(?:\s*(?:lakh|crore))\b)[^.?!;\n]*[.?!;\n]?/gi;

    sanitized = sanitized.replace(
      pricingSentenceRegex,
      "We'd be happy to prepare a detailed quotation for you. Could you share any additional requirements or your preferred timeline so we can provide an accurate estimate?\n\n"
    );
  }

  // Case 2: Invented commission / revenue share
  if (hasUnsupportedCommission) {
    const commSentenceRegex =
      /[^.?!;\n]*?(?:\d{1,2}%\s*(?:commission|revenue[- ]share|rev[- ]share|cut)|confirm\s+(?:the\s+)?\d{1,2}%\s*commission)[^.?!;\n]*[.?!;\n]?/gi;

    sanitized = sanitized.replace(
      commSentenceRegex,
      'Commercial partnership arrangements and commission percentages are evaluated with our leadership team before confirmation.\n\n'
    );
  }

  // Case 3: Invented discount
  if (hasUnsupportedDiscount) {
    const discSentenceRegex =
      /[^.?!;\n]*?(?:\d{1,2}%\s*discount|(?:offer|give)\s+(?:you\s+)?a\s+\d{1,2}%\s*discount)[^.?!;\n]*[.?!;\n]?/gi;

    sanitized = sanitized.replace(
      discSentenceRegex,
      'Our fee structures and any commercial flexibility are reviewed by our management team alongside the confirmed deliverable scope.\n\n'
    );
  }

  // Case 4: Invented timeline promises (e.g. "will be ready in 3 weeks")
  if (hasUnsupportedTimeline) {
    const timeSentenceRegex =
      /[^.?!;\n]*?(?:ready\s+in|completed\s+in|delivered\s+in)\s+\d+\s+(?:days?|weeks?|months?)[^.?!;\n]*[.?!;\n]?/gi;

    sanitized = sanitized.replace(
      timeSentenceRegex,
      'Firm completion timelines are determined once engineering resources and detailed technical scope are reviewed.\n\n'
    );
  }

  // Case 5: Unapproved guarantees, SLAs, refunds, payment terms, or contracts
  if (hasUnsupportedGuarantee || hasUnsupportedSla || hasUnsupportedRefund || hasUnsupportedPaymentTerm) {
    sanitized = sanitized
      .replace(/\b(?:100%\s+guarantee|unconditional\s+guarantee|bug-free\s+guarantee|money-back\s+guarantee)\b/gi, 'our commitment to quality delivery')
      .replace(/\b(?:guarantee\s+that|we\s+guarantee)\b/gi, 'we aim to ensure')
      .replace(/\b(?:(?:we|i)\s+(?:sign|execute|accept)\s+(?:the|your)\s*(?:contract|nda))\b/gi, 'our leadership team reviews contractual agreements')
      .replace(/\b(?:99\.9+%?\s+uptime\s+sla|commit\s+to\s+a\s+99\.9%\s+uptime)\b/gi, 'standard operational service levels')
      .replace(/\b(?:we\s+will\s+(?:issue\s+a\s+)?(?:full\s+)?refund)\b/gi, 'commercial refund requests are handled according to company review');
  }

  // Strip any lingering raw currency amounts that remain unsupported
  const remainingUnsupported = validateCommercialClaims(sanitized, context);
  if (!remainingUnsupported.isValid) {
    for (const claim of remainingUnsupported.unsupportedClaims) {
      if (claim.type === 'price') {
        sanitized = sanitized.split(claim.rawText).join('');
      }
    }
  }

  // Clean up double spaces or awkward punctuation from replacements
  sanitized = sanitized
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return sanitized;
}

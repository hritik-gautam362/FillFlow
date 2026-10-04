/**
 * Company Instruction Parser & Constraint Analyzer
 *
 * Enforces the core business rule:
 * Company instructions are AUTHORITATIVE CONSTRAINTS that take strict precedence
 * over customer proposals, previous AI responses, and conversation history.
 *
 * Priority order:
 * 1. Explicit current company instruction
 * 2. Verified company knowledge
 * 3. Current customer message
 * 4. Relevant historical conversation context
 * 5. Previous AI-generated responses
 */

export type CompanyPosition =
  | 'REJECT' // do not agree, don't agree, reject, decline, cannot accept, won't accept, not approved, not authorized, not offering, not comfortable with, do not offer, do not commit
  | 'ACCEPT' // agree, accept, confirm, approve, can offer, okay with, open to, will accept
  | 'CONDITIONAL' // accept only if, can offer X not Y, counter, negotiate, offer X only
  | 'DEFER_OR_DISCUSS' // want to discuss, want to negotiate, discuss commercial terms first, review first, understand expectations first
  | 'PROHIBIT_MENTION' // do not mention, don't mention, do not promise, don't promise
  | 'INSTRUCTION_GENERAL';

export type CompanyInstructionTopic =
  | 'revenue_share'
  | 'commission'
  | 'discount'
  | 'pricing'
  | 'equity'
  | 'deadline'
  | 'guarantee'
  | 'exclusivity'
  | 'payment_terms'
  | 'refund'
  | 'general';

export interface CompanyInstructionConstraint {
  rawInstruction: string;
  topic: CompanyInstructionTopic;
  position: CompanyPosition;
  explicitlyNegated: boolean;
  subjectTerm?: string;
  allowedNumbers: string[];
  prohibitedNumbers: string[];
  allowedTerms: string[];
  prohibitedTerms: string[];
  counterOffer?: string;
  discussFirst: boolean;
  mustPreserveRefusal: boolean;
  summaryText: string;
}

const NEGATION_PATTERNS = [
  /\b(?:we\s+)?do\s+not\s+agree\b/i,
  /\b(?:we\s+)?don'?t\s+agree\b/i,
  /\b(?:we\s+)?reject\b/i,
  /\b(?:we\s+)?decline\b/i,
  /\b(?:we\s+)?cannot\s+accept\b/i,
  /\b(?:we\s+)?can'?t\s+accept\b/i,
  /\b(?:we\s+)?won'?t\s+accept\b/i,
  /\b(?:we\s+)?will\s+not\s+accept\b/i,
  /\b(?:we\s+)?do\s+not\s+accept\b/i,
  /\b(?:we\s+)?don'?t\s+accept\b/i,
  /\bdo\s+not\s+offer\b/i,
  /\bdon'?t\s+offer\b/i,
  /\b(?:we\s+)?cannot\s+offer\b/i,
  /\b(?:we\s+)?can'?t\s+offer\b/i,
  /\bdo\s+not\s+mention\b/i,
  /\bdon'?t\s+mention\b/i,
  /\bdo\s+not\s+commit\b/i,
  /\bdon'?t\s+commit\b/i,
  /\bdo\s+not\s+promise\b/i,
  /\bdon'?t\s+promise\b/i,
  /\b(?:we\s+)?cannot\s+promise\b/i,
  /\b(?:we\s+)?can'?t\s+promise\b/i,
  /\bnot\s+approved\b/i,
  /\bnot\s+authorized\b/i,
  /\b(?:we\s+are\s+|we'?re\s+)?not\s+offering\b/i,
  /\b(?:we\s+are\s+|we'?re\s+)?not\s+comfortable\s+with\b/i,
  /\b(?:we\s+are\s+|we'?re\s+)?not\s+accepting\b/i,
  /\bnot\s+(?:the\s+)?\d+%\b/i,
  /\bnot\s+to\s+exceed\b/i,
  /\bnothing\s+higher\b/i,
];

const DISCUSS_FIRST_PATTERNS = [
  /\b(?:would\s+like\s+to|want\s+to|let'?s)\s+discuss\s+(?:the\s+)?(?:commercial\s+terms|terms|expectations|structure)\s+first\b/i,
  /\bdiscuss\s+(?:the\s+)?(?:commercial\s+terms|terms|structure)\s+first\b/i,
  /\bunderstand\s+(?:their\s+)?expectations\s+first\b/i,
  /\bdiscuss\s+the\s+commercial\s+terms\b/i,
  /\bwant\s+to\s+discuss\b/i,
  /\bwant\s+to\s+negotiate\b/i,
  /\bconnect\s+to\s+discuss\b/i,
];

export function parseCompanyInstruction(instruction: string): CompanyInstructionConstraint {
  const raw = (instruction || '').trim();
  const lower = raw.toLowerCase();

  const isNegated = NEGATION_PATTERNS.some((p) => p.test(lower));
  const discussFirst = DISCUSS_FIRST_PATTERNS.some((p) => p.test(lower));

  // Extract all percentages
  const pctMatches = Array.from(lower.matchAll(/(\d{1,2}%|\d{1,2}\s*percent)/gi)).map(
    (m) => m[0].replace(/\s*percent/i, '%').trim()
  );

  // Determine topic
  let topic: CompanyInstructionTopic = 'general';
  if (/\b(?:rev(?:enue)?[- ]?share)\b/i.test(lower)) {
    topic = 'revenue_share';
  } else if (/\b(?:commission|referral\s+(?:fee|cut)?)\b/i.test(lower)) {
    topic = 'commission';
  } else if (/\bdiscount\b/i.test(lower)) {
    topic = 'discount';
  } else if (/\bequity\b/i.test(lower)) {
    topic = 'equity';
  } else if (/\b(?:exclusiv\w*)\b/i.test(lower)) {
    topic = 'exclusivity';
  } else if (/\b(?:deadline|delivery|within\s+\d+\s+days?|in\s+\d+\s+days?|schedule)\b/i.test(lower)) {
    topic = 'deadline';
  } else if (/\b(?:guarantee|guaranteed)\b/i.test(lower)) {
    topic = 'guarantee';
  } else if (/\b(?:refund|money[- ]back)\b/i.test(lower)) {
    topic = 'refund';
  } else if (/\b(?:payment\s+terms|milestones|upfront)\b/i.test(lower)) {
    topic = 'payment_terms';
  } else if (/\b(?:pricing|price|cost|quote|rates?)\b/i.test(lower)) {
    topic = 'pricing';
  }

  // Determine position
  let position: CompanyPosition = 'INSTRUCTION_GENERAL';
  let counterOffer: string | undefined = undefined;
  const allowedNumbers: string[] = [];
  const prohibitedNumbers: string[] = [];
  const prohibitedTerms: string[] = [];
  const allowedTerms: string[] = [];

  // Conditional / Counter-offer check: e.g. "We can offer 10%, not 20%", "10% discount only", "nothing higher than 10%"
  const counterMatch = lower.match(
    /(?:can\s+offer|offer)\s+(\d{1,2}%)\s*,?\s*not\s+(\d{1,2}%)/i
  );
  const onlyMatch = lower.match(/(\d{1,2}%)\s*(?:discount|commission|revenue\s*share)?\s*(?:only|nothing\s+higher)/i);

  if (counterMatch) {
    position = 'CONDITIONAL';
    counterOffer = counterMatch[1];
    allowedNumbers.push(counterMatch[1]);
    prohibitedNumbers.push(counterMatch[2]);
  } else if (onlyMatch) {
    position = 'CONDITIONAL';
    counterOffer = onlyMatch[1];
    allowedNumbers.push(onlyMatch[1]);
  } else if (isNegated) {
    if (/\b(?:do\s+not\s+mention|don'?t\s+mention)\b/i.test(lower)) {
      position = 'PROHIBIT_MENTION';
    } else {
      position = 'REJECT';
    }
    // Negated percentages become prohibited numbers
    pctMatches.forEach((p) => {
      if (!prohibitedNumbers.includes(p)) prohibitedNumbers.push(p);
    });
  } else if (discussFirst && pctMatches.length === 0) {
    position = 'DEFER_OR_DISCUSS';
  } else if (/\b(?:we\s+can\s+offer|offer\s+them|give\s+them|agree|accept|okay\s+with|open\s+to)\b/i.test(lower)) {
    position = 'ACCEPT';
    pctMatches.forEach((p) => {
      if (!allowedNumbers.includes(p)) allowedNumbers.push(p);
    });
  } else if (discussFirst) {
    position = 'DEFER_OR_DISCUSS';
  }

  // Extract subject term (e.g. "30% revenue share", "20% commission", "delivery within 7 days", "exclusivity clause")
  let subjectTerm: string | undefined = undefined;
  if (topic === 'revenue_share') {
    const p = pctMatches[0] || '30%';
    subjectTerm = `${p} revenue share`;
  } else if (topic === 'commission') {
    const p = pctMatches[0] || '20%';
    subjectTerm = `${p} commission`;
  } else if (topic === 'discount') {
    const p = pctMatches[0] || '10%';
    subjectTerm = `${p} discount`;
  } else if (topic === 'equity') {
    const p = pctMatches[0] || 'equity';
    subjectTerm = `${p} equity`;
  } else if (topic === 'deadline') {
    const daysMatch = lower.match(/\b\d+\s*days?\b/i);
    subjectTerm = daysMatch ? `delivery within ${daysMatch[0]}` : 'delivery deadline';
  } else if (topic === 'exclusivity') {
    subjectTerm = 'exclusivity clause';
  }

  // Populate prohibited terms based on position and topic
  if (position === 'REJECT') {
    if (topic === 'revenue_share' || topic === 'commission') {
      const p = pctMatches[0] || '';
      if (p) {
        prohibitedTerms.push(
          `agree to ${p}`,
          `accept ${p}`,
          `confirm ${p}`,
          `open to discussing a ${p}`,
          `open to discussing ${p}`,
          `open to a ${p}`,
          `open to ${p}`,
          `offer ${p}`,
          `can offer ${p}`
        );
      }
    } else if (topic === 'exclusivity') {
      prohibitedTerms.push(
        'agree to exclusivity',
        'open to exclusivity',
        'exclusive partnership',
        'exclusivity agreement'
      );
    } else if (topic === 'deadline' || topic === 'guarantee') {
      const days = lower.match(/\b\d+\s*days?\b/i)?.[0] || '7 days';
      prohibitedTerms.push(
        `promise delivery within ${days}`,
        `guarantee delivery in ${days}`,
        `deliver within ${days}`,
        `delivered within ${days}`,
        `ready in ${days}`,
        `should be able to deliver within ${days}`
      );
    } else if (topic === 'discount') {
      const p = pctMatches[0] || '';
      if (p) {
        prohibitedTerms.push(
          `offer a ${p} discount`,
          `offer ${p} discount`,
          `can offer a ${p} discount`,
          `can offer you a ${p} discount`,
          `agree to a ${p} discount`,
          `give you a ${p} discount`
        );
      } else {
        prohibitedTerms.push(
          'offer a discount',
          'offer you a discount',
          'give you a discount',
          'pleased to offer you a discount',
          'happy to offer you a discount',
          'can offer a discount'
        );
      }
    }
  } else if (position === 'PROHIBIT_MENTION') {
    if (topic === 'pricing') {
      prohibitedTerms.push('pricing', '$', '₹', 'usd', 'inr', 'fixed price', 'fee');
    } else if (topic === 'deadline') {
      const days = lower.match(/\b\d+\s*days?\b/i)?.[0] || '7 days';
      prohibitedTerms.push(`promise delivery within ${days}`, `will deliver within ${days}`);
    }
  }

  const mustPreserveRefusal = position === 'REJECT' && isNegated;

  return {
    rawInstruction: raw,
    topic,
    position,
    explicitlyNegated: isNegated,
    subjectTerm,
    allowedNumbers,
    prohibitedNumbers,
    allowedTerms,
    prohibitedTerms,
    counterOffer,
    discussFirst,
    mustPreserveRefusal,
    summaryText: `${position} ${topic}${subjectTerm ? ` (${subjectTerm})` : ''}`,
  };
}

export interface InstructionValidationResult {
  isValid: boolean;
  issues: string[];
  conflictDetails?: string;
}

/**
 * Validates a generated customer response against an explicit company instruction.
 * Strictly prevents the AI from reversing, weakening, or reinterpreting company decisions.
 */
export function validateDraftAgainstCompanyInstruction(
  draft: string,
  instruction: string
): InstructionValidationResult {
  if (!instruction || !instruction.trim() || !draft || !draft.trim()) {
    return { isValid: true, issues: [] };
  }

  const constraint = parseCompanyInstruction(instruction);
  const issues: string[] = [];
  const lowerDraft = draft.toLowerCase();

  // 1. RULE: NEVER REVERSE AN EXPLICIT REFUSAL OR NEGATION
  if (constraint.mustPreserveRefusal) {
    // Check if the draft falsely agrees to, accepts, offers, or tentatively opens discussion of the refused terms
    for (const term of constraint.prohibitedTerms) {
      if (lowerDraft.includes(term.toLowerCase())) {
        issues.push(
          `Semantic conflict with company instruction: Company instruction explicitly refuses/prohibits "${constraint.subjectTerm || constraint.topic}", but draft contains prohibited term: "${term}".`
        );
      }
    }

    // Check if prohibited numbers are embraced affirmatively
    for (const pNum of constraint.prohibitedNumbers) {
      // Regex to detect affirmative usage of prohibited number (e.g. "open to discussing a 30% revenue-share", "can offer 30%", "accept 30%")
      const affirmativeUsage = new RegExp(
        `\\b(?:agree\\s+to|accept|confirm|offer|can\\s+offer|open\\s+to\\s+(?:discussing\\s+)?(?:a\\s+)?|willing\\s+to)\\s+(?:the\\s+|a\\s+)?${pNum.replace('%', '\\s*%')}`,
        'i'
      );
      if (affirmativeUsage.test(lowerDraft)) {
        issues.push(
          `Semantic conflict with company instruction: Company instruction explicitly refuses ${pNum}, but draft affirmatively offers or agrees to it.`
        );
      }
    }

    // Check that refusal is preserved in the draft:
    // If the instruction specifically says "do not agree to X" or "reject X",
    // the draft must clearly express non-agreement / inability to accept / deferral, NOT acceptance.
    const hasRefusalExpression =
      /\b(?:do\s+not\s+agree|don'?t\s+agree|cannot\s+(?:agree|accept)|can'?t\s+(?:agree|accept)|unable\s+to\s+(?:agree|accept)|aren'?t\s+able\s+to\s+(?:agree|accept)|not\s+able\s+to\s+(?:agree|accept)|reject|decline|cannot\s+commit|can'?t\s+commit|cannot\s+promise|can'?t\s+promise|cannot\s+offer|can'?t\s+offer)\b/i.test(
        lowerDraft
      );

    // If the draft contains the prohibited number, it MUST have a refusal expression next to it or in the sentence
    for (const pNum of constraint.prohibitedNumbers) {
      if (lowerDraft.includes(pNum.toLowerCase()) && !hasRefusalExpression) {
        issues.push(
          `Semantic conflict with company instruction: Draft mentions refused term ${pNum} without explicitly stating the company's refusal or inability to accept it.`
        );
      }
    }
  }

  // 2. RULE: STRICTLY ENFORCE CONDITIONAL / COUNTER OFFERS (e.g. "offer 10%, not 20%")
  if (constraint.position === 'CONDITIONAL') {
    for (const pNum of constraint.prohibitedNumbers) {
      const offeredProhibited = new RegExp(
        `\\b(?:offer|can\\s+offer|give|agree\\s+to|accept)\\s+(?:a\\s+|the\\s+)?${pNum.replace('%', '\\s*%')}`,
        'i'
      );
      if (offeredProhibited.test(lowerDraft)) {
        issues.push(
          `Semantic conflict with company instruction: Instruction forbids offering ${pNum}, but draft offers it.`
        );
      }
    }

    for (const aNum of constraint.allowedNumbers) {
      if (!lowerDraft.includes(aNum.toLowerCase())) {
        issues.push(
          `Semantic conflict with company instruction: Instruction specifies offering ${aNum}, but draft omits it.`
        );
      }
    }
  }

  // 3. RULE: STRICTLY ENFORCE PROHIBIT_MENTION (e.g. "Do not mention pricing yet")
  if (constraint.position === 'PROHIBIT_MENTION') {
    if (constraint.topic === 'pricing') {
      const mentionsPrice = /(?:\$|€|£|₹|Rs\.?|INR|USD)\s*[\d,]+|\b\d+(?:,\d+)*(?:\s*(?:lakh|crore|k|thousand))\b/i.test(
        draft
      );
      if (mentionsPrice) {
        issues.push(
          `Semantic conflict with company instruction: Instruction explicitly forbids mentioning pricing, but draft contains numeric price figures.`
        );
      }
    } else if (constraint.topic === 'deadline') {
      const mentionsDeadlinePromise = /\b(?:promise|guarantee|will\s+deliver|ready\s+in)\s+\d+\s+days?\b/i.test(
        lowerDraft
      );
      if (mentionsDeadlinePromise) {
        issues.push(
          `Semantic conflict with company instruction: Instruction explicitly forbids promising delivery deadline, but draft promises it.`
        );
      }
    }
  }

  // 4. RULE: EXCLUSIVITY CLAUSE NEGATION
  if (constraint.topic === 'exclusivity' && constraint.explicitlyNegated) {
    const hasAffirmativeAcceptance = /\b(?:accept|agree\s+to|open\s+to|confirm)\s+(?:the\s+)?exclusiv\w*\b/i.test(lowerDraft);
    const hasRefusalNegation = /\b(?:do\s+not|don'?t|cannot|can'?t|unable\s+to|aren'?t\s+able\s+to|not\s+able\s+to)\s+(?:accept|agree\s+to|open\s+to|confirm)\s+(?:the\s+)?exclusiv\w*\b/i.test(lowerDraft);
    if (hasAffirmativeAcceptance && !hasRefusalNegation) {
      issues.push(
        `Semantic conflict with company instruction: Instruction refuses exclusivity, but draft accepts or opens discussion on exclusivity.`
      );
    }
  }

  const isValid = issues.length === 0;
  return {
    isValid,
    issues,
    conflictDetails: issues.length > 0 ? issues.join('; ') : undefined,
  };
}

/**
 * Reusable placeholder and template text detector.
 *
 * Detects unresolved placeholder templates, bracketed example options,
 * and template instructions in customer emails.
 *
 * Distinguishes genuine customer selections (e.g. "We prefer Razorpay.")
 * from unresolved placeholder templates (e.g. "[Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe]").
 */

export interface DetectedPlaceholder {
  raw: string;
  placeholderType: 'bracket' | 'angle' | 'curly' | 'template_example' | 'choice_list';
  label: string;
  options: string[];
  startIndex: number;
  endIndex: number;
}

// Patterns that identify bracketed or enclosed placeholder templates
const BRACKET_PLACEHOLDER_REGEX = /\[([^\]]{2,150})\]/g;
const ANGLE_PLACEHOLDER_REGEX = /<([^>]{2,100})>/g;
const CURLY_PLACEHOLDER_REGEX = /\{([^}]{2,100})\}/g;

// Indicators that enclosed text is an unresolved placeholder / template example
const PLACEHOLDER_INDICATOR_REGEX = /\b(e\.g\.?|for example|choose(?:\s+one)?|select(?:\s+one)?|optional|insert|enter|your\s+choice|preferred|or|\/)\b/i;

// Regex to extract candidate option tokens separated by slashes or commas
const OPTION_SPLIT_REGEX = /\s*(?:\/|\bor\b|,)\s*/i;

/**
 * Parses options from placeholder text (e.g. "Razorpay / Paytm / Stripe" -> ["Razorpay", "Paytm", "Stripe"])
 */
function extractOptionsFromText(text: string): string[] {
  // Strip introductory prefixes like "e.g.,", "choose one:", "preferred payment gateway, e.g."
  const cleaned = text
    .replace(/^(?:preferred\s+[a-z\s]+,?\s*)?(?:e\.g\.?|for example|choose(?:\s+one)?:?|select(?:\s+one)?:?|options?:?)\s*/i, '')
    .trim();

  const parts = cleaned
    .split(OPTION_SPLIT_REGEX)
    .map((p) => p.replace(/[^\w\s-]/g, '').trim())
    .filter((p) => p.length >= 2 && !/^(?:e|g|eg|or|and|the|a|an)$/i.test(p));

  return parts;
}

/**
 * Detects all unresolved placeholders within a given text.
 */
export function detectPlaceholders(text: string): DetectedPlaceholder[] {
  if (!text || typeof text !== 'string') return [];

  const results: DetectedPlaceholder[] = [];
  const seenSpans = new Set<string>();

  // 1. Bracketed placeholders: [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe]
  let match: RegExpExecArray | null;
  const bracketRegex = new RegExp(BRACKET_PLACEHOLDER_REGEX.source, 'gi');
  while ((match = bracketRegex.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1].trim();
    const spanKey = `${match.index}:${match.index + raw.length}`;

    // Treat as placeholder if it contains template indicators, slashes, or placeholder keywords
    const isPlaceholder =
      PLACEHOLDER_INDICATOR_REGEX.test(inner) ||
      inner.includes('/') ||
      /\b(placeholder|tbd|to be decided|insert|enter|select|choose|preferred|standard\s*\/\s*guest)\b/i.test(inner);

    if (isPlaceholder && !seenSpans.has(spanKey)) {
      seenSpans.add(spanKey);
      results.push({
        raw,
        placeholderType: 'bracket',
        label: inner,
        options: extractOptionsFromText(inner),
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  // 2. Angle bracket placeholders: <Preferred Payment Gateway>
  const angleRegex = new RegExp(ANGLE_PLACEHOLDER_REGEX.source, 'gi');
  while ((match = angleRegex.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1].trim();
    const spanKey = `${match.index}:${match.index + raw.length}`;

    const isPlaceholder =
      PLACEHOLDER_INDICATOR_REGEX.test(inner) ||
      inner.includes('/') ||
      /\b(placeholder|insert|enter|select|choose|preferred)\b/i.test(inner);

    if (isPlaceholder && !seenSpans.has(spanKey)) {
      seenSpans.add(spanKey);
      results.push({
        raw,
        placeholderType: 'angle',
        label: inner,
        options: extractOptionsFromText(inner),
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  // 3. Curly brace placeholders: {Preferred Payment Gateway}
  const curlyRegex = new RegExp(CURLY_PLACEHOLDER_REGEX.source, 'gi');
  while ((match = curlyRegex.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1].trim();
    const spanKey = `${match.index}:${match.index + raw.length}`;

    const isPlaceholder =
      PLACEHOLDER_INDICATOR_REGEX.test(inner) ||
      inner.includes('/') ||
      /\b(placeholder|insert|enter|select|choose|preferred)\b/i.test(inner);

    if (isPlaceholder && !seenSpans.has(spanKey)) {
      seenSpans.add(spanKey);
      results.push({
        raw,
        placeholderType: 'curly',
        label: inner,
        options: extractOptionsFromText(inner),
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  // 4. Standalone slash-separated template choices without brackets: "standard / guest / multi-step checkout"
  const standaloneChoiceRegex = /\b(?:choose(?:\s+one)?|preferred|options?):\s*([a-z0-9\s/,-]{5,60})\b/gi;
  while ((match = standaloneChoiceRegex.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1].trim();
    const spanKey = `${match.index}:${match.index + raw.length}`;
    if (inner.includes('/') && !seenSpans.has(spanKey)) {
      seenSpans.add(spanKey);
      results.push({
        raw,
        placeholderType: 'choice_list',
        label: inner,
        options: extractOptionsFromText(inner),
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  return results;
}

/**
 * Returns true if text contains any unresolved placeholders.
 */
export function hasUnresolvedPlaceholders(text: string): boolean {
  return detectPlaceholders(text).length > 0;
}

/**
 * Sanitizes message text by masking unresolved placeholder content with a neutral token.
 * This ensures fact-extraction algorithms NEVER extract options inside placeholders
 * as customer-selected facts!
 */
export function sanitizeTextForFactExtraction(text: string): {
  sanitizedText: string;
  placeholders: DetectedPlaceholder[];
} {
  const placeholders = detectPlaceholders(text);
  if (placeholders.length === 0) {
    return { sanitizedText: text, placeholders: [] };
  }

  let sanitized = text;
  // Replace from end to beginning to keep string indices intact
  const sorted = [...placeholders].sort((a, b) => b.startIndex - a.startIndex);
  for (const ph of sorted) {
    sanitized =
      sanitized.substring(0, ph.startIndex) +
      `[UNRESOLVED_PLACEHOLDER: ${ph.label}]` +
      sanitized.substring(ph.endIndex);
  }

  return { sanitizedText: sanitized, placeholders };
}

/**
 * Checks whether the AI reply falsely hallucinated that the customer
 * selected an option that was only listed in an unresolved placeholder.
 */
export function detectPlaceholderHallucinations(
  replyText: string,
  clientMessage: string
): string[] {
  const placeholders = detectPlaceholders(clientMessage);
  if (placeholders.length === 0) return [];

  const lowerReply = (replyText || '').toLowerCase();
  const issues: string[] = [];

  for (const ph of placeholders) {
    for (const opt of ph.options) {
      if (opt.length < 3) continue;
      const lowerOpt = opt.toLowerCase();

      // Check if customer made an explicit selection outside the placeholder
      // e.g. "I prefer Razorpay. [Payment: Razorpay / Stripe]" vs purely in placeholder
      const textWithoutPlaceholder = clientMessage.replace(ph.raw, '');
      const optWordRegex = new RegExp(`\\b${escapeRegExp(lowerOpt)}\\b`, 'i');
      const explicitlySelectedByCustomer = optWordRegex.test(textWithoutPlaceholder);

      if (!explicitlySelectedByCustomer) {
        // Did AI reply claim the customer selected or chose this option?
        const hallucinationPatterns = [
          new RegExp(`(?:since you (?:chose|selected|prefer|opted for)|now that you selected|with your choice of|you mentioned preferring|you preferred)\\s+[^.?!]*\\b${escapeRegExp(lowerOpt)}\\b`, 'i'),
          new RegExp(`(?:for your|using your)\\s+${escapeRegExp(lowerOpt)}\\s+(?:checkout|gateway|integration|setup)`, 'i'),
          new RegExp(`(?:you have (?:chosen|selected|opted for))\\s+[^.?!]*\\b${escapeRegExp(lowerOpt)}\\b`, 'i'),
        ];

        for (const pattern of hallucinationPatterns) {
          if (pattern.test(lowerReply)) {
            issues.push(
              `Placeholder hallucination: The customer provided an unresolved placeholder template ("${ph.raw}"), but the response claimed the customer selected "${opt}".`
            );
            break;
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Generates a polite, natural clarification prompt for detected placeholders.
 */
export function formatPlaceholderClarification(placeholders: DetectedPlaceholder[]): string | null {
  if (!placeholders || placeholders.length === 0) return null;

  const questions: string[] = [];
  for (const ph of placeholders) {
    const lower = ph.label.toLowerCase();
    if (lower.includes('payment') || lower.includes('gateway') || ph.options.some((o) => /razorpay|paytm|stripe|paypal/i.test(o))) {
      questions.push('which payment gateway you would like to integrate');
    } else if (lower.includes('checkout') || ph.options.some((o) => /standard|guest|multi-step/i.test(o))) {
      questions.push('whether you prefer a standard, guest, or multi-step checkout flow');
    } else if (ph.options.length > 0) {
      questions.push(`which option you prefer (${ph.options.join(' / ')})`);
    } else {
      questions.push(`your preferred choice for ${ph.label}`);
    }
  }

  if (questions.length === 0) return null;
  if (questions.length === 1) {
    return `Could you please confirm ${questions[0]}?`;
  }
  return `Could you please confirm ${questions.slice(0, -1).join(', ')} and ${questions[questions.length - 1]}?`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

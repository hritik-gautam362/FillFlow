import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, Prisma } from '@prisma/client';
import {
  AiApprovalItem,
  ApprovalStatus,
  DraftVariationStyle,
  CreateApprovalItemInput,
  SendApprovalItemResult,
} from '@/lib/ai/approvalTypes';
import {
  generateDraftVariations,
  regenerateDraftVariation,
  generateDraftsFromCompanyInstruction,
} from '@/lib/ai/draftVariationEngine';
import { validateCustomerResponse, ResponseValidationResult } from '@/lib/ai/responseValidator';
import { reserveEmailQuota, commitEmailQuota, releaseEmailQuota } from './emailQuotaService';
import { EmailProvider, SendEmailResult } from './email/EmailProvider';
import { GoogleProvider } from './email/GoogleProvider';
import { getGoogleProviderForCompany } from './email/emailProviderFactory';
import { IMMUTABLE_OUTBOUND_SAFETY_PATTERNS } from '@/lib/ai/permissionEngine';
import { AIActivityLogEntry } from '@/lib/ai/permissionTypes';
import {
  parseCompanyInstruction,
  validateDraftAgainstCompanyInstruction,
} from '@/lib/ai/companyInstructionParser';

// Fast in-memory cache for approval items, dual-persisted to AutomationConnection.metadata.approvalQueue
const memoryApprovalQueue = new Map<string, AiApprovalItem>();

// In-flight sending tracker to strictly prevent concurrent double-sends
const inFlightSendingItems = new Set<string>();

export function resetMemoryApprovalQueue(): void {
  memoryApprovalQueue.clear();
  inFlightSendingItems.clear();
}

/**
 * Creates and queues a new AI approval item.
 */
export async function createApprovalItem(input: CreateApprovalItemInput): Promise<AiApprovalItem> {
  const itemId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // If variations were not precomputed, generate them dynamically
  const variations = input.variations || generateDraftVariations({
    messageText: input.latestCustomerMessage,
    baseDraft: input.baseDraft,
    restrictedTopics: input.restrictedTopics,
    intent: input.intent,
  });

  const selectedVariation: DraftVariationStyle = 'professional';
  const currentDraft = variations.professional;
  const originalAiDraft = variations.professional;

  const defaultTimeline: AIActivityLogEntry[] = [
    {
      id: `act_${Date.now()}_1`,
      timestamp: now,
      step: 'Email Received',
      details: `Inbound customer inquiry analyzed (Intent: ${input.intent})`,
      status: 'success' as const,
    },
    {
      id: `act_${Date.now()}_2`,
      timestamp: now,
      step: 'Permission Evaluation',
      details: `Assigned Risk: ${input.riskLevel}, Decision: ${input.permissionDecision}`,
      status: input.permissionDecision === 'BLOCKED' ? ('error' as const) : ('warning' as const),
    },
    {
      id: `act_${Date.now()}_3`,
      timestamp: now,
      step: 'Draft Variations Generated',
      details: 'Generated 3 response options: Professional, Warm, and Concise',
      status: 'success' as const,
    },
  ];

  if (input.holdingResponseSent) {
    defaultTimeline.push({
      id: `act_${Date.now()}_4`,
      timestamp: now,
      step: 'Holding Response Dispatched',
      details: 'Sent customer holding response acknowledging receipt without committing to terms',
      status: 'success' as const,
    });
  }

  defaultTimeline.push({
    id: `act_${Date.now()}_5`,
    timestamp: now,
    step: 'Awaiting Company Approval',
    details: 'Placed in company queue for review, draft selection, or custom editing',
    status: 'pending' as const,
  });

  const item: AiApprovalItem = {
    id: itemId,
    companyId: input.companyId,
    leadId: input.leadId,
    gmailThreadId: input.gmailThreadId,
    inboundMessageId: input.inboundMessageId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerCompanyName: input.customerCompanyName,
    subject: input.subject,
    latestCustomerMessage: input.latestCustomerMessage,
    conversationHistory: input.conversationHistory || [],
    intent: input.intent,
    riskLevel: input.riskLevel,
    permissionDecision: input.permissionDecision,
    restrictedTopics: input.restrictedTopics,
    whyApprovalRequired: input.whyApprovalRequired,
    currentTurnRequirements: input.currentTurnRequirements || [],
    commercialTermsDetected: input.commercialTermsDetected || [],
    updatedOverrides: input.updatedOverrides || [],
    customerHoldingResponse: input.customerHoldingResponse,
    holdingResponseSent: Boolean(input.holdingResponseSent),
    holdingResponseSentAt: input.holdingResponseSent ? now : undefined,
    holdingOutboundMessageId: input.holdingOutboundMessageId,
    variations: {
      professional: variations.professional,
      relationship: variations.relationship,
      warm: variations.relationship,
      concise: variations.concise,
    },
    selectedVariation,
    currentDraft,
    originalAiDraft,
    regeneratedVersions: [],
    isEdited: false,
    companyInstruction: input.companyInstruction,
    status: 'PENDING',
    activityTimeline: input.activityTimeline || defaultTimeline,
    inReplyTo: input.inReplyTo || input.inboundMessageId,
    references: input.references || input.inboundMessageId,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Store in memory queue
  memoryApprovalQueue.set(item.id, item);

  // 2. Persist in AutomationConnection metadata for the company
  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId: input.companyId,
          automationType: 'email',
        },
      },
    });

    if (connection) {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const approvalQueue = (currentMeta.approvalQueue as Record<string, AiApprovalItem>) || {};
      approvalQueue[item.id] = item;

      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...currentMeta,
            approvalQueue,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  } catch (err) {
    console.warn(`[AI Approval Service] Non-critical persistence error in createApprovalItem:`, err);
  }

  return item;
}

/**
 * Retrieves a single approval item by ID with company isolation enforcement.
 */
export async function getApprovalItem(
  companyId: string,
  itemId: string
): Promise<AiApprovalItem | null> {
  // Check memory queue first
  const memItem = memoryApprovalQueue.get(itemId);
  if (memItem) {
    if (memItem.companyId !== companyId) {
      return null; // Company isolation: forbidden
    }
    return memItem;
  }

  // Check database
  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: 'email',
        },
      },
    });

    if (!connection) return null;

    const currentMeta = (connection.metadata as Record<string, unknown>) || {};
    const approvalQueue = (currentMeta.approvalQueue as Record<string, AiApprovalItem>) || {};
    const item = approvalQueue[itemId];

    if (!item || item.companyId !== companyId) {
      return null;
    }

    // Cache in memory
    memoryApprovalQueue.set(item.id, item);
    return item;
  } catch (err) {
    console.error(`[AI Approval Service] Error retrieving approval item ${itemId}:`, err);
    return null;
  }
}

/**
 * Lists all approval items for a company with optional status filtering.
 * Strictly scoped to companyId for multi-tenant isolation.
 */
export async function listApprovalItems(
  companyId: string,
  filterStatus?: ApprovalStatus | 'ALL'
): Promise<AiApprovalItem[]> {
  const items: AiApprovalItem[] = [];

  // 1. Gather from memory queue
  for (const item of memoryApprovalQueue.values()) {
    if (item.companyId === companyId) {
      if (!filterStatus || filterStatus === 'ALL' || item.status === filterStatus) {
        items.push(item);
      }
    }
  }

  // 2. Supplement from database if needed
  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: 'email',
        },
      },
    });

    if (connection) {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const approvalQueue = (currentMeta.approvalQueue as Record<string, AiApprovalItem>) || {};
      for (const [id, dbItem] of Object.entries(approvalQueue)) {
        if (dbItem.companyId === companyId && !memoryApprovalQueue.has(id)) {
          if (!filterStatus || filterStatus === 'ALL' || dbItem.status === filterStatus) {
            items.push(dbItem);
            memoryApprovalQueue.set(id, dbItem);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[AI Approval Service] Error listing approval items for ${companyId}:`, err);
  }

  // Sort descending by creation date
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Updates an approval item to select one of the 3 pre-generated variations.
 */
export async function selectDraftVariation(
  companyId: string,
  itemId: string,
  variation: DraftVariationStyle
): Promise<AiApprovalItem> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    throw new Error(`Approval item ${itemId} not found or unauthorized for company ${companyId}`);
  }

  if (item.status !== 'PENDING') {
    throw new Error(`Cannot change variation on an item with status ${item.status}`);
  }

  const normalizedVariation = variation === 'warm' ? 'relationship' : variation;
  const selectedText = item.variations[normalizedVariation];
  if (!selectedText) {
    throw new Error(`Variation "${variation}" does not exist on item ${itemId}`);
  }

  const now = new Date().toISOString();
  item.selectedVariation = variation;
  item.currentDraft = selectedText;
  item.isEdited = false;
  item.editedDraft = undefined;
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_select`,
    timestamp: now,
    step: 'Draft Variation Selected',
    details: `Selected ${variation} draft variation`,
    status: 'success',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return item;
}

/**
 * Updates the approval item draft with company-edited text.
 */
export async function updateApprovalDraft(
  companyId: string,
  itemId: string,
  editedText: string
): Promise<AiApprovalItem> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    throw new Error(`Approval item ${itemId} not found or unauthorized for company ${companyId}`);
  }

  if (item.status !== 'PENDING') {
    throw new Error(`Cannot edit an item with status ${item.status}`);
  }

  if (!editedText || editedText.trim().length === 0) {
    throw new Error('Edited draft text cannot be empty');
  }

  const now = new Date().toISOString();
  item.editedDraft = editedText.trim();
  item.currentDraft = editedText.trim();
  item.isEdited = true;
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_edit`,
    timestamp: now,
    step: 'Draft Edited by Company',
    details: 'Company modified the response draft before final dispatch',
    status: 'pending',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return item;
}

export interface ValidateEditedDraftOptions {
  currentTurnRequirements?: Array<
    | string
    | {
        type: string;
        topic?: string;
        description?: string;
        currentValue?: string;
        previousValue?: string;
        isOverride?: boolean;
      }
  >;
  restrictedTopics?: string[];
  staleTopics?: string[];
  commercialTermsDetected?: string[];
  updatedOverrides?: Array<
    | string
    | {
        field: string;
        currentValue: string;
        previousValue?: string;
      }
  >;
  companyPermissionConfig?: Record<string, unknown>;
  companyInstruction?: string;
}

/**
 * Validates edited draft text for technical correctness, placeholder absence,
 * stale-topic absence, outdated budget absence, and immutable safety rules.
 * Human editing does NOT bypass safety protections.
 */
export function validateEditedDraftText(
  editedText: string,
  customerMessage: string,
  options?: ValidateEditedDraftOptions
): ResponseValidationResult {
  const result = validateCustomerResponse({
    reply: editedText,
    clientMessage: customerMessage,
    companyInstruction: options?.companyInstruction,
  });

  const lower = editedText.toLowerCase();

  // 1. Placeholder check
  const placeholderRegex = /\[(?:INSERT|TODO|PLACEHOLDER|FILL|NAME|DATE|PERCENTAGE|AMOUNT|DISCOUNT|PRICE)[^\]]*\]/i;
  if (placeholderRegex.test(editedText)) {
    result.isValid = false;
    result.issues = result.issues.filter((i) => !i.toLowerCase().includes('placeholder'));
    result.issues.push('Send blocked: Unresolved placeholder detected: Response contains bracketed placeholder tokens.');
  }

  // 1B. Internal Meta-Instruction Language Check
  const metaRegex = /\b(?:generate\s+(?:a\s+)?(?:msg|message|email|reply)|write\s+(?:a\s+)?(?:msg|message|email|reply)|tell\s+(?:them|we)|ask\s+them\s+to|according\s+to\s+(?:the\s+|your\s+)?instruction|the\s+instruction\s+states|you\s+asked\s+us\s+to\s+say|the\s+company\s+wants\s+to\s+say)\b/i;
  if (metaRegex.test(editedText) && !metaRegex.test(customerMessage)) {
    result.isValid = false;
    result.hasPromptLeak = true;
    result.issues.push('Send blocked: This response contains internal meta-instruction language that should not appear in customer email.');
  }

  // 2. Unverified Commission & Revenue-Share Commitment
  // A. Explicit commitment verbs with percentage: always blocked unless explicitly overridden
  const explicitCommitRegex =
    /\b(?:(?:we|i)\s+(?:can\s+)?(?:confirm|agree\s+to|commit\s+to|accept|offer|grant|promise|give)\s+(?:the\s+|a\s+)?(?:\d{1,2}%|\d{1,2}\s*(?:percent|%))\s*(?:commission|revenue[- ]share|rev[- ]share)|(?:confirm(?:ing)?|accept(?:ing)?|agree(?:ing)?\s+to|commit(?:ting)?\s+to|offer(?:ing)?)\s+(?:the\s+|a\s+)?(?:\d{1,2}%|\d{1,2}\s*(?:percent|%))\s*(?:commission|revenue[- ]share|rev[- ]share)|(?:\d{1,2}%|\d{1,2}\s*(?:percent|%))\s*(?:commission|revenue[- ]share|rev[- ]share)\s+(?:is|are)\s+(?:all\s+)?(?:acceptable|confirmed|agreed|offered|committed)|confirm\s+the\s+15%\s+commission)\b/i;

  // B. Discussion or proposal of specific percentage (e.g. "open to discussing a 30% revenue-share arrangement"):
  // Blocked when company permissions require approval for commercial/revenue-share topics
  const discussionCommitRegex =
    /\b(?:open\s+to\s+(?:discussing\s+)?|propos(?:e|ing)\s+(?:a\s+)?|discussing\s+(?:a\s+)?)\s*(?:a\s+)?(?:\d{1,2}%|\d{1,2}\s*(?:percent|%))\s*(?:commission|revenue[- ]share|rev[- ]share)\b/i;

  const hasRestrictedCommercial = Boolean(
    options?.restrictedTopics?.some((t) =>
      /commission|revenue[-_ ]?share|rev[-_ ]?share|commercial/i.test(t)
    )
  );

  const commMatch =
    editedText.match(explicitCommitRegex) ||
    (hasRestrictedCommercial ? editedText.match(discussionCommitRegex) : null);

  if (commMatch) {
    const instConstraint = options?.companyInstruction
      ? parseCompanyInstruction(options.companyInstruction)
      : null;
    const isExplicitlyRefused =
      instConstraint &&
      (instConstraint.mustPreserveRefusal ||
        instConstraint.position === 'REJECT' ||
        instConstraint.position === 'PROHIBIT_MENTION');

    const hasExplicitOverride =
      !isExplicitlyRefused &&
      options?.updatedOverrides?.some((ov) => {
        const val = typeof ov === 'string' ? ov.toLowerCase() : ov.field.toLowerCase();
        if (val.startsWith('instruction:')) {
          const instText = val.replace(/^instruction:\s*/, '');
          const p = parseCompanyInstruction(instText);
          if (p.mustPreserveRefusal || p.position === 'REJECT' || p.position === 'PROHIBIT_MENTION') {
            return false;
          }
        }
        return (
          val.includes('commission') ||
          val.includes('revenue_share') ||
          val.includes('revenue-share') ||
          val.includes('revenue share') ||
          val.includes('rev_share') ||
          val.includes('rev share')
        );
      });

    if (!hasExplicitOverride) {
      const matchedSnippet = commMatch[0];
      const pctMatch = matchedSnippet.match(/\d{1,2}%|\d{1,2}\s*percent/i);
      const pct = pctMatch ? pctMatch[0] : '30%';
      const isRevShare = /rev(?:enue)?[- ]share/i.test(matchedSnippet);
      const termLabel = isRevShare ? 'revenue share' : 'commission';
      result.isValid = false;
      result.hasUnverifiedCommercialClaim = true;
      result.issues.push(`Send blocked: This response appears to commit to a ${pct} ${termLabel} that has not been approved.`);
    }
  }

  // 2B. Unverified Equity Commitment (e.g. "we confirm 40% equity", "we agree to 40% equity", "we grant 40% equity")
  const equityCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|grant|give|transfer)\s+(?:a\s+|the\s+)?(?:\d{1,2}%|\d{1,2}\s+percent)\s*equity|confirm(?:ing)?\s+(?:the\s+)?(?:\d{1,2}%|\d{1,2}\s+percent)\s*equity)\b/i;
  const eqMatch = editedText.match(equityCommitRegex);
  if (eqMatch) {
    const pct = eqMatch[1] || eqMatch[2] || '40%';
    result.isValid = false;
    result.hasUnverifiedCommercialClaim = true;
    result.issues.push(`Send blocked: This response appears to commit to an unapproved ${pct} equity transfer.`);
  }

  // 3. Unverified Pricing / Fixed Quote Commitment
  const pricingCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|guarantee)\s+(?:the\s+)?(?:fixed\s+)?(?:price|cost|quote|budget)\s+of\s+([₹$€£]?\s*[\d,]+(?:\s*(?:k|thousand|lakh|crore))?)|confirm(?:ing)?\s+(?:the\s+)?(?:fixed\s+)?(?:price|cost|quote)\s+of\s+([₹$€£]?\s*[\d,]+)|(?:we|i)\s+will\s+do\s+(?:it|this|the\s+project)\s+for\s+(?:exactly\s+)?([₹$€£]\s*[\d,]+|\b\d+\s*(?:dollars|usd|inr|rupees)\b)|fixed\s+price\s+guarantee|confirm(?:ing)?\s+(?:the\s+)?fixed\s+price)\b/i;
  if (pricingCommitRegex.test(editedText)) {
    result.isValid = false;
    result.hasFabricatedPrice = true;
    result.hasUnverifiedCommercialClaim = true;
    result.issues.push('Send blocked: This response commits to unverified fixed pricing that has not been approved.');
  }

  // 4. Unverified Discount Commitment
  const discountCommitRegex = /\b(?:(?:we|i)\s+(?:confirm|agree\s+to|commit\s+to|accept|offer)\s+(?:a\s+|the\s+)?(\d{1,2}%)\s*discount|(?:giving|give)\s+you\s+(?:a\s+)?(\d{1,2}%)\s*discount|offer\s+(?:you\s+)?(?:a\s+)?(\d{1,2}%)\s*discount|confirm(?:ing)?\s+(?:the\s+)?(\d{1,2}%)\s*discount)\b/i;
  if (discountCommitRegex.test(editedText)) {
    result.isValid = false;
    result.hasUnverifiedCommercialClaim = true;
    result.issues.push('Send blocked: This response appears to offer an unverified discount that has not been approved.');
  }

  // 5. Outdated Budget & Superseded Requirement Detection
  if (options?.updatedOverrides && options.updatedOverrides.length > 0) {
    for (const override of options.updatedOverrides) {
      if (typeof override !== 'string' && override.previousValue) {
        const prevClean = override.previousValue.toLowerCase().trim();
        // Check if draft references the outdated budget or term
        if (prevClean.length > 2 && lower.includes(prevClean)) {
          result.isValid = false;
          result.hasStaleTopic = true;
          result.issues.push(`Send blocked: This response references an outdated budget ("${override.previousValue}"). The current budget is ${override.currentValue}.`);
        }
      }
    }
  }

  // 6. Stale Topics Detection
  if (options?.staleTopics && options.staleTopics.length > 0) {
    for (const stale of options.staleTopics) {
      if (lower.includes(stale.toLowerCase())) {
        result.isValid = false;
        result.hasStaleTopic = true;
        result.issues.push(`Send blocked: Stale topic detected: Response mentions superseded or obsolete topic "${stale}".`);
      }
    }
  }

  // 7. Unverified Refund Commitment
  const refundCommitRegex = /\b(?:(?:we|i)\s+(?:will\s+)?(?:issue|give|grant|promise|guarantee)\s+(?:a\s+)?(?:full\s+|partial\s+)?refund|money[- ]back\s+guarantee|reimburse\s+(?:your|the)\s+(?:payment|funds|money)|(?:we|i)\s+will\s+refund\s+(?:your|the)\s+money)\b/i;
  if (refundCommitRegex.test(editedText)) {
    result.isValid = false;
    result.hasUnverifiedCommercialClaim = true;
    result.issues.push('Send blocked: This response commits to an unverified refund that has not been approved.');
  }

  // 8. Unverified Payment Terms
  const paymentTermsCommitRegex = /\b(?:(?:we|i)\s+(?:accept|agree\s+to)\s+(?:net\s*(?:30|45|60|90)|deferred\s+payment|zero\s+advance|paying\s+after\s+delivery)|net\s*(?:30|45|60|90)\s+(?:terms\s+are\s+accepted|is\s+accepted|agreed)|(?:we|i)\s+agree\s+to\s+pay\s+after\s+delivery)\b/i;
  if (paymentTermsCommitRegex.test(editedText)) {
    result.isValid = false;
    result.hasUnverifiedCommercialClaim = true;
    result.issues.push('Send blocked: This response commits to non-standard payment terms that have not been approved.');
  }

  // 9. Unauthorized SLA Commitment
  const slaCommitRegex = /\b(?:(?:we|i)\s+(?:guarantee|promise|commit\s+to)\s+(?:a\s+)?(?:99\.9+%?\s+uptime|\d+\s*minutes?\s+response(?:\s+time)?|sla\b)|guaranteed\s+(?:99\.9+%?\s+uptime|response\s+time\s+of\s+\d+)|(?:we|i)\s+commit\s+to\s+a\s+99\.9%\s+uptime\s+sla)\b/i;
  if (slaCommitRegex.test(editedText)) {
    result.isValid = false;
    result.issues.push('Send blocked: This response commits to an unauthorized SLA that has not been approved.');
  }

  // 10. Unauthorized Deadline Guarantee
  const deadlineCommitRegex = /\b(?:(?:we|i)\s+guarantee\s+(?:delivery|completion|launch)\s+by\b|guaranteed\s+(?:delivery|completion)\s+by\s+[a-z]+|will\s+be\s+completed\s+by\s+[a-z]+(?:\s+\d{1,2})?\s+guaranteed)\b/i;
  if (deadlineCommitRegex.test(editedText)) {
    result.isValid = false;
    result.hasFabricatedTimeline = true;
    result.issues.push('Send blocked: This response commits to an unauthorized delivery deadline guarantee.');
  }

  // 11. Contractual / Legal Commitment
  const contractCommitRegex = /\b(?:(?:we|i)\s+(?:sign|execute|accept|agree\s+to)\s+(?:the|this|your|a)?\s*(?:contract|agreement|terms|legally\s+binding)|sign\s+(?:the|this|your)\s+contract|power\s+of\s+attorney|official\s+legal\s+representative|legally\s+binding\s+commitment)\b/i;
  if (contractCommitRegex.test(editedText)) {
    result.isValid = false;
    result.issues.push('Send blocked: This response contains an unauthorized contractual or legal commitment.');
  }

  // 12. NDA Acceptance
  const ndaCommitRegex = /\b(?:(?:we|i)\s+(?:sign|execute|accept|agree\s+to)\s+(?:the|this|your|a)?\s*nda|nda\s+is\s+accepted|non-disclosure\s+agreement\s+is\s+accepted|(?:we|i)\s+accept\s+your\s+nda|(?:we|i)\s+have\s+signed\s+the\s+nda)\b/i;
  if (ndaCommitRegex.test(editedText)) {
    result.isValid = false;
    result.issues.push('Send blocked: This response contains an unauthorized NDA acceptance.');
  }

  // 13. Exclusivity
  const exclusivityCommitRegex = /\b(?:(?:we|i)\s+(?:agree\s+to|commit\s+to|offer)\s+(?:an?\s+)?exclusive\b|exclusivity\s+clause\s+(?:is\s+accepted|agreed)|sole\s+(?:vendor|provider|partner))\b/i;
  if (exclusivityCommitRegex.test(editedText)) {
    result.isValid = false;
    result.issues.push('Send blocked: This response contains an unauthorized exclusivity commitment.');
  }

  // 14. Guarantees
  const guaranteeCommitRegex = /\b(?:(?:we|i)\s+(?:can\s+)?guarantee\s+(?:100%|results|traffic|revenue|sales|leads|uptime|zero\s+bugs|bug-free)|100%\s+guarantee|unconditional\s+guarantee|bug-free\s+guarantee|(?:we|i)\s+guarantee\s+(?:that\s+)?you\s+will|(?:we|i)\s+guarantee\s+100%)\b/i;
  if (guaranteeCommitRegex.test(editedText)) {
    result.isValid = false;
    result.issues.push('Send blocked: This response contains an unauthorized guarantee.');
  }

  // 15. Immutable Safety Rule Catch-all (backward compatibility for existing tests)
  const isImmutableViolated = IMMUTABLE_OUTBOUND_SAFETY_PATTERNS.some((p) => p.test(lower));
  if (isImmutableViolated) {
    result.isValid = false;
    if (!result.issues.some((i) => i.includes('Response Requires Review'))) {
      result.issues.push('Send blocked: Response Requires Review: This response contains an unauthorized contractual, legal, guarantee, exclusivity, or system instruction commitment.');
    }
  }

  // 16. Semantic Company Instruction Compliance Check
  if (options?.companyInstruction && options.companyInstruction.trim().length > 0) {
    const instCheck = validateDraftAgainstCompanyInstruction(editedText, options.companyInstruction);
    if (!instCheck.isValid) {
      result.isValid = false;
      for (const issue of instCheck.issues) {
        const issueMsg = `Send blocked: ${issue}`;
        if (!result.issues.includes(issueMsg)) {
          result.issues.push(issueMsg);
        }
      }
    }
  }

  // Determine validation status: SAFE, APPROVAL_REQUIRED, or BLOCKED
  const hasCommercialTerms =
    /\b((?:\d{1,2}%|\d{1,2}\s*percent)\s*(?:equity|commission|discount|revenue[- ]share|rev[- ]share)|equity\s+stake|revenue[- ]share|rev[- ]share|guarantee)\b/i.test(editedText) ||
    Boolean(options?.restrictedTopics && options.restrictedTopics.length > 0) ||
    Boolean(options?.commercialTermsDetected && options.commercialTermsDetected.length > 0);

  if (!result.isValid) {
    result.status = 'BLOCKED';
  } else if (hasCommercialTerms) {
    result.requiresApproval = true;
    result.status = 'APPROVAL_REQUIRED';
    result.approvalReason = 'Commercial term or partnership commitment requires company authorization before sending.';
  } else {
    result.requiresApproval = false;
    result.status = 'SAFE';
  }

  return result;
}

/**
 * Regenerates an AI approval draft variation with safe deterministic constraints.
 * Changes phrasing/wording without altering pricing, commission, deadlines, or facts.
 */
export async function regenerateApprovalDraft(
  companyId: string,
  itemId: string,
  variationStyle: DraftVariationStyle,
  instructions?: string
): Promise<{ success: boolean; item?: AiApprovalItem; newVersion?: string; error?: string }> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    return { success: false, error: `Approval item ${itemId} not found or unauthorized for company ${companyId}` };
  }

  if (item.status !== 'PENDING') {
    return { success: false, error: `Cannot regenerate draft for an item with status ${item.status}` };
  }

  const normalizedStyle: 'professional' | 'relationship' | 'concise' =
    variationStyle === 'warm' ? 'relationship' : variationStyle;

  const currentStyleText = item.variations[normalizedStyle] || item.currentDraft;

  const newVersion = regenerateDraftVariation({
    currentVariationText: currentStyleText,
    style: normalizedStyle,
    instructions: instructions || item.companyInstruction,
    intent: item.intent,
    restrictedTopics: item.restrictedTopics,
    customerMessage: item.latestCustomerMessage,
  });

  if (instructions && instructions.trim().length > 0) {
    item.companyInstruction = instructions.trim();
  }

  const now = new Date().toISOString();
  const regeneratedList = item.regeneratedVersions || [];
  regeneratedList.push({
    id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    style: normalizedStyle,
    text: newVersion,
    content: newVersion,
    timestamp: now,
  });
  item.regeneratedVersions = regeneratedList;
  item.variations[normalizedStyle] = newVersion;
  if (normalizedStyle === 'relationship') {
    item.variations.warm = newVersion;
  }

  // If currently viewing or selected this variation, update current draft
  if (item.selectedVariation === normalizedStyle || item.selectedVariation === variationStyle) {
    item.currentDraft = newVersion;
    item.isEdited = false;
    item.editedDraft = undefined;
  }
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_regen`,
    timestamp: now,
    step: 'Draft Regenerated',
    details: `Regenerated ${normalizedStyle} wording while strictly preserving factual constraints`,
    status: 'success',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return { success: true, item, newVersion };
}

/**
 * Rejects an AI approval item with a structured reason and optional notes.
 */
export async function rejectApprovalItem(
  companyId: string,
  itemId: string,
  reason?: string
): Promise<AiApprovalItem> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    throw new Error(`Approval item ${itemId} not found or unauthorized for company ${companyId}`);
  }

  if (item.status === 'APPROVED' || item.status === 'EDITED_AND_SENT') {
    throw new Error(`Cannot reject an already completed approval item (${item.status})`);
  }

  const now = new Date().toISOString();
  item.status = 'REJECTED';
  item.rejectionReason = reason || 'Rejected by company reviewer';
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_reject`,
    timestamp: now,
    step: 'Draft Rejected',
    details: `Reviewer rejected draft: ${item.rejectionReason}`,
    status: 'error',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return item;
}

/**
 * Generates 3 distinct AI draft variations (Professional, Warm, Concise)
 * using the company's natural language instruction combined with customer context.
 */
export async function generateDraftsFromInstruction(
  companyId: string,
  itemId: string,
  instruction: string
): Promise<{
  success: boolean;
  item?: AiApprovalItem;
  variations?: {
    professional: string;
    relationship: string;
    warm: string;
    concise: string;
  };
  error?: string;
}> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    return { success: false, error: `Approval item ${itemId} not found or unauthorized for company ${companyId}` };
  }

  if (item.status !== 'PENDING') {
    return { success: false, error: `Cannot generate drafts for an item with status ${item.status}` };
  }

  if (!instruction || instruction.trim().length === 0) {
    return { success: false, error: 'Company instruction cannot be empty.' };
  }

  const generated = generateDraftsFromCompanyInstruction({
    customerMessage: item.latestCustomerMessage,
    instruction: instruction.trim(),
    customerName: item.customerName,
    companyName: item.customerCompanyName ? undefined : undefined,
    conversationHistory: item.conversationHistory,
    restrictedTopics: item.restrictedTopics,
    currentTurnRequirements: item.currentTurnRequirements,
    intent: item.intent,
  });

  const now = new Date().toISOString();
  item.variations = {
    professional: generated.professional,
    relationship: generated.relationship,
    warm: generated.warm,
    concise: generated.concise,
  };
  item.companyInstruction = instruction.trim();

  // Set current draft to currently selected variation style
  const normalizedStyle = item.selectedVariation === 'warm' ? 'relationship' : (item.selectedVariation || 'professional');
  item.currentDraft = item.variations[normalizedStyle] || item.variations.professional;
  item.originalAiDraft = item.variations.professional;
  item.isEdited = false;
  item.editedDraft = undefined;
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_instruction`,
    timestamp: now,
    step: 'Reply Generated from Company Instruction',
    details: `Generated drafts based on company instruction: "${instruction.trim().slice(0, 80)}${instruction.trim().length > 80 ? '...' : ''}"`,
    status: 'success',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return {
    success: true,
    item,
    variations: item.variations as { professional: string; relationship: string; warm: string; concise: string },
  };
}

/**
 * Reopens a rejected AI approval item and moves it back to PENDING.
 * Guarantees:
 * - Only items in REJECTED status can be reopened.
 * - Does NOT send Gmail.
 * - Does NOT send another customer holding response.
 * - Does NOT consume quota.
 * - Does NOT create a new approval item (no duplicate).
 * - Preserves customer message, conversation history, Gmail thread ID, approval metadata, previous drafts, company edits.
 * - Preserves rejection history in the timeline and appends the reopen audit event.
 */
export async function reopenApprovalItem(
  companyId: string,
  itemId: string,
  userEmail?: string
): Promise<AiApprovalItem> {
  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    throw new Error(`Approval item ${itemId} not found or unauthorized for company ${companyId}`);
  }

  if (item.status !== 'REJECTED') {
    throw new Error(`Cannot reopen an approval item with status "${item.status}". Only rejected items can be reopened.`);
  }

  const now = new Date().toISOString();
  item.status = 'PENDING';
  item.updatedAt = now;

  const timeline = item.activityTimeline || [];
  timeline.push({
    id: `act_${Date.now()}_reopen`,
    timestamp: now,
    step: 'Approval Reopened',
    details: `Approval reopened by company${userEmail ? ` (${userEmail})` : ''} and returned to Pending queue`,
    status: 'pending',
  });
  item.activityTimeline = timeline;

  await saveApprovalItem(item);
  return item;
}

/**
 * Approves and sends the final response directly from FillFlow using the existing Gmail provider.
 * Guarantees:
 * - Preserves Gmail thread ID, In-Reply-To, References.
 * - Preserves quota accounting (reserve -> send -> commit/release).
 * - Enforces idempotency and concurrent send locks (cannot send twice).
 * - Enforces safety validation on human edited responses.
 * - Preserves complete internal audit trail.
 */
export async function approveAndSendItem(
  companyId: string,
  itemId: string,
  options?: {
    finalDraft?: string;
    userEmail?: string;
    provider?: EmailProvider;
  }
): Promise<SendApprovalItemResult> {
  // Concurrency lock check
  if (inFlightSendingItems.has(itemId)) {
    return {
      success: false,
      error: `Approval item ${itemId} is already in the process of being sent. Please wait.`,
    };
  }

  const item = await getApprovalItem(companyId, itemId);
  if (!item) {
    return {
      success: false,
      error: `Approval item ${itemId} not found or unauthorized for company ${companyId}`,
    };
  }

  // 1. DUPLICATE SEND PREVENTION
  if (item.status === 'APPROVED' || item.status === 'EDITED_AND_SENT') {
    return {
      success: false,
      error: `Approval item ${itemId} has already been sent (status: ${item.status})`,
    };
  }

  if (item.status === 'REJECTED') {
    return {
      success: false,
      error: `Cannot send a rejected approval item (${itemId})`,
    };
  }

  inFlightSendingItems.add(itemId);

  try {
    // Determine text to send
    const textToSend = options?.finalDraft && options.finalDraft.trim().length > 0
      ? options.finalDraft.trim()
      : item.currentDraft;

    // 2. VALIDATION CHECK: Prevent sending invalid, malformed, or unsafe emails
    const effectiveOverrides = [
      ...(item.updatedOverrides || []),
      ...(item.companyInstruction ? [`instruction: ${item.companyInstruction}`] : []),
    ];
    const validation = validateEditedDraftText(textToSend, item.latestCustomerMessage, {
      currentTurnRequirements: item.currentTurnRequirements,
      restrictedTopics: item.restrictedTopics,
      commercialTermsDetected: item.commercialTermsDetected,
      updatedOverrides: effectiveOverrides,
      companyInstruction: item.companyInstruction,
    });
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.issues.join('; ')}`,
      };
    }

    // 3. RETRIEVE OR INITIALIZE ACTIVE PROVIDER & MANAGE QUOTA RESERVATION
    let activeProvider = options?.provider;
    let quotaReserved = false;
    let companySenderAddress: string | undefined;

    if (!activeProvider) {
      // Production approve-and-send flow: Strictly require active real Gmail connection.
      // NEVER silently fall back to simulated provider.
      let connection;
      try {
        connection = await prisma.automationConnection.findUnique({
          where: {
            companyId_automationType: {
              companyId,
              automationType: AutomationType.email,
            },
          },
        });
      } catch (dbErr) {
        console.error(`[AI Approval Service] Failed to lookup connection for ${companyId}:`, dbErr);
      }

      if (!connection || connection.status !== ConnectionStatus.connected || connection.provider !== 'google') {
        return {
          success: false,
          error: 'Gmail connection is not active. Reconnect Gmail before sending.',
        };
      }

      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      companySenderAddress =
        connection.displayName ||
        (currentMeta.googleEmail as string) ||
        (currentMeta.inboundEmail as string) ||
        undefined;

      // Reserve quota before dispatch
      try {
        const quotaReservation = await reserveEmailQuota(companyId, item.inboundMessageId);
        if (!quotaReservation.success) {
          return {
            success: false,
            error: `Insufficient quota: ${quotaReservation.reason || 'Email quota limit reached'}`,
          };
        }
        quotaReserved = true;
      } catch (quotaErr) {
        console.warn(`[AI Approval Service] Non-critical quota check warning for ${companyId}:`, quotaErr);
      }

      // Resolve company's real GoogleProvider with decrypted OAuth tokens
      try {
        activeProvider = await getGoogleProviderForCompany(companyId);
      } catch (authErr) {
        if (quotaReserved) {
          try {
            await releaseEmailQuota(companyId, item.inboundMessageId, 'OAUTH_CREDENTIALS_INVALID');
          } catch {
            // Non-critical quota release error
          }
        }
        return {
          success: false,
          error: `Gmail authentication error: ${(authErr as Error).message || 'Invalid or missing OAuth credentials'}. Reconnect Gmail before sending.`,
        };
      }

      // Production safeguard: refuse simulation mode in real approve & send
      if (activeProvider instanceof GoogleProvider && activeProvider.isSimulated()) {
        if (quotaReserved) {
          try {
            await releaseEmailQuota(companyId, item.inboundMessageId, 'SIMULATION_NOT_ALLOWED_IN_PRODUCTION');
          } catch {}
        }
        return {
          success: false,
          error: 'Gmail connection is not active or operating in simulation mode. Reconnect Gmail before sending.',
        };
      }
    } else {
      // Test / explicit mock provider flow: preserve existing mock support
      try {
        const quotaReservation = await reserveEmailQuota(companyId, item.inboundMessageId);
        if (quotaReservation.success) {
          quotaReserved = true;
        }
      } catch (quotaErr) {
        console.warn(`[AI Approval Service] Non-critical quota check warning for ${companyId}:`, quotaErr);
      }

      try {
        const connection = await prisma.automationConnection.findUnique({
          where: {
            companyId_automationType: {
              companyId,
              automationType: AutomationType.email,
            },
          },
        });
        const currentMeta = (connection?.metadata as Record<string, unknown>) || {};
        companySenderAddress =
          connection?.displayName ||
          (currentMeta.googleEmail as string) ||
          (currentMeta.inboundEmail as string) ||
          undefined;
      } catch {
        // Non-critical metadata read failure
      }
    }

    const replySubject = item.subject.toLowerCase().startsWith('re:')
      ? item.subject
      : `Re: ${item.subject}`;

    const formattedHtml = formatApprovalEmailHtml({
      leadName: item.customerName || 'Valued Client',
      replyText: textToSend,
    });

    // 4. SEND MESSAGE VIA GMAIL PROVIDER PRESERVING THREAD HEADERS
    let sendResult: SendEmailResult;
    try {
      sendResult = await activeProvider.sendMessage({
        to: item.customerEmail,
        from: companySenderAddress,
        subject: replySubject,
        text: textToSend,
        html: formattedHtml,
        inReplyTo: item.inReplyTo,
        references: item.references,
        metadata: {
          leadId: item.leadId,
          companyId,
          incomingGmailMessageId: item.inboundMessageId,
          ...(item.gmailThreadId ? { gmailThreadId: item.gmailThreadId } : {}),
        },
      });
    } catch (sendErr) {
      if (quotaReserved) {
        try {
          await releaseEmailQuota(companyId, item.inboundMessageId, (sendErr as Error).message || 'SEND_EXCEPTION');
        } catch {}
      }
      return {
        success: false,
        error: (sendErr as Error).message || 'Failed to dispatch email via Gmail provider',
      };
    }

    // 5. SAFEGUARD: Refuse simulated result if no explicit mock provider was passed
    if (!options?.provider && sendResult.simulated) {
      if (quotaReserved) {
        try {
          await releaseEmailQuota(companyId, item.inboundMessageId, 'SIMULATED_SEND_REJECTED');
        } catch {}
      }
      return {
        success: false,
        error: 'Simulated send is not permitted in production approval flow. Reconnect Gmail before sending.',
      };
    }

    // 6. ERROR HANDLING: Release quota if sending failed & return safe error state
    if (!sendResult.success) {
      if (quotaReserved) {
        try {
          await releaseEmailQuota(companyId, item.inboundMessageId, sendResult.error || 'SEND_FAILED');
        } catch {
          // Non-critical quota release error
        }
      }

      const isAuthError =
        sendResult.statusCode === 401 ||
        /401|unauthorized|invalid_grant|token expired|credentials|invalid token/i.test(sendResult.error || '');

      const userFacingError = isAuthError
        ? `Gmail authentication expired or invalid: ${sendResult.error}. Reconnect Gmail before sending.`
        : (sendResult.error || 'Failed to dispatch email via Gmail provider');

      return {
        success: false,
        error: userFacingError,
      };
    }

    // 7. COMMIT QUOTA ON SUCCESS
    try {
      await commitEmailQuota(companyId, item.inboundMessageId, {
        leadId: item.leadId,
        outboundMessageId: sendResult.providerMessageId,
      });
    } catch (commitErr) {
      console.warn(`[AI Approval Service] Non-critical quota commit error for ${companyId}:`, commitErr);
    }

    // 8. UPDATE APPROVAL ITEM STATE & AUDIT TRAIL
    const now = new Date().toISOString();
    const wasEdited = item.isEdited || (options?.finalDraft && options.finalDraft.trim() !== item.originalAiDraft);

    item.status = wasEdited ? 'EDITED_AND_SENT' : 'APPROVED';
    item.currentDraft = textToSend;
    if (wasEdited) {
      item.editedDraft = textToSend;
      item.isEdited = true;
    }
    item.approvedBy = options?.userEmail || 'company_user';
    item.approvedAt = now;
    item.sentAt = now;
    item.outboundMessageId = sendResult.providerMessageId;
    item.updatedAt = now;

    const timeline = item.activityTimeline || [];
    timeline.push({
      id: `act_${Date.now()}_send`,
      timestamp: now,
      step: wasEdited ? 'Edited & Dispatched' : 'Approved & Dispatched',
      details: `Response dispatched to ${item.customerEmail} via Gmail. Provider ID: ${sendResult.providerMessageId}`,
      status: 'success',
    });
    item.activityTimeline = timeline;

    await saveApprovalItem(item);

    // 9. LOG AGENT CHAT MESSAGE ON LEAD RECORD (safe check if lead exists)
    try {
      if (item.leadId) {
        const leadExists = await prisma.lead.findUnique({ where: { id: item.leadId } });
        if (leadExists) {
        await prisma.chatMessage.create({
          data: {
            leadId: item.leadId,
            sender: 'agent',
            text: textToSend,
            options: [],
            extractedDataSnapshot: {
              approvedBy: options?.userEmail || 'company_user',
              approvedAt: now,
              approvalItemId: item.id,
              status: item.status,
              outboundMessageId: sendResult.providerMessageId,
              gmailThreadId: item.gmailThreadId,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        }
      }
    } catch (chatErr) {
      console.warn('[AI Approval Service] Non-critical ChatMessage record creation error:', chatErr);
    }

  const auditRecord = {
    companyId,
    leadId: item.leadId,
    gmailThreadId: item.gmailThreadId,
    inboundMessageId: item.inboundMessageId,
    latestCustomerMessage: item.latestCustomerMessage,
    intent: item.intent,
    riskLevel: item.riskLevel,
    permissionDecision: item.permissionDecision,
    restrictedTopics: item.restrictedTopics,
    originalAiDraft: item.originalAiDraft,
    selectedVariation: item.selectedVariation,
    finalEditedResponse: textToSend,
    approvingUser: options?.userEmail || 'company_user',
    timestamp: now,
    outboundMessageId: sendResult.providerMessageId,
    validationResult: validation,
  };

    return {
      success: true,
      item,
      outboundMessageId: sendResult.providerMessageId,
      auditRecord,
    };
  } finally {
    inFlightSendingItems.delete(itemId);
  }
}

/**
 * Internal helper to persist an approval item both to memory and to Neon DB connection metadata.
 */
async function saveApprovalItem(item: AiApprovalItem): Promise<void> {
  memoryApprovalQueue.set(item.id, item);

  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId: item.companyId,
          automationType: 'email',
        },
      },
    });

    if (connection) {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const approvalQueue = (currentMeta.approvalQueue as Record<string, AiApprovalItem>) || {};
      approvalQueue[item.id] = item;

      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...currentMeta,
            approvalQueue,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  } catch (err) {
    console.warn(`[AI Approval Service] Non-critical DB save notice for ${item.id}:`, err);
  }
}

function formatApprovalEmailHtml(params: {
  leadName: string;
  replyText: string;
}): string {
  const paragraphs = params.replyText
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e293b;">${p.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Response</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #1e293b;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff;">
    <div style="padding-top: 4px; padding-bottom: 8px;">
      ${paragraphs}
    </div>
  </div>
</body>
</html>`;
}


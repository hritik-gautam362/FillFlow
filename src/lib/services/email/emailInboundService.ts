import { prisma } from '@/lib/prisma';
import { ChannelSource, LeadStatus, ConnectionStatus, MessageSender, Prisma } from '@prisma/client';
import {
  getOrCreateDefaultCompany,
  formatBusinessHoursSummary,
  WeeklyBusinessHours,
} from '@/lib/services/companyService';
import { processDiscoveryMessage, ProcessDiscoveryMessageResult } from '@/lib/services/aiDiscoveryService';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { getAutomationConnection } from '@/lib/services/automationConnectionService';
import { createLead } from '@/lib/services/leadService';
import { EmailProvider, ParsedInboundEmail, SendEmailResult } from './EmailProvider';
import { getEmailProvider, getEmailProviderForCompany } from './emailProviderFactory';
import {
  classifyInboundEmail,
  EmailClassificationType,
  EmailClassificationCategory,
  EmailIntent,
  ThreadContext,
} from './emailClassifier';
import { CompanyContext } from '@/lib/ai/types';
import {
  reserveEmailQuota,
  releaseEmailQuota,
  commitEmailQuota,
} from '@/lib/services/emailQuotaService';
import { createApprovalItem } from '@/lib/services/aiApprovalService';
import { AiApprovalItem } from '@/lib/ai/approvalTypes';

// Fast in-memory deduplication caches
const completedEmailMessageIds = new Set<string>();
const inFlightEmailMessageIds = new Set<string>();
const MAX_CACHE_SIZE = 2000;

export function isEmailIdInMemory(msgId: string): boolean {
  return completedEmailMessageIds.has(msgId) || inFlightEmailMessageIds.has(msgId);
}

export function recordEmailIdInMemory(msgId: string): void {
  if (!msgId) return;
  if (completedEmailMessageIds.size >= MAX_CACHE_SIZE) {
    const oldest = completedEmailMessageIds.values().next().value;
    if (oldest) completedEmailMessageIds.delete(oldest);
  }
  completedEmailMessageIds.add(msgId);
}

export function removeEmailIdFromMemory(msgId: string): void {
  if (!msgId) return;
  completedEmailMessageIds.delete(msgId);
  inFlightEmailMessageIds.delete(msgId);
}

export function clearEmailIdCacheForTesting(): void {
  completedEmailMessageIds.clear();
  inFlightEmailMessageIds.clear();
}

// Fast in-memory deduplication for recent Mailgun delivery event IDs
const processedEventIds = new Set<string>();
const MAX_EVENT_CACHE = 2000;

export function isEventProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

export function recordEventProcessed(eventId: string): void {
  if (!eventId) return;
  if (processedEventIds.size >= MAX_EVENT_CACHE) {
    const oldest = processedEventIds.values().next().value;
    if (oldest) processedEventIds.delete(oldest);
  }
  processedEventIds.add(eventId);
}

export function clearEventCacheForTesting(): void {
  processedEventIds.clear();
}

export function extractEmailAddress(raw?: string | null): string {
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const email = match ? match[1] : raw;
  return email.toLowerCase().trim();
}

export interface ProcessInboundEmailResult {
  success: boolean;
  status:
    | 'processed'
    | 'duplicate_ignored'
    | 'skipped_irrelevant'
    | 'automation_disabled'
    | 'quota_locked'
    | 'connection_not_configured'
    | 'error';
  classification?: EmailClassificationType | EmailClassificationCategory;
  category?: EmailClassificationCategory;
  intent?: EmailIntent;
  classificationDetails?: {
    classification: EmailClassificationType;
    confidence: number;
    reason: string;
    deterministic: boolean;
    requiresReply: boolean;
    intent?: EmailIntent;
  };
  errorCategory?:
    | 'EMAIL_PROVIDER_ERROR'
    | 'EMAIL_WEBHOOK_INVALID'
    | 'EMAIL_WEBHOOK_DUPLICATE'
    | 'EMAIL_LEAD_NOT_FOUND'
    | 'EMAIL_AUTOMATION_DISABLED'
    | 'QUOTA_EXCEEDED'
    | 'EMAIL_CONNECTION_NOT_CONFIGURED'
    | 'EMAIL_SEND_FAILED';
  errorMessage?: string;
  leadId?: string;
  companyId?: string;
  briefCreated?: boolean;
  readyForBrief?: boolean;
  sendResult?: SendEmailResult;
  aiResult?: ProcessDiscoveryMessageResult;
  replySent?: boolean;
  approvalRequired?: boolean;
  approvalItem?: AiApprovalItem;
  holdingResponseSent?: boolean;
  holdingOutboundMessageId?: string;
}

/**
 * Safe structured logging for email automation events.
 * Strictly avoids logging secrets, credentials, tokens, or raw email bodies.
 */
export function logEmailAutomationEvent(event: {
  gmailMessageId?: string;
  threadId?: string;
  sender: string;
  subject: string;
  classification?: string;
  intent?: string;
  confidence?: number;
  reason?: string;
  skippedReason?: string;
  processingStatus: string;
  aiCalled?: boolean;
  quotaReserved?: boolean;
  replySent?: boolean;
  outboundMessageId?: string;
  error?: string;
}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    gmailMessageId: event.gmailMessageId || 'none',
    threadId: event.threadId || 'none',
    sender: event.sender,
    subject: event.subject,
    classification: event.classification || 'unknown',
    intent: event.intent || null,
    confidence: event.confidence !== undefined ? event.confidence : null,
    reason: event.reason || null,
    skippedReason: event.skippedReason || null,
    processingStatus: event.processingStatus,
    aiCalled: Boolean(event.aiCalled),
    quotaReserved: Boolean(event.quotaReserved),
    replySent: Boolean(event.replySent),
    outboundMessageId: event.outboundMessageId || null,
    error: event.error || null,
  };
  console.log(`[Email Automation] [${event.processingStatus}]`, JSON.stringify(payload));
}

/**
 * Standardized batch logging for email automation per message.
 */
export function logEmailBatchStatus(params: {
  message: string;
  thread?: string;
  classification: string;
  quota: 'reserved' | 'skipped' | 'released' | 'committed';
  ai: 'success' | 'failed' | 'skipped';
  send: 'success' | 'failed' | 'skipped';
  final: 'PROCESSED_AND_REPLIED' | 'FAILED_TO_SEND' | 'SKIPPED' | 'QUOTA_LOCKED' | 'ERROR';
}): void {
  console.log(
    `[EmailBatch]\nmessage=${params.message}${params.thread ? `\nthread=${params.thread}` : ''}\nclassification=${params.classification}\nquota=${params.quota}\nai=${params.ai}\nsend=${params.send}\nfinal=${params.final}`
  );
}

/**
 * Checks whether an incoming message has already been processed or replied to.
 * Used before picking up or processing an email.
 */
export async function isMessageAlreadyProcessed(
  gmailMsgId: string,
  emailMsgId: string,
  companyId?: string,
  provider?: EmailProvider,
  threadId?: string
): Promise<boolean> {
  // 1. Fast in-memory deduplication cache
  if (completedEmailMessageIds.has(gmailMsgId) || completedEmailMessageIds.has(emailMsgId)) {
    return true;
  }

  // 2. ChatMessage table lookup in Neon Database:
  // Check if an agent reply was sent for this message, or if it was recorded as processed
  const existingChatMessage = await prisma.chatMessage.findFirst({
    where: {
      OR: [
        {
          sender: MessageSender.agent,
          extractedDataSnapshot: { path: ['inReplyToGmailMessageId'], equals: gmailMsgId },
        },
        {
          sender: MessageSender.agent,
          extractedDataSnapshot: { path: ['inReplyToGmailMessageId'], equals: emailMsgId },
        },
        {
          extractedDataSnapshot: { path: ['status'], equals: 'processed' },
          OR: [
            { extractedDataSnapshot: { path: ['gmailMessageId'], equals: gmailMsgId } },
            { extractedDataSnapshot: { path: ['emailMessageId'], equals: emailMsgId } },
          ],
        },
      ],
    },
  });

  if (existingChatMessage) {
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(emailMsgId);
    return true;
  }

  // 3. AutomationConnection metadata check (if companyId is resolved)
  if (companyId) {
    try {
      const conn = await prisma.automationConnection.findFirst({
        where: { companyId, automationType: AutomationType.email },
        select: { metadata: true },
      });
      const meta = (conn?.metadata as Record<string, unknown>) || {};
      const processedMap = (meta.processedEmailIds as Record<string, unknown>) || {};
      if (processedMap[gmailMsgId] || processedMap[emailMsgId]) {
        completedEmailMessageIds.add(gmailMsgId);
        completedEmailMessageIds.add(emailMsgId);
        return true;
      }
    } catch {
      // Non-critical check failure fallback
    }
  }

  // 4. Provider outbound thread inspection (guards against outbound send succeeded + DB update failed)
  if (provider?.hasOutboundReply && threadId) {
    try {
      const alreadyReplied = await provider.hasOutboundReply(threadId, gmailMsgId);
      if (alreadyReplied) {
        completedEmailMessageIds.add(gmailMsgId);
        completedEmailMessageIds.add(emailMsgId);
        return true;
      }
    } catch {
      // Fallback
    }
  }

  return false;
}

/**
 * Safety check immediately before sending:
 * Checks whether an outbound reply has already been issued for this message.
 */
export async function hasOutboundReplyAlreadyBeenSent(
  gmailMsgId: string,
  emailMsgId: string,
  companyId?: string,
  provider?: EmailProvider,
  threadId?: string
): Promise<boolean> {
  // 1. Completed cache check
  if (completedEmailMessageIds.has(gmailMsgId) || completedEmailMessageIds.has(emailMsgId)) {
    return true;
  }

  // 2. ChatMessage table: check if an AGENT reply exists for this message
  const existingReply = await prisma.chatMessage.findFirst({
    where: {
      sender: MessageSender.agent,
      OR: [
        { extractedDataSnapshot: { path: ['inReplyToGmailMessageId'], equals: gmailMsgId } },
        { extractedDataSnapshot: { path: ['inReplyToGmailMessageId'], equals: emailMsgId } },
      ],
    },
  });
  if (existingReply) {
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(emailMsgId);
    return true;
  }

  // 3. AutomationConnection metadata
  if (companyId) {
    try {
      const conn = await prisma.automationConnection.findFirst({
        where: { companyId, automationType: AutomationType.email },
        select: { metadata: true },
      });
      const meta = (conn?.metadata as Record<string, unknown>) || {};
      const processedMap = (meta.processedEmailIds as Record<string, { status?: string }>) || {};
      if (processedMap[gmailMsgId]?.status === 'processed' || processedMap[emailMsgId]?.status === 'processed') {
        completedEmailMessageIds.add(gmailMsgId);
        completedEmailMessageIds.add(emailMsgId);
        return true;
      }
    } catch {
      // ignore
    }
  }

  // 4. Provider outbound thread check
  if (provider?.hasOutboundReply && threadId) {
    try {
      const alreadyReplied = await provider.hasOutboundReply(threadId, gmailMsgId);
      if (alreadyReplied) {
        completedEmailMessageIds.add(gmailMsgId);
        completedEmailMessageIds.add(emailMsgId);
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * Resolves the target company from the parsed inbound email in a multi-tenant safe manner.
 * Matching strategy:
 * 1. Gmail Thread Continuity (gmailThreadId matching a previous ChatMessage in database)
 * 2. Email Thread Continuity (In-Reply-To / References matching a previous chat message)
 * 3. Recipient Address matching Company AutomationConnection (displayName, metadata)
 * 4. Dedicated Inbound Address pattern (scope-{companyIdPrefix}@...)
 * 5. Fallback to default company if available
 */
export async function resolveCompanyForInboundEmail(
  inbound: ParsedInboundEmail
): Promise<{ companyId: string | null; leadByThread?: unknown | null }> {
  const inboundMetadata = (inbound.metadata as Record<string, unknown>) || {};
  const gmailThreadId = inboundMetadata.gmailThreadId as string | undefined;

  let explicitCompanyId: string | null = null;
  if (inboundMetadata.companyId && typeof inboundMetadata.companyId === 'string') {
    explicitCompanyId = inboundMetadata.companyId;
  }

  // 1. Gmail Thread Continuity Lookup
  if (gmailThreadId) {
    const priorByThread = await prisma.chatMessage.findFirst({
      where: {
        extractedDataSnapshot: { path: ['gmailThreadId'], equals: gmailThreadId },
      },
      include: { lead: true },
      orderBy: { createdAt: 'desc' },
    });

    if (priorByThread?.lead?.companyId) {
      return {
        companyId: explicitCompanyId || priorByThread.lead.companyId,
        leadByThread: priorByThread.lead,
      };
    }
  }

  // 2. Email Thread Continuity Lookup (In-Reply-To / References)
  const threadHeader = inbound.inReplyTo || inbound.references;
  if (threadHeader) {
    const candidateIds = [inbound.inReplyTo, inbound.references].filter(Boolean) as string[];

    // Extract individual message IDs if space-separated
    const individualIds: string[] = [];
    for (const c of candidateIds) {
      const parts = c.split(/\s+/).map((p) => p.trim()).filter((p) => p.length > 0);
      individualIds.push(...parts);
    }

    for (const testId of individualIds) {
      const priorMessage = await prisma.chatMessage.findFirst({
        where: {
          OR: [
            { extractedDataSnapshot: { path: ['emailMessageId'], equals: testId } },
            { extractedDataSnapshot: { path: ['providerMessageId'], equals: testId } },
            { extractedDataSnapshot: { path: ['outboundMessageId'], equals: testId } },
            { extractedDataSnapshot: { path: ['gmailMessageId'], equals: testId } },
          ],
        },
        include: { lead: true },
      });

      if (priorMessage?.lead?.companyId) {
        return {
          companyId: explicitCompanyId || priorMessage.lead.companyId,
          leadByThread: priorMessage.lead,
        };
      }
    }
  }

  if (explicitCompanyId) {
    return { companyId: explicitCompanyId };
  }

  // 3. Recipient address matching AutomationConnection
  const recipient = inbound.recipient.toLowerCase().trim();

  const matchedConnection = await prisma.automationConnection.findFirst({
    where: {
      automationType: AutomationType.email,
      OR: [
        { displayName: recipient },
        { metadata: { path: ['inboundEmail'], equals: recipient } },
        { metadata: { path: ['forwardingAddress'], equals: recipient } },
        { metadata: { path: ['googleEmail'], equals: recipient } },
      ],
    },
  });

  if (matchedConnection?.companyId) {
    return { companyId: matchedConnection.companyId };
  }

  // 4. Dedicated prefix pattern: scope-{companyIdPrefix}@... or scope-{companyId}@...
  const matchScope = recipient.match(/^scope-([a-zA-Z0-9_-]+)@/);
  if (matchScope && matchScope[1]) {
    const scopePrefix = matchScope[1];

    const fullCompany = await prisma.company.findUnique({
      where: { id: scopePrefix },
    });
    if (fullCompany) {
      return { companyId: fullCompany.id };
    }

    const prefixCompany = await prisma.company.findFirst({
      where: {
        id: { startsWith: scopePrefix },
      },
    });
    if (prefixCompany) {
      return { companyId: prefixCompany.id };
    }
  }

  // 5. Default company fallback
  const defaultCompany = await getOrCreateDefaultCompany();
  return { companyId: defaultCompany?.id || null };
}

/**
 * Core Pipeline for processing an inbound email (Google Workspace / Mailgun).
 * Enforces:
 * - Strict Gmail message ID idempotency BEFORE any AI or DB creation
 * - Multi-stage email classification (deterministic first, lightweight AI fallback)
 * - Zero replies to non-inquiries (promotions, newsletters, automated, spam, social)
 * - Outbound idempotency check guarding against duplicate sends
 * - Thread continuity preserving Gmail thread ID and existing Leads
 * - Mark as read ONLY upon successful processing
 */
export async function processInboundEmail(
  inbound: ParsedInboundEmail,
  customProvider?: EmailProvider
): Promise<ProcessInboundEmailResult> {
  const defaultProvider = customProvider || getEmailProvider();
  const rawMsgId = inbound.messageId;
  const inboundMetadata = (inbound.metadata as Record<string, unknown>) || {};
  const gmailMsgId = (inboundMetadata.gmailMessageId as string) || rawMsgId;
  const gmailThreadId = inboundMetadata.gmailThreadId as string | undefined;

  // -------------------------------------------------------------------------
  // 1. STRICT IDEMPOTENCY CHECK (BEFORE AI Discovery & BEFORE Outbound Email)
  // -------------------------------------------------------------------------
  if (
    completedEmailMessageIds.has(gmailMsgId) ||
    completedEmailMessageIds.has(rawMsgId) ||
    inFlightEmailMessageIds.has(gmailMsgId) ||
    inFlightEmailMessageIds.has(rawMsgId)
  ) {
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'duplicate_ignored',
      skippedReason: 'In-memory idempotency cache hit',
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: 'DUPLICATE',
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: true,
      status: 'duplicate_ignored',
      errorCategory: 'EMAIL_WEBHOOK_DUPLICATE',
    };
  }

  // Lock in-flight synchronously immediately to prevent concurrent race conditions
  inFlightEmailMessageIds.add(gmailMsgId);
  inFlightEmailMessageIds.add(rawMsgId);

  const alreadyProcessed = await isMessageAlreadyProcessed(
    gmailMsgId,
    rawMsgId,
    undefined,
    defaultProvider,
    gmailThreadId
  );

  if (alreadyProcessed) {
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'duplicate_ignored',
      skippedReason: 'Database or provider idempotency hit',
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: 'DUPLICATE',
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: true,
      status: 'duplicate_ignored',
      errorCategory: 'EMAIL_WEBHOOK_DUPLICATE',
    };
  }

  // -------------------------------------------------------------------------
  // 2. MULTI-TENANT COMPANY RESOLUTION
  // -------------------------------------------------------------------------
  const { companyId, leadByThread } = await resolveCompanyForInboundEmail(inbound);

  if (!companyId) {
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'error',
      error: `Could not resolve target company for recipient ${inbound.recipient}`,
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: 'UNKNOWN',
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'ERROR',
    });
    return {
      success: false,
      status: 'error',
      errorCategory: 'EMAIL_PROVIDER_ERROR',
      errorMessage: 'Could not resolve target company.',
    };
  }

  // -------------------------------------------------------------------------
  // 3. AUTOMATION ACCESS CONTROL CHECK
  // -------------------------------------------------------------------------
  const accessCheck = await requireAutomationAccess(companyId, AutomationType.email);
  if (!accessCheck.allowed) {
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'automation_disabled',
      skippedReason: 'Email automation is locked for this company',
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: 'UNKNOWN',
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: false,
      status: 'automation_disabled',
      errorCategory: 'EMAIL_AUTOMATION_DISABLED',
      errorMessage: accessCheck.message || 'Email automation is not enabled for this company.',
      companyId,
    };
  }

  // -------------------------------------------------------------------------
  // 4. CONNECTION CHECK
  // -------------------------------------------------------------------------
  const connection = await getAutomationConnection(companyId, AutomationType.email);
  if (connection.status === ConnectionStatus.disconnected) {
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'connection_not_configured',
      skippedReason: 'Email channel is disconnected',
    });
    return {
      success: false,
      status: 'connection_not_configured',
      errorCategory: 'EMAIL_CONNECTION_NOT_CONFIGURED',
      errorMessage: 'Email channel is disconnected. Please reconnect your provider.',
      companyId,
    };
  }

  // -------------------------------------------------------------------------
  // 4.1. OWN OUTBOUND / CONNECTED MAILBOX MESSAGE CHECK
  // Distinguish own sent messages delivered via history/sync/webhook from customer inbound
  // -------------------------------------------------------------------------
  const connectionMeta = (connection.metadata as Record<string, unknown>) || {};
  const cleanSender = extractEmailAddress(inbound.sender);
  const knownOwnEmails = [
    extractEmailAddress(connection.displayName),
    extractEmailAddress(connectionMeta.googleEmail as string),
    extractEmailAddress(connectionMeta.userEmail as string),
    extractEmailAddress(connectionMeta.email as string),
    extractEmailAddress(connectionMeta.inboundEmail as string),
    extractEmailAddress(connectionMeta.forwardingAddress as string),
  ].filter(Boolean);

  if (cleanSender && knownOwnEmails.includes(cleanSender)) {
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);

    // If an existing lead/thread exists and the message isn't stored yet, record it as an agent message
    if (leadByThread) {
      try {
        const existingLead = leadByThread as { id: string; companyId: string };
        const alreadyRecorded = await prisma.chatMessage.findFirst({
          where: {
            leadId: existingLead.id,
            OR: [
              { extractedDataSnapshot: { path: ['gmailMessageId'], equals: gmailMsgId } },
              { extractedDataSnapshot: { path: ['emailMessageId'], equals: rawMsgId } },
            ],
          },
        });

        if (!alreadyRecorded && inbound.text.trim()) {
          await prisma.chatMessage.create({
            data: {
              leadId: existingLead.id,
              sender: MessageSender.agent,
              text: inbound.text.trim(),
              extractedDataSnapshot: {
                gmailMessageId: gmailMsgId,
                emailMessageId: rawMsgId,
                gmailThreadId: gmailThreadId || null,
                subject: inbound.subject,
                recordedAt: new Date().toISOString(),
                source: 'connected_account_outbound',
              },
            },
          });
        }
      } catch {
        // Non-critical recording failure fallback
      }
    }

    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      processingStatus: 'skipped_irrelevant',
      skippedReason: 'Message was sent by connected account (own outbound message)',
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: 'OWN_OUTBOUND',
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: true,
      status: 'skipped_irrelevant',
      errorMessage: 'Inbound message from connected account ignored (own message)',
      companyId,
    };
  }

  // -------------------------------------------------------------------------
  // 4.5. THREAD & COMPANY CONTEXT RESOLUTION
  // -------------------------------------------------------------------------
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      businessHours: true,
      communicationSettings: true,
    },
  });

  const addressParts = [company?.address, company?.city, company?.state, company?.country].filter(Boolean);
  const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : undefined;
  const companyContext: CompanyContext = {
    companyId,
    name: company?.name || 'our company',
    industry: company?.industry || 'business and professional services',
    teamSize: company?.teamSize || undefined,
    website: company?.website || undefined,
    phone: company?.phone || undefined,
    address: formattedAddress,
    city: company?.city || undefined,
    state: company?.state || undefined,
    country: company?.country || undefined,
    timezone: company?.timezone || company?.businessHours?.timezone || undefined,
    businessHours:
      formatBusinessHoursSummary(
        (company?.businessHours?.schedule as unknown as WeeklyBusinessHours) || null,
        company?.businessHours?.timezone || company?.timezone
      ) || undefined,
    tone: company?.communicationSettings?.tone || undefined,
    signature: company?.communicationSettings?.signature || undefined,
    signatureEnabled: company?.communicationSettings?.signatureEnabled ?? false,
    services: Array.isArray(connectionMeta.services) ? (connectionMeta.services as string[]) : undefined,
    description: typeof connectionMeta.description === 'string' ? connectionMeta.description : undefined,
    pricingPolicy: typeof connectionMeta.pricingPolicy === 'string' ? connectionMeta.pricingPolicy : undefined,
  };

  let isSameThread = Boolean(leadByThread);
  if (!isSameThread && gmailThreadId) {
    const threadCount = await prisma.chatMessage.count({
      where: {
        extractedDataSnapshot: { path: ['gmailThreadId'], equals: gmailThreadId },
      },
    });
    if (threadCount > 0) isSameThread = true;
  }
  if (!isSameThread && (inbound.inReplyTo || inbound.references)) {
    const candidateIds = [inbound.inReplyTo, inbound.references].filter(Boolean) as string[];
    const count = await prisma.chatMessage.count({
      where: {
        OR: candidateIds.map((id) => ({
          extractedDataSnapshot: { path: ['emailMessageId'], equals: id },
        })),
      },
    });
    if (count > 0) isSameThread = true;
  }

  let threadContext: ThreadContext | undefined;
  try {
    if (isSameThread) {
      const priorChat = await prisma.chatMessage.findMany({
        where: {
          OR: [
            ...(gmailThreadId ? [{ extractedDataSnapshot: { path: ['gmailThreadId'], equals: gmailThreadId } }] : []),
            ...((leadByThread as { id?: string })?.id ? [{ leadId: (leadByThread as { id: string }).id }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (priorChat.length > 0) {
        let previousIntent: EmailIntent | undefined;
        let conversationTopic: string | undefined;
        let knownRequirements: Record<string, unknown> | undefined;

        for (const msg of priorChat) {
          const snapshot = (msg.extractedDataSnapshot as Record<string, unknown>) || {};
          if (!previousIntent && typeof snapshot.intent === 'string') {
            previousIntent = snapshot.intent as EmailIntent;
          }
          if (!conversationTopic) {
            if (typeof snapshot.conversationTopic === 'string' && snapshot.conversationTopic.trim().length > 0) {
              conversationTopic = snapshot.conversationTopic.trim();
            } else if (typeof snapshot.projectType === 'string' && snapshot.projectType.trim().length > 0) {
              conversationTopic = snapshot.projectType.trim();
            }
          }
          if (!knownRequirements) {
            if (snapshot.requirements && typeof snapshot.requirements === 'object') {
              knownRequirements = snapshot.requirements as Record<string, unknown>;
            } else if (snapshot.budget || snapshot.timeline || snapshot.projectType || snapshot.businessType || (Array.isArray(snapshot.features) && snapshot.features.length > 0)) {
              knownRequirements = snapshot;
            }
          }
        }

        threadContext = {
          hasActiveConversation: true,
          isSameThread: true,
          priorMessages: priorChat.map((m) => ({
            sender: m.sender,
            text: m.text,
            createdAt: m.createdAt,
          })),
          isExistingCustomer: true,
          companyContext,
          previousIntent,
          conversationTopic,
          knownRequirements,
        };
      }
    } else {
      // New thread: Check if the sender is an existing lead in the database
      const existingCustomerLead = await prisma.lead.findFirst({
        where: {
          companyId,
          OR: [
            { email: inbound.sender },
            { email: cleanSender },
          ],
        },
      });

      threadContext = {
        hasActiveConversation: false,
        isSameThread: false,
        isExistingCustomer: Boolean(existingCustomerLead),
        companyContext,
      };
    }
  } catch {
    // Non-critical context resolution failure fallback
  }

  // -------------------------------------------------------------------------
  // 5. EMAIL RELEVANCE CLASSIFICATION (Smart Filtering & Thread Awareness)
  // -------------------------------------------------------------------------
  const classificationResult = await classifyInboundEmail(inbound, { threadContext, companyContext });
  const classificationType = classificationResult.classification;
  const classificationCategory = classificationResult.category;

  const isCustomerInquiry =
    classificationType === 'CUSTOMER_INQUIRY' &&
    classificationResult.requiresReply !== false &&
    classificationResult.confidence >= 0.75;

  logEmailAutomationEvent({
    gmailMessageId: gmailMsgId,
    threadId: gmailThreadId,
    sender: inbound.sender,
    subject: inbound.subject,
    classification: classificationType,
    intent: classificationResult.intent,
    confidence: classificationResult.confidence,
    reason: classificationResult.reason,
    skippedReason: !isCustomerInquiry ? classificationResult.reason : undefined,
    processingStatus: isCustomerInquiry ? 'inquiry_detected' : 'classified_non_inquiry',
    aiCalled: !classificationResult.deterministic,
    quotaReserved: false,
    replySent: false,
  });

  // -------------------------------------------------------------------------
  // 6. NON-INQUIRY FILTERING (Promotions, Newsletters, Automated, Spam, Courtesy)
  // -------------------------------------------------------------------------
  if (!isCustomerInquiry) {
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);

    // Scenario: existing conversation in active thread (e.g. Courtesy "Thanks" or status note)
    if (leadByThread) {
      const existingLead = leadByThread as { id: string; companyId: string };
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: { lastActive: new Date() },
      });

      await prisma.chatMessage.create({
        data: {
          leadId: existingLead.id,
          sender: MessageSender.client,
          text: inbound.text.trim(),
          extractedDataSnapshot: {
            gmailMessageId: gmailMsgId,
            emailMessageId: rawMsgId,
            gmailThreadId,
            channel: 'email',
            classification: classificationType,
            intent: classificationResult.intent,
            confidence: classificationResult.confidence,
            classificationReason: classificationResult.reason,
            classifiedAt: new Date().toISOString(),
            status: 'processed',
            replySent: false,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Persist classification in connection metadata for review and debugging
    try {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const processedEmailIds = (currentMeta.processedEmailIds as Record<string, unknown>) || {};
      processedEmailIds[gmailMsgId] = {
        status: 'skipped_irrelevant',
        classification: classificationType,
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        reason: classificationResult.reason,
        classifiedAt: new Date().toISOString(),
        replySent: false,
      };

      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...currentMeta,
            processedEmailIds,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Non-critical metadata update
    }

    // Mark as read in Gmail so Sync does not repeatedly process it, and DO NOT reply
    if (defaultProvider?.markAsRead && gmailMsgId) {
      await defaultProvider.markAsRead(gmailMsgId).catch(() => {});
    }

    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      classification: classificationType,
      intent: classificationResult.intent,
      confidence: classificationResult.confidence,
      reason: classificationResult.reason,
      skippedReason: classificationResult.reason,
      processingStatus: 'skipped_irrelevant',
      aiCalled: !classificationResult.deterministic,
      quotaReserved: false,
      replySent: false,
    });

    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'skipped',
      ai: classificationResult.deterministic ? 'skipped' : 'success',
      send: 'skipped',
      final: 'SKIPPED',
    });

    return {
      success: true,
      status: 'skipped_irrelevant',
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
      errorMessage: classificationResult.reason,
      companyId,
      leadId: (leadByThread as { id?: string })?.id,
    };
  }

  // -------------------------------------------------------------------------
  // 7. TENANT-SAFE LEAD MATCHING & THREAD CONTINUITY
  // -------------------------------------------------------------------------
  let lead = (leadByThread as { id: string; companyId: string; email: string; clientName?: string } | null) || null;

  const cleanSenderEmail = (() => {
    const match = inbound.sender.match(/<([^>]+)>/);
    return (match && match[1] ? match[1] : inbound.sender).trim().toLowerCase();
  })();

  if (!lead) {
    lead = await prisma.lead.findFirst({
      where: {
        companyId,
        OR: [
          { email: inbound.sender },
          { email: cleanSenderEmail },
        ],
      },
      orderBy: { lastActive: 'desc' },
    });
  }

  // Only create a new Lead if none exists for this thread/sender
  if (!lead) {
    const clientName = inbound.senderName || cleanSenderEmail.split('@')[0] || 'Email Client';
    lead = await createLead({
      companyId,
      clientName,
      companyName: 'Client Project Co',
      email: cleanSenderEmail,
      phone: '',
      channel: ChannelSource.email,
      status: LeadStatus.new,
      qualificationScore: 0,
    });
  } else {
    // Update lastActive timestamp on existing Lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastActive: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // 7.5 SERVER-SIDE QUOTA ENFORCEMENT & ATOMIC RESERVATION
  // -------------------------------------------------------------------------
  // Check quota before starting Gemini generation.
  // Never call Gemini when the company has zero available credits or is quota-locked.
  const quotaReservation = await reserveEmailQuota(companyId, gmailMsgId);
  if (!quotaReservation.success) {
    // Quota exhausted or admin disabled: do NOT retry repeatedly.
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);

    // If provider supports markAsRead, mark as read so Sync Inbox does not repeatedly loop
    if (defaultProvider?.markAsRead && gmailMsgId) {
      await defaultProvider.markAsRead(gmailMsgId).catch(() => {});
    }

    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      classification: classificationType,
      confidence: classificationResult.confidence,
      reason: classificationResult.reason,
      processingStatus: quotaReservation.status.toLowerCase(),
      skippedReason: quotaReservation.reason || 'Quota limit reached',
      aiCalled: false,
      quotaReserved: false,
      replySent: false,
    });

    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'skipped',
      ai: 'skipped',
      send: 'skipped',
      final: 'QUOTA_LOCKED',
    });

    return {
      success: false,
      status: quotaReservation.status === 'QUOTA_LOCKED' ? 'quota_locked' : 'automation_disabled',
      errorCategory: quotaReservation.status === 'QUOTA_LOCKED' ? 'QUOTA_EXCEEDED' : 'EMAIL_AUTOMATION_DISABLED',
      errorMessage: quotaReservation.reason || 'Email automation is quota locked.',
      leadId: lead.id,
      companyId,
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
    };
  }

  // -------------------------------------------------------------------------
  // 8. PROCESS MESSAGE VIA AI REQUIREMENT DISCOVERY
  // -------------------------------------------------------------------------
  const quotaReserved = true;
  let quotaSettled = false;

  try {
    let discoveryResult: ProcessDiscoveryMessageResult;
    try {
      if (inboundMetadata.simulateAiError) {
        throw new Error('Simulated Gemini API quota limit exceeded (429)');
      }

      discoveryResult = await processDiscoveryMessage({
        leadId: lead.id,
        messageText: inbound.text,
        emailMessageId: inbound.messageId,
        companyContext,
        providerMetadata: {
          channel: 'email',
          subject: inbound.subject,
          sender: inbound.sender,
          recipient: inbound.recipient,
          inReplyTo: inbound.inReplyTo,
          references: inbound.references,
          gmailMessageId: gmailMsgId,
          gmailThreadId,
          isSameThread: Boolean(isSameThread),
          classification: classificationType,
          intent: classificationResult.intent,
          previousIntent: threadContext?.previousIntent,
          confidence: classificationResult.confidence,
          classificationReason: classificationResult.reason,
          classifiedAt: new Date().toISOString(),
        },
      });
      console.log('[REAL_GMAIL_INBOUND_TRACE]', {
        MESSAGE_ID: gmailMsgId || inbound.messageId,
        THREAD_ID: gmailThreadId,
        IS_SAME_THREAD: Boolean(isSameThread),
        FROM: inbound.sender,
        SUBJECT: inbound.subject,
        CLASSIFICATION: classificationType,
        INTENT: classificationResult.intent,
        CLASSIFICATION_REASON: classificationResult.reason,
        COMPANY_ID: companyId,
        COMPANY_NAME: companyContext.name,
        COMPANY_INDUSTRY: companyContext.industry,
        COMPANY_SERVICES: companyContext.services || [],
        AI_CALLED: true,
        AI_RESPONSE_PREVIEW: (discoveryResult.reply || '').substring(0, 140),
        VALIDATOR_RESULT: discoveryResult.validationResult ? (discoveryResult.validationResult.isValid ? 'VALID' : `INVALID: ${discoveryResult.validationResult.issues.join('; ')}`) : 'SKIPPED',
        FALLBACK_USED: Boolean(discoveryResult.usedFallback),
        FALLBACK_REASON: discoveryResult.fallbackReason || null,
        FINAL_RESPONSE_PREVIEW: (discoveryResult.reply || '').substring(0, 140),
      });
    } catch (aiErr) {
      // AI processing failure: release reservation so 0 credits are consumed!
      await releaseEmailQuota(companyId, gmailMsgId, 'AI_GENERATION_FAILED');
      quotaSettled = true;

      // Do NOT mark as read, remove from memory to keep retryable
      removeEmailIdFromMemory(gmailMsgId);
      removeEmailIdFromMemory(rawMsgId);
      logEmailAutomationEvent({
        gmailMessageId: gmailMsgId,
        threadId: gmailThreadId,
        sender: inbound.sender,
        subject: inbound.subject,
        classification: classificationType,
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        reason: classificationResult.reason,
        processingStatus: 'error',
        aiCalled: true,
        quotaReserved: true,
        replySent: false,
        error: (aiErr as Error).message,
      });
      logEmailBatchStatus({
        message: gmailMsgId,
        thread: gmailThreadId,
        classification: classificationType,
        quota: 'released',
        ai: 'failed',
        send: 'skipped',
        final: 'ERROR',
      });
      return {
        success: false,
        status: 'error',
        errorCategory: 'EMAIL_PROVIDER_ERROR',
        errorMessage: (aiErr as Error).message,
        leadId: lead.id,
        companyId,
        classification: classificationType,
        category: classificationCategory,
        intent: classificationResult.intent,
        classificationDetails: classificationResult,
      };
    }

  // -------------------------------------------------------------------------
  // 9. DYNAMIC PROVIDER RESOLUTION
  // -------------------------------------------------------------------------
  let activeProvider = customProvider;
  if (!activeProvider) {
    try {
      activeProvider = await getEmailProviderForCompany(companyId);
    } catch {
      activeProvider = defaultProvider;
    }
  }

  // -------------------------------------------------------------------------
  // 10. CONVERSATIONAL STATE & COURTESY CLOSING GUARD (PHASE 3)
  // -------------------------------------------------------------------------
  // If no reply is required (courtesy closing, NO_RESPONSE_NEEDED, or validation failed/review needed)
  if (
    discoveryResult.requiresReply === false ||
    !discoveryResult.reply ||
    discoveryResult.reply.trim() === '' ||
    discoveryResult.conversationState === 'NO_RESPONSE_NEEDED' ||
    (discoveryResult.validationResult && !discoveryResult.validationResult.isValid)
  ) {
    const reason =
      discoveryResult.validationResult && !discoveryResult.validationResult.isValid
        ? `VALIDATION_FAILED: ${discoveryResult.validationResult.issues.join(', ')}`
        : discoveryResult.conversationState === 'NO_RESPONSE_NEEDED'
        ? 'NO_RESPONSE_NEEDED'
        : 'NO_REPLY_REQUIRED';

    // Release the reserved quota immediately - 0 credits consumed!
    await releaseEmailQuota(companyId, gmailMsgId, reason);
    quotaSettled = true;

    // Mark message as read in Gmail so Sync Inbox does not re-fetch it
    if (activeProvider.markAsRead && gmailMsgId) {
      try {
        await activeProvider.markAsRead(gmailMsgId);
      } catch (readErr) {
        console.warn(`[Email Automation] Failed to mark message ${gmailMsgId} as read:`, readErr);
      }
    }

    // Mark completed in memory
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);

    // Record idempotency in connection metadata
    try {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const processedEmailIds = (currentMeta.processedEmailIds as Record<string, unknown>) || {};
      processedEmailIds[gmailMsgId] = {
        status: 'processed_no_reply',
        classification: classificationType,
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        reason: classificationResult.reason,
        conversationState: discoveryResult.conversationState,
        validationIssues: discoveryResult.validationResult?.issues || [],
        processedAt: new Date().toISOString(),
        replySent: false,
      };

      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...currentMeta,
            processedEmailIds,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (metaErr) {
      console.warn('[Email Automation] Non-critical metadata update failed:', metaErr);
    }

    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      classification: classificationType,
      intent: classificationResult.intent,
      confidence: classificationResult.confidence,
      reason: classificationResult.reason,
      processingStatus: 'no_reply_needed',
      aiCalled: true,
      quotaReserved: true,
      replySent: false,
    });

    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'released',
      ai: 'success',
      send: 'skipped',
      final: 'SKIPPED',
    });

    return {
      success: true,
      status: 'processed',
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
      leadId: lead.id,
      companyId,
      briefCreated: discoveryResult.briefCreated,
      readyForBrief: discoveryResult.readyForBrief,
      aiResult: discoveryResult,
      replySent: false,
    };
  }

  // -------------------------------------------------------------------------
  // 11. SAFETY REQUIREMENT: FINAL GUARDS IMMEDIATELY BEFORE OUTBOUND SEND
  // -------------------------------------------------------------------------
  // Guard 1: Must be genuine client inquiry
  if (classificationType !== 'CUSTOMER_INQUIRY') {
    await releaseEmailQuota(companyId, gmailMsgId, 'NOT_CLIENT_INQUIRY');
    quotaSettled = true;
    console.warn(`[Safety Guard] Aborting send: email is not classified as genuine client inquiry (${classificationType}).`);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'released',
      ai: 'success',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: false,
      status: 'skipped_irrelevant',
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
      errorMessage: 'Blocked by safety guard: Not a genuine client inquiry.',
    };
  }

  // Guard 2: Must NOT have already been sent an outbound reply
  const alreadyRepliedGuard = await hasOutboundReplyAlreadyBeenSent(
    gmailMsgId,
    rawMsgId,
    companyId,
    activeProvider,
    gmailThreadId
  );
  if (alreadyRepliedGuard) {
    await releaseEmailQuota(companyId, gmailMsgId, 'ALREADY_REPLIED');
    quotaSettled = true;
    console.warn(`[Safety Guard] Aborting send: message ${gmailMsgId} was already replied.`);
    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'released',
      ai: 'success',
      send: 'skipped',
      final: 'SKIPPED',
    });
    return {
      success: true,
      status: 'duplicate_ignored',
      errorCategory: 'EMAIL_WEBHOOK_DUPLICATE',
    };
  }

  // -------------------------------------------------------------------------
  // 11. GENERATE AND SEND OUTBOUND EMAIL REPLY
  // -------------------------------------------------------------------------
  const connectionMetadata = (connection.metadata as Record<string, unknown>) || {};
  const companySenderAddress =
    connection.displayName ||
    (connectionMetadata.googleEmail as string) ||
    (connectionMetadata.inboundEmail as string) ||
    undefined;

  const replySubject = inbound.subject.toLowerCase().startsWith('re:')
    ? inbound.subject
    : `Re: ${inbound.subject}`;

  const referencesHeader = inbound.references
    ? `${inbound.references} ${inbound.messageId}`
    : inbound.messageId;

  const formattedHtml = generateEmailReplyHtml({
    leadName: lead && 'clientName' in lead ? (lead.clientName as string) : 'Valued Client',
    replyText: discoveryResult.reply,
    options: discoveryResult.options,
    readyForBrief: discoveryResult.readyForBrief,
  });

  // -------------------------------------------------------------------------
  // 11. APPROVAL QUEUE & HOLDING RESPONSE CHECK (PHASE 2)
  // -------------------------------------------------------------------------
  const permEval = discoveryResult.permissionEvaluation;
  const requiresApproval =
    permEval &&
    (permEval.decision === 'NEEDS_APPROVAL' ||
      permEval.decision === 'BLOCKED' ||
      permEval.requiresCompanyApproval);

  if (requiresApproval && permEval) {
    const holdingText = permEval.customerHoldingResponse;
    let holdingSendResult: { success: boolean; providerMessageId?: string; error?: string } = { success: false };

    if (holdingText && holdingText.trim().length > 0) {
      const formattedHoldingHtml = generateEmailReplyHtml({
        leadName: lead && 'clientName' in lead ? (lead.clientName as string) : 'Valued Client',
        replyText: holdingText,
        readyForBrief: false,
      });

      if (typeof activeProvider.sendMessage === 'function') {
        holdingSendResult = await activeProvider.sendMessage({
          to: inbound.sender,
          from: companySenderAddress,
          subject: replySubject,
          text: holdingText,
          html: formattedHoldingHtml,
          inReplyTo: inbound.messageId,
          references: referencesHeader,
          metadata: {
            leadId: lead.id,
            companyId,
            incomingGmailMessageId: gmailMsgId,
            ...(gmailThreadId ? { gmailThreadId } : {}),
            isHoldingResponse: 'true',
          },
        });
      } else if (
        'sendEmail' in activeProvider &&
        typeof (activeProvider as unknown as { sendEmail: (...args: unknown[]) => Promise<{ success: boolean; providerMessageId?: string; error?: string }> }).sendEmail === 'function'
      ) {
        holdingSendResult = await (
          activeProvider as unknown as {
            sendEmail: (
              to: string,
              subject: string,
              text: string,
              options: Record<string, unknown>
            ) => Promise<{ success: boolean; providerMessageId?: string; error?: string }>;
          }
        ).sendEmail(
          inbound.sender,
          replySubject,
          holdingText,
          {
            from: companySenderAddress,
            html: formattedHoldingHtml,
            inReplyTo: inbound.messageId,
            references: referencesHeader,
            metadata: {
              leadId: lead.id,
              companyId,
              incomingGmailMessageId: gmailMsgId,
              ...(gmailThreadId ? { gmailThreadId } : {}),
              isHoldingResponse: 'true',
            },
          }
        );
      }
    }

    // Create approval queue item preserving 3 variations and metadata
    const overridesList: string[] = [];
    if (discoveryResult.structuredContext?.facts) {
      for (const [key, val] of Object.entries(discoveryResult.structuredContext.facts)) {
        if (val) overridesList.push(`${key}: ${val}`);
      }
    }

    const approvalItem = await createApprovalItem({
      companyId,
      leadId: lead.id,
      gmailThreadId,
      inboundMessageId: gmailMsgId,
      customerName: lead && 'clientName' in lead ? (lead.clientName as string) : 'Valued Client',
      customerEmail: inbound.sender,
      customerCompanyName: (lead as { companyName?: string })?.companyName || undefined,
      subject: inbound.subject,
      latestCustomerMessage: inbound.text,
      conversationHistory: threadContext?.priorMessages?.map((h) => ({
        sender: (h.sender === 'client' ? 'client' : h.sender === 'system' ? 'system' : 'agent') as 'client' | 'agent' | 'system',
        text: h.text,
        createdAt: h.createdAt,
      })) || [],
      intent: classificationResult.intent || 'unknown',
      riskLevel: permEval.riskLevel,
      permissionDecision: permEval.decision,
      restrictedTopics: permEval.restrictedTopics,
      whyApprovalRequired: permEval.reasons,
      currentTurnRequirements: discoveryResult.structuredContext?.currentTurnRequirements || [],
      commercialTermsDetected: permEval.restrictedTopics || [],
      updatedOverrides: overridesList,
      customerHoldingResponse: holdingText,
      holdingResponseSent: holdingSendResult.success,
      holdingOutboundMessageId: holdingSendResult.providerMessageId,
      baseDraft: discoveryResult.reply,
      inReplyTo: inbound.messageId,
      references: referencesHeader,
    });

    // Holding response is an acknowledgment/holding message, NOT a billable customer response.
    // The reserved quota credit is released so that:
    // - Inbound customer email = 0 credits
    // - Holding response = 0 credits
    // - Approval queue creation = 0 credits
    // Quota credit is only consumed (+1) when approveAndSendItem() successfully sends the final customer response.
    await releaseEmailQuota(companyId, gmailMsgId, 'HELD_FOR_APPROVAL');
    quotaSettled = true;

    completedEmailMessageIds.add(gmailMsgId);
    completedEmailMessageIds.add(rawMsgId);
    inFlightEmailMessageIds.delete(gmailMsgId);
    inFlightEmailMessageIds.delete(rawMsgId);

    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      classification: classificationType,
      intent: classificationResult.intent,
      confidence: classificationResult.confidence,
      reason: 'Approval required: ' + permEval.reasons.join('; '),
      processingStatus: 'needs_approval',
      aiCalled: true,
      quotaReserved: false,
      replySent: holdingSendResult.success,
    });

    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'released',
      ai: 'success',
      send: holdingSendResult.success ? 'success' : 'skipped',
      final: holdingSendResult.success ? 'PROCESSED_AND_REPLIED' : 'SKIPPED',
    });

    return {
      success: true,
      status: 'processed',
      approvalRequired: true,
      approvalItem,
      leadId: lead.id,
      companyId,
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
      briefCreated: discoveryResult.briefCreated,
      readyForBrief: discoveryResult.readyForBrief,
      replySent: holdingSendResult.success,
      holdingResponseSent: holdingSendResult.success,
      holdingOutboundMessageId: holdingSendResult.providerMessageId,
      aiResult: discoveryResult,
    };
  }

  const sendResult = await activeProvider.sendMessage({
    to: inbound.sender,
    from: companySenderAddress,
    subject: replySubject,
    text: discoveryResult.reply,
    html: formattedHtml,
    inReplyTo: inbound.messageId,
    references: referencesHeader,
    metadata: {
      leadId: lead.id,
      companyId,
      agentMessageId: discoveryResult.agentMessageRecord.id,
      incomingGmailMessageId: gmailMsgId,
      ...(gmailThreadId ? { gmailThreadId } : {}),
    },
  });

  // -------------------------------------------------------------------------
  // 12. OUTBOUND SEND ERROR HANDLING (Must remain retryable)
  // -------------------------------------------------------------------------
  if (!sendResult.success) {
    // Send failed: release reservation so 0 credits are consumed!
    await releaseEmailQuota(companyId, gmailMsgId, sendResult.error || 'SEND_FAILED');
    quotaSettled = true;

    // Do NOT mark as read, remove from in-memory cache
    removeEmailIdFromMemory(gmailMsgId);
    removeEmailIdFromMemory(rawMsgId);
    logEmailAutomationEvent({
      gmailMessageId: gmailMsgId,
      threadId: gmailThreadId,
      sender: inbound.sender,
      subject: inbound.subject,
      classification: classificationType,
      confidence: classificationResult.confidence,
      reason: classificationResult.reason,
      processingStatus: 'error',
      aiCalled: true,
      quotaReserved: true,
      replySent: false,
      error: sendResult.error || 'Failed to send outbound email reply',
    });
    logEmailBatchStatus({
      message: gmailMsgId,
      thread: gmailThreadId,
      classification: classificationType,
      quota: 'released',
      ai: 'success',
      send: 'failed',
      final: 'FAILED_TO_SEND',
    });
    return {
      success: false,
      status: 'error',
      errorCategory: 'EMAIL_SEND_FAILED',
      errorMessage: sendResult.error,
      leadId: lead.id,
      companyId,
      classification: classificationType,
      category: classificationCategory,
      intent: classificationResult.intent,
      classificationDetails: classificationResult,
      briefCreated: discoveryResult.briefCreated,
      readyForBrief: discoveryResult.readyForBrief,
      sendResult,
      aiResult: discoveryResult,
    };
  }

  // -------------------------------------------------------------------------
  // 13. POST-SEND SUCCESS: COMMIT QUOTA, MARK READ & RECORD OUTBOUND SNAPSHOT
  // -------------------------------------------------------------------------
  // Commit credit reservation into 1 used credit
  try {
    await commitEmailQuota(companyId, gmailMsgId, {
      leadId: lead.id,
      outboundMessageId: sendResult.providerMessageId,
    });
    quotaSettled = true;
  } catch (commitErr) {
    console.error('[Email Automation] Failed to commit quota credit:', commitErr);
  }

  // Mark completed in memory
  completedEmailMessageIds.add(gmailMsgId);
  completedEmailMessageIds.add(rawMsgId);
  inFlightEmailMessageIds.delete(gmailMsgId);
  inFlightEmailMessageIds.delete(rawMsgId);

  // Mark message as read in Gmail so Sync Inbox does not repeatedly process it
  if (activeProvider.markAsRead && gmailMsgId) {
    try {
      await activeProvider.markAsRead(gmailMsgId);
    } catch (readErr) {
      console.warn(`[Email Automation] Failed to mark message ${gmailMsgId} as read:`, readErr);
    }
  }

  // Update ChatMessage snapshot with outbound provider message ID and thread data
  if (
    sendResult.providerMessageId &&
    discoveryResult.agentMessageRecord?.id &&
    !discoveryResult.agentMessageRecord.id.startsWith('no-reply-')
  ) {
    try {
      const existingSnapshot =
        discoveryResult.agentMessageRecord?.extractedDataSnapshot ||
        (discoveryResult.extractedRequirements as unknown as Record<string, unknown>) ||
        {};

      await prisma.chatMessage.update({
        where: { id: discoveryResult.agentMessageRecord.id },
        data: {
          extractedDataSnapshot: {
            ...existingSnapshot,
            outboundMessageId: sendResult.providerMessageId,
            inReplyToGmailMessageId: gmailMsgId,
            gmailMessageId: gmailMsgId,
            channel: 'email',
            status: 'processed',
            provider: connection.provider || 'google',
            classification: classificationType,
            intent: classificationResult.intent,
            confidence: classificationResult.confidence,
            classificationReason: classificationResult.reason,
            classifiedAt: new Date().toISOString(),
            replySent: true,
            ...(gmailThreadId ? { gmailThreadId } : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (snapshotErr) {
      console.error('[Email Automation] Failed to update agent message snapshot:', snapshotErr);
    }

    // Persist processed ID in AutomationConnection metadata for additional tenant-scoped idempotency
    try {
      const currentMeta = (connection.metadata as Record<string, unknown>) || {};
      const processedEmailIds = (currentMeta.processedEmailIds as Record<string, unknown>) || {};
      processedEmailIds[gmailMsgId] = {
        status: 'processed',
        classification: classificationType,
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        reason: classificationResult.reason,
        processedAt: new Date().toISOString(),
        outboundMessageId: sendResult.providerMessageId,
        replySent: true,
      };

      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...currentMeta,
            processedEmailIds,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (metaErr) {
      console.warn('[Email Automation] Non-critical metadata update failed:', metaErr);
    }
  }

  logEmailAutomationEvent({
    gmailMessageId: gmailMsgId,
    threadId: gmailThreadId,
    sender: inbound.sender,
    subject: inbound.subject,
    classification: classificationType,
    intent: classificationResult.intent,
    confidence: classificationResult.confidence,
    reason: classificationResult.reason,
    processingStatus: 'processed',
    aiCalled: true,
    quotaReserved: true,
    replySent: true,
    outboundMessageId: sendResult.providerMessageId,
  });

  logEmailBatchStatus({
    message: gmailMsgId,
    thread: gmailThreadId,
    classification: classificationType,
    quota: 'committed',
    ai: 'success',
    send: 'success',
    final: 'PROCESSED_AND_REPLIED',
  });

  return {
    success: true,
    status: 'processed',
    classification: classificationType,
    category: classificationCategory,
    intent: classificationResult.intent,
    classificationDetails: classificationResult,
    leadId: lead.id,
    companyId,
    briefCreated: discoveryResult.briefCreated,
    readyForBrief: discoveryResult.readyForBrief,
    sendResult,
    aiResult: discoveryResult,
    replySent: Boolean(sendResult?.success),
  };
} catch (procErr) {
  if (quotaReserved && !quotaSettled) {
    await releaseEmailQuota(companyId, gmailMsgId, `UNHANDLED_EXCEPTION: ${(procErr as Error).message}`).catch(() => {});
    quotaSettled = true;
  }
  logEmailBatchStatus({
    message: gmailMsgId,
    thread: gmailThreadId,
    classification: classificationType,
    quota: 'released',
    ai: 'failed',
    send: 'failed',
    final: 'ERROR',
  });
  throw procErr;
} finally {
  inFlightEmailMessageIds.delete(gmailMsgId);
  inFlightEmailMessageIds.delete(rawMsgId);
}
}

/**
 * Generates clean, professional HTML formatted email content for prospective clients.
 */
export function generateEmailReplyHtml(params: {
  leadName: string;
  replyText: string;
  options?: string[];
  readyForBrief?: boolean;
}): string {
  const paragraphs = params.replyText
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e293b;">${escapeHtml(p.trim())}</p>`)
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

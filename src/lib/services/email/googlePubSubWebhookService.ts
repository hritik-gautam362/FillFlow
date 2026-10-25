import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, Prisma } from '@prisma/client';
import { requireAutomationAccess } from '@/lib/services/automationAccessService';
import { getGoogleProviderForCompany } from '@/lib/services/email/emailProviderFactory';
import {
  processInboundEmail,
  isEmailIdInMemory,
  isMessageAlreadyProcessed,
  extractEmailAddress,
} from '@/lib/services/email/emailInboundService';

export interface PubSubPayload {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

export interface DecodedPubSubData {
  emailAddress?: string;
  historyId?: string;
}

export interface PubSubWebhookResult {
  statusCode: number;
  responseBody: Record<string, unknown>;
}

// In-flight concurrency lock per company to prevent concurrent duplicate history scans
const inFlightSyncCompanies = new Set<string>();
// Follow-up sync queue so notifications arriving during active sync are not lost
const pendingCompanySync = new Set<string>();

export function clearPubSubInFlightLock(companyId?: string): void {
  if (companyId) {
    inFlightSyncCompanies.delete(companyId);
    pendingCompanySync.delete(companyId);
  } else {
    inFlightSyncCompanies.clear();
    pendingCompanySync.clear();
  }
}

/**
 * Core event-driven handler for Google Cloud Pub/Sub Gmail push notifications.
 * Decoupled from Next.js HTTP server request/response for maximum testability and reliability.
 */
export async function handleGooglePubSubWebhook(params: {
  body: PubSubPayload;
  queryToken?: string | null;
  authHeader?: string | null;
}): Promise<PubSubWebhookResult> {
  const { body, queryToken, authHeader } = params;

  // 1. Webhook Verification Token validation
  const expectedToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
  if (expectedToken) {
    const bearerToken = (authHeader || '').startsWith('Bearer ') ? (authHeader || '').substring(7) : '';

    if (queryToken !== expectedToken && bearerToken !== expectedToken) {
      console.warn('[Google Pub/Sub Webhook] Unauthorized request: Token mismatch.');
      return {
        statusCode: 401,
        responseBody: { success: false, error: 'Unauthorized' },
      };
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[Google Pub/Sub Webhook] CRITICAL: GMAIL_PUBSUB_VERIFICATION_TOKEN is not configured in production.');
    return {
      statusCode: 401,
      responseBody: { success: false, error: 'Unauthorized: Webhook verification token required in production' },
    };
  }

  if (!body?.message?.data) {
    console.warn('[Google Pub/Sub Webhook] Bad request: Missing message.data in PubSub payload.');
    return {
      statusCode: 400,
      responseBody: { success: false, error: 'Missing message.data' },
    };
  }

  // 2. Decode base64 payload from Google Pub/Sub
  let decodedData: DecodedPubSubData;
  try {
    const rawJson = Buffer.from(body.message.data, 'base64').toString('utf-8');
    decodedData = JSON.parse(rawJson);
  } catch {
    console.error('[Google Pub/Sub Webhook] Failed to decode base64 JSON payload.');
    return {
      statusCode: 400,
      responseBody: { success: false, error: 'Invalid base64 JSON' },
    };
  }

  const { emailAddress, historyId: incomingHistoryId } = decodedData;
  if (!emailAddress) {
    console.warn('[Google Pub/Sub Webhook] Missing emailAddress in decoded data.');
    return {
      statusCode: 200,
      responseBody: { success: true, message: 'No emailAddress found' },
    };
  }

  const normalizedEmail = emailAddress.toLowerCase().trim();

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Google Pub/Sub Webhook] Received notification: mailbox=${normalizedEmail}, historyId=${incomingHistoryId || 'none'}, pubsubMsgId=${body.message?.messageId || 'unknown'}`
    );
  }

  // 3. Strict Multi-Tenant Company Resolution
  const connection = await prisma.automationConnection.findFirst({
    where: {
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      OR: [
        { displayName: { equals: normalizedEmail, mode: 'insensitive' } },
        { metadata: { path: ['googleEmail'], equals: normalizedEmail } },
      ],
    },
    orderBy: { connectedAt: 'desc' },
  });

  if (!connection) {
    console.warn(`[Google Pub/Sub Webhook] No active Google connection found for email: ${normalizedEmail}`);
    // Return 200 so Pub/Sub does not endlessly retry orphaned notifications
    return {
      statusCode: 200,
      responseBody: { success: true, message: 'No connection mapped' },
    };
  }

  const companyId = connection.companyId;

  // 4. Automation Access Control Check
  const accessCheck = await requireAutomationAccess(companyId, AutomationType.email);
  if (!accessCheck.allowed) {
    console.warn(`[Google Pub/Sub Webhook] Email automation is locked for company ${companyId}.`);
    return {
      statusCode: 200,
      responseBody: { success: true, status: 'automation_disabled' },
    };
  }

  // 5. In-flight concurrency lock per company
  if (inFlightSyncCompanies.has(companyId)) {
    console.log(`[Google Pub/Sub Webhook] Sync already in-flight for company ${companyId}. Queuing follow-up.`);
    pendingCompanySync.add(companyId);
    return {
      statusCode: 200,
      responseBody: { success: true, message: 'Sync in-flight, follow-up queued' },
    };
  }

  inFlightSyncCompanies.add(companyId);

  try {
    // 6. Fetch provider with company decrypted tokens
    let provider;
    try {
      provider = await getGoogleProviderForCompany(companyId);
    } catch (provErr) {
      console.error(`[Google Pub/Sub Webhook] Failed to initialize provider for company ${companyId}:`, (provErr as Error).message);
      return {
        statusCode: 200,
        responseBody: { success: true, error: 'Provider initialization failed' },
      };
    }

    const aggregateCounts = { total: 0, success: 0, duplicates: 0, skipped: 0 };
    let finalLatestHistoryId = incomingHistoryId || '1';
    let keepSyncing = true;
    let syncPass = 0;
    const MAX_SYNC_PASSES = 5;

    while (keepSyncing && syncPass < MAX_SYNC_PASSES) {
      syncPass++;
      // Consume the current pending follow-up trigger
      pendingCompanySync.delete(companyId);

      // Fetch fresh connection metadata for latest cursor and pending retry messages
      const freshConn = await prisma.automationConnection.findUnique({
        where: { id: connection.id },
      });
      const currentMeta = (freshConn?.metadata as Record<string, unknown>) || (connection.metadata as Record<string, unknown>) || {};
      const previousHistoryId = currentMeta.historyId as string | undefined;
      const storedPageToken = currentMeta.historyPageToken as string | undefined;
      const storedPendingRetries = Array.isArray(currentMeta.pendingRetryMessageIds)
        ? (currentMeta.pendingRetryMessageIds as string[])
        : [];

      let messageIdsToProcess: string[] = [...storedPendingRetries];
      let resolvedLatestHistoryId: string = incomingHistoryId || previousHistoryId || '1';
      let remainingPageToken: string | undefined = undefined;
      let isExpiredHistory = false;
      let historyFetchSucceeded = false;

      // 7. Retrieve message changes via Gmail history.list(startHistoryId=previousHistoryId)
      if (previousHistoryId) {
        try {
          const historyRes = await provider.listHistory(previousHistoryId, storedPageToken);
          messageIdsToProcess = Array.from(new Set([...messageIdsToProcess, ...historyRes.messageIds]));
          historyFetchSucceeded = true;

          if (historyRes.hasMorePages && historyRes.nextPageToken) {
            remainingPageToken = historyRes.nextPageToken;
            // More pages remain for this window: DO NOT advance historyId past unread pages
            resolvedLatestHistoryId = previousHistoryId;
            pendingCompanySync.add(companyId);
          } else {
            resolvedLatestHistoryId = historyRes.latestHistoryId || incomingHistoryId || previousHistoryId;
            remainingPageToken = undefined;
          }
        } catch (histErr) {
          const is404 =
            (histErr as unknown as { isExpiredHistoryId?: boolean; statusCode?: number })?.isExpiredHistoryId ||
            (histErr as unknown as { statusCode?: number })?.statusCode === 404 ||
            (histErr as Error).message.includes('404') ||
            (histErr as Error).message.includes('expired');

          if (is404) {
            isExpiredHistory = true;
            console.warn(
              `[Google Pub/Sub Webhook] HistoryId ${previousHistoryId} expired for company ${companyId}. Performing safe recovery sync.`
            );
          } else {
            console.warn(`[Google Pub/Sub Webhook] History sync failed:`, (histErr as Error).message);
          }
        }
      } else {
        // First notification without a stored historyId: use incoming historyId as baseline
        resolvedLatestHistoryId = incomingHistoryId || '1';
        historyFetchSucceeded = true;
      }

      // Safe Recovery for Expired HistoryId:
      if (isExpiredHistory) {
        try {
          if (provider.getProfile) {
            const profile = await provider.getProfile();
            if (profile.historyId) {
              resolvedLatestHistoryId = profile.historyId;
            }
          }

          const accessToken = await provider.getValidAccessToken();
          if (!accessToken.startsWith('sim-')) {
            const safeQuery = encodeURIComponent(
              'in:inbox is:unread -category:promotions -category:social -category:updates -category:forums -from:me -is:spam -is:trash'
            );
            const listRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${safeQuery}&maxResults=10`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            if (listRes.ok) {
              const listData = await listRes.json();
              const recMessages = (listData.messages as Array<{ id: string }>) || [];
              messageIdsToProcess = Array.from(new Set([...messageIdsToProcess, ...recMessages.map((m) => m.id)]));
              historyFetchSucceeded = true;
            }
          } else {
            historyFetchSucceeded = true;
          }
        } catch (recErr) {
          console.error('[Google Pub/Sub Webhook] Safe recovery query failed:', (recErr as Error).message);
        }
      }

      // 8. Process each incoming message through AI Discovery Pipeline
      const failedMessageIds: string[] = [];

      for (const msgId of messageIdsToProcess) {
        aggregateCounts.total++;
        try {
          if (isEmailIdInMemory(msgId)) {
            aggregateCounts.duplicates++;
            continue;
          }

          const alreadyProcessed = await isMessageAlreadyProcessed(msgId, msgId, companyId, provider);
          if (alreadyProcessed) {
            aggregateCounts.duplicates++;
            continue;
          }

          const parsedEmail = await provider.fetchMessage(msgId);

          // Skip self-sent outbound messages
          const cleanSender = extractEmailAddress(parsedEmail.sender);
          if (cleanSender === normalizedEmail) {
            aggregateCounts.skipped++;
            continue;
          }

          // Scope explicit companyId in parsed email metadata
          parsedEmail.metadata = {
            ...(parsedEmail.metadata || {}),
            companyId,
          };

          const result = await processInboundEmail(parsedEmail, provider);
          if (result.success) {
            aggregateCounts.success++;
          } else if (result.status === 'error') {
            failedMessageIds.push(msgId);
          }
        } catch (msgErr) {
          console.error(`[Google Pub/Sub Webhook] Error processing message ${msgId}:`, (msgErr as Error).message);
          failedMessageIds.push(msgId);
        }
      }

      finalLatestHistoryId = resolvedLatestHistoryId;

      // 9. Persist newest historyId safely only when history sync succeeded
      if (resolvedLatestHistoryId && (historyFetchSucceeded || isExpiredHistory)) {
        try {
          const latestConn = await prisma.automationConnection.findUnique({
            where: { id: connection.id },
          });
          const freshMeta = (latestConn?.metadata as Record<string, unknown>) || currentMeta;
          const freshPendingRetries = Array.isArray(freshMeta.pendingRetryMessageIds)
            ? (freshMeta.pendingRetryMessageIds as string[])
            : [];
          // Safely merge: keep retries added concurrently, remove succeeded ones, and add current failures
          const mergedPendingRetries = Array.from(
            new Set([
              ...freshPendingRetries.filter((id) => !messageIdsToProcess.includes(id)),
              ...failedMessageIds,
            ])
          );

          await prisma.automationConnection.update({
            where: { id: connection.id },
            data: {
              metadata: {
                ...freshMeta,
                historyId: resolvedLatestHistoryId,
                historyPageToken: remainingPageToken || null,
                pendingRetryMessageIds: mergedPendingRetries,
                lastSyncedAt: new Date().toISOString(),
              } as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (dbErr) {
          console.warn('[Google Pub/Sub Webhook] Non-critical historyId update error:', (dbErr as Error).message);
        }
      }

      // Check if another Pub/Sub notification arrived while this pass was executing
      keepSyncing = pendingCompanySync.has(companyId);
      if (keepSyncing) {
        console.log(`[Google Pub/Sub Webhook] Draining queued follow-up sync for company ${companyId} (pass ${syncPass})...`);
      }
    }

    return {
      statusCode: 200,
      responseBody: {
        success: true,
        companyId,
        stats: aggregateCounts,
        latestHistoryId: finalLatestHistoryId,
      },
    };
  } finally {
    inFlightSyncCompanies.delete(companyId);
    pendingCompanySync.delete(companyId);
  }
}

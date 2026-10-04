import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, Prisma } from '@prisma/client';
import { getGoogleProviderForCompany } from './emailProviderFactory';

export const DEFAULT_GMAIL_PUBSUB_TOPIC =
  process.env.GMAIL_PUBSUB_TOPIC || 'projects/automation-508113/topics/gmail-inbound';

/**
 * Resolves the public webhook URL configured for Google Cloud Pub/Sub push notifications.
 * Never hardcodes localhost if GOOGLE_PUBSUB_WEBHOOK_URL or public app URL is provided.
 */
export function getGooglePubSubWebhookUrl(fallbackOrigin?: string): string {
  if (process.env.GOOGLE_PUBSUB_WEBHOOK_URL) {
    return process.env.GOOGLE_PUBSUB_WEBHOOK_URL.trim();
  }
  if (process.env.NEXT_PUBLIC_GOOGLE_PUBSUB_WEBHOOK_URL) {
    return process.env.NEXT_PUBLIC_GOOGLE_PUBSUB_WEBHOOK_URL.trim();
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (base) {
    return `${base.replace(/\/+$/, '')}/api/webhooks/google/pubsub`;
  }

  if (fallbackOrigin) {
    return `${fallbackOrigin.replace(/\/+$/, '')}/api/webhooks/google/pubsub`;
  }

  return 'http://localhost:3000/api/webhooks/google/pubsub';
}

/**
 * Returns the fully qualified Google Cloud Pub/Sub topic string.
 */
export function getGmailPubSubTopic(): string {
  return process.env.GMAIL_PUBSUB_TOPIC || DEFAULT_GMAIL_PUBSUB_TOPIC;
}

export interface SetupWatchResult {
  success: boolean;
  historyId?: string;
  expiration?: string;
  topic?: string;
  error?: string;
}

/**
 * Registers / refreshes a Gmail push notification watch for a specific connected company.
 * Persists the resulting historyId, watchExpiration, and watchStatus in AutomationConnection metadata.
 */
export async function setupGmailWatch(
  companyId: string,
  customTopic?: string
): Promise<SetupWatchResult> {
  const topicName = customTopic || getGmailPubSubTopic();

  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: AutomationType.email,
        },
      },
    });

    if (!connection) {
      return { success: false, error: `No email connection found for company ${companyId}` };
    }

    if (connection.status !== ConnectionStatus.connected || connection.provider !== 'google') {
      return {
        success: false,
        error: `Company ${companyId} does not have an active Google connection (status: ${connection.status})`,
      };
    }

    const provider = await getGoogleProviderForCompany(companyId);
    const watchResult = await provider.setupWatch(topicName);

    const currentMeta = (connection.metadata as Record<string, unknown>) || {};
    const updatedMeta: Record<string, unknown> = {
      ...currentMeta,
      historyId: watchResult.historyId,
      watchExpiration: watchResult.expiration,
      watchStatus: 'active',
      watchTopic: topicName,
      lastWatchRenewedAt: new Date().toISOString(),
      watchError: null,
    };

    await prisma.automationConnection.update({
      where: { id: connection.id },
      data: {
        metadata: updatedMeta as unknown as Prisma.InputJsonValue,
      },
    });

    console.log(
      `[GmailWatchService] Watch registered successfully for company ${companyId}. HistoryId: ${watchResult.historyId}, Expiration: ${watchResult.expiration}`
    );

    return {
      success: true,
      historyId: watchResult.historyId,
      expiration: watchResult.expiration,
      topic: topicName,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || 'Failed to setup Gmail watch';
    console.error(`[GmailWatchService] Error registering watch for company ${companyId}:`, errorMsg);

    // Record error in metadata for administrative observability
    try {
      const conn = await prisma.automationConnection.findUnique({
        where: {
          companyId_automationType: {
            companyId,
            automationType: AutomationType.email,
          },
        },
      });
      if (conn) {
        const meta = (conn.metadata as Record<string, unknown>) || {};
        await prisma.automationConnection.update({
          where: { id: conn.id },
          data: {
            metadata: {
              ...meta,
              watchStatus: 'error',
              watchError: errorMsg,
              lastWatchAttemptAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch {
      // Non-critical metadata write failure
    }

    return { success: false, error: errorMsg, topic: topicName };
  }
}

/**
 * Renews Gmail watch for a company if approaching expiration (default threshold: within 48 hours).
 */
export async function renewGmailWatchIfNeeded(
  companyId: string,
  thresholdHours: number = 48
): Promise<{ renewed: boolean; reason?: string; error?: string }> {
  try {
    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: AutomationType.email,
        },
      },
    });

    if (!connection || connection.status !== ConnectionStatus.connected || connection.provider !== 'google') {
      return { renewed: false, reason: 'Connection is not active Google provider' };
    }

    const metadata = (connection.metadata as Record<string, unknown>) || {};
    const expirationStr = metadata.watchExpiration as string | undefined;

    let needsRenewal = false;
    let reason = '';

    if (!expirationStr) {
      needsRenewal = true;
      reason = 'No watch expiration recorded';
    } else {
      const expirationMs = Number(expirationStr);
      const now = Date.now();
      const timeRemainingMs = expirationMs - now;
      const thresholdMs = thresholdHours * 3600 * 1000;

      if (timeRemainingMs <= 0) {
        needsRenewal = true;
        reason = `Watch already expired at ${new Date(expirationMs).toISOString()}`;
      } else if (timeRemainingMs < thresholdMs) {
        needsRenewal = true;
        reason = `Watch expires in ${(timeRemainingMs / 3600000).toFixed(1)}h (threshold: ${thresholdHours}h)`;
      }
    }

    if (!needsRenewal) {
      return { renewed: false, reason: 'Watch is still healthy and does not need renewal' };
    }

    console.log(`[GmailWatchService] Renewing watch for company ${companyId}: ${reason}`);
    const setupRes = await setupGmailWatch(companyId);

    if (setupRes.success) {
      return { renewed: true, reason };
    } else {
      return { renewed: false, reason, error: setupRes.error };
    }
  } catch (err) {
    const errorMsg = (err as Error).message || 'Unexpected error renewing watch';
    console.error(`[GmailWatchService] Failed watch renewal check for company ${companyId}:`, errorMsg);
    return { renewed: false, error: errorMsg };
  }
}

/**
 * Scans all connected Google mailbox integrations across all companies and renews any watches due for renewal.
 * Designed for daily cron jobs or scheduled tasks.
 */
export async function renewAllExpiringWatches(thresholdHours: number = 48): Promise<{
  total: number;
  renewed: number;
  healthy: number;
  failed: number;
  details: Array<{ companyId: string; status: string; reason?: string; error?: string }>;
}> {
  const connections = await prisma.automationConnection.findMany({
    where: {
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
    },
  });

  const details: Array<{ companyId: string; status: string; reason?: string; error?: string }> = [];
  let renewedCount = 0;
  let healthyCount = 0;
  let failedCount = 0;

  for (const conn of connections) {
    const res = await renewGmailWatchIfNeeded(conn.companyId, thresholdHours);
    if (res.renewed) {
      renewedCount++;
      details.push({ companyId: conn.companyId, status: 'renewed', reason: res.reason });
    } else if (res.error) {
      failedCount++;
      details.push({ companyId: conn.companyId, status: 'failed', reason: res.reason, error: res.error });
    } else {
      healthyCount++;
      details.push({ companyId: conn.companyId, status: 'healthy', reason: res.reason });
    }
  }

  console.log(
    `[GmailWatchService] Completed watch scan for ${connections.length} connections: ${renewedCount} renewed, ${healthyCount} healthy, ${failedCount} failed`
  );

  return {
    total: connections.length,
    renewed: renewedCount,
    healthy: healthyCount,
    failed: failedCount,
    details,
  };
}

/**
 * Stops an active Gmail watch for a company upon disconnection.
 */
export async function stopGmailWatch(companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const provider = await getGoogleProviderForCompany(companyId);
    if (provider.stopWatch) {
      await provider.stopWatch();
    }

    const connection = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: AutomationType.email,
        },
      },
    });

    if (connection) {
      const meta = (connection.metadata as Record<string, unknown>) || {};
      await prisma.automationConnection.update({
        where: { id: connection.id },
        data: {
          metadata: {
            ...meta,
            watchStatus: 'stopped',
            watchStoppedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    console.log(`[GmailWatchService] Watch stopped cleanly for company ${companyId}`);
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[GmailWatchService] Non-blocking error stopping watch for company ${companyId}:`, msg);
    return { success: false, error: msg };
  }
}

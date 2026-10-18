import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, Prisma } from '@prisma/client';
import { decryptToken } from '@/lib/security/encryption';
import { stopGmailWatch } from '@/lib/services/email/gmailWatchService';

export interface DisconnectGoogleResult {
  disconnected: boolean;
  message: string;
  revoked: boolean;
  watchStopped: boolean;
  alreadyDisconnected?: boolean;
  revocationError?: string | null;
}

/**
 * Unified, safe, idempotent disconnection service for Google Workspace / Gmail integrations.
 *
 * Requirements fulfilled:
 * 1. Stops active Gmail push notification watch cleanly.
 * 2. Attempts token revocation with Google's revocation endpoint using refreshToken, falling back to accessToken.
 * 3. Handles expired tokens, network errors, or Google 400s safely without aborting persistent cleanup.
 * 4. Selectively purges sensitive encrypted tokens from metadata while preserving approvalQueue and deduplication history.
 * 5. Prevents disconnected connections from refreshing tokens or executing further Gmail API requests.
 * 6. Records a safe audit entry without leaking credentials.
 * 7. Completely idempotent across multiple invocations.
 */
export async function disconnectGoogleIntegration(companyId: string): Promise<DisconnectGoogleResult> {
  const connection = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  // Idempotency: If no connection exists or already disconnected without credentials
  if (!connection) {
    return {
      disconnected: true,
      message: 'No email connection exists for this company.',
      revoked: false,
      watchStopped: false,
      alreadyDisconnected: true,
    };
  }

  const currentMeta = (connection.metadata as Record<string, unknown>) || {};
  const hasCredentials = Boolean(currentMeta.encryptedAccessToken || currentMeta.encryptedRefreshToken);

  if (connection.status === ConnectionStatus.disconnected && !hasCredentials) {
    return {
      disconnected: true,
      message: 'Google mailbox connection is already disconnected.',
      revoked: false,
      watchStopped: false,
      alreadyDisconnected: true,
    };
  }

  let watchStopped = false;
  let revoked = false;
  let revocationError: string | null = null;

  if (connection.provider === 'google') {
    // 1. Cleanly stop Gmail push notification watch
    try {
      const stopResult = await stopGmailWatch(companyId);
      watchStopped = Boolean(stopResult.success);
    } catch (watchErr) {
      console.warn(`[Google Disconnect] Non-critical error stopping Gmail watch for company ${companyId}:`, (watchErr as Error).message);
    }

    // 2. Revoke OAuth credentials with Google revocation endpoint
    const encryptedRefreshToken = currentMeta.encryptedRefreshToken as string | undefined;
    const encryptedAccessToken = currentMeta.encryptedAccessToken as string | undefined;

    let refreshToken = '';
    let accessToken = '';

    try {
      if (encryptedRefreshToken) refreshToken = decryptToken(encryptedRefreshToken);
    } catch {
      // Ignore decryption failure for stale or already corrupted token
    }

    try {
      if (encryptedAccessToken) accessToken = decryptToken(encryptedAccessToken);
    } catch {
      // Ignore decryption failure
    }

    // Attempt revocation: Prefer refresh token (invalidates all associated tokens)
    const tokenToRevoke = refreshToken && !refreshToken.startsWith('sim-')
      ? refreshToken
      : accessToken && !accessToken.startsWith('sim-')
      ? accessToken
      : '';

    if (tokenToRevoke) {
      try {
        const revokeRes = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }
        );

        if (revokeRes.ok) {
          revoked = true;
          console.log(`[Google Disconnect] OAuth token successfully revoked with Google for company ${companyId}`);
        } else {
          const errText = await revokeRes.text().catch(() => '');
          revocationError = `Google revocation returned status ${revokeRes.status}: ${errText}`;
          console.warn(`[Google Disconnect] Token revocation warning for company ${companyId} (will still purge locally): ${revocationError}`);
        }
      } catch (netErr) {
        revocationError = `Network error contacting Google revocation endpoint: ${(netErr as Error).message}`;
        console.warn(`[Google Disconnect] Network error revoking token for company ${companyId}:`, revocationError);
      }
    }
  }

  // 3. Selective Metadata Cleanup:
  // Purge sensitive tokens while preserving approvalQueue, processedEmailIds, and operational history
  const preservedMetadata = { ...currentMeta };
  delete preservedMetadata.encryptedAccessToken;
  delete preservedMetadata.encryptedRefreshToken;
  delete preservedMetadata.tokenExpiry;

  const updatedMetadata: Record<string, unknown> = {
    ...preservedMetadata,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiry: null,
    watchStatus: 'stopped',
    watchStoppedAt: new Date().toISOString(),
    disconnectedAt: new Date().toISOString(),
    reauthReason: null,
  };

  // 4. Update AutomationConnection in database
  await prisma.automationConnection.update({
    where: { id: connection.id },
    data: {
      status: ConnectionStatus.disconnected,
      disconnectedAt: new Date(),
      metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
    },
  });

  // 5. Record safe audit log event
  try {
    await prisma.automationQuotaAuditLog.create({
      data: {
        companyId,
        automationType: AutomationType.email,
        action: 'GOOGLE_MAILBOX_DISCONNECTED',
        details: {
          provider: 'google',
          watchStopped,
          revoked,
          revocationError: revocationError || null,
          disconnectedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (auditErr) {
    console.warn('[Google Disconnect] Failed to record audit log:', (auditErr as Error).message);
  }

  console.log(`[Google Disconnect] Completed disconnection for company ${companyId} (revoked: ${revoked}, watchStopped: ${watchStopped})`);

  return {
    disconnected: true,
    message: 'Google mailbox disconnected and credentials purged successfully.',
    revoked,
    watchStopped,
    revocationError,
  };
}

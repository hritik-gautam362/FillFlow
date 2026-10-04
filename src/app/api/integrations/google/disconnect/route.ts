import { NextRequest } from 'next/server';
import { requireCompanyAuth } from '@/lib/auth/session';
import { getAutomationConnection, disconnectAutomation } from '@/lib/services/automationConnectionService';
import { AutomationType } from '@prisma/client';
import { decryptToken } from '@/lib/security/encryption';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/google/disconnect
 * Safely revokes Google OAuth tokens and marks the company's email automation as disconnected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = body.companyId;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Enforce tenant authorization
    await requireCompanyAuth(companyId, request);

    const connection = await getAutomationConnection(companyId, AutomationType.email);

    if (connection.provider === 'google') {
      // 1. Cleanly stop Gmail push notification watch before token revocation
      try {
        const { stopGmailWatch } = await import('@/lib/services/email/gmailWatchService');
        await stopGmailWatch(companyId);
      } catch (watchStopErr) {
        console.warn('[Google Disconnect] Non-critical error stopping watch:', (watchStopErr as Error).message);
      }

      const metadata = (connection.metadata as Record<string, unknown>) || {};
      const encryptedAccessToken = metadata.encryptedAccessToken as string | undefined;

      // Attempt token revocation with Google (non-blocking if already invalid)
      if (encryptedAccessToken) {
        try {
          const accessToken = decryptToken(encryptedAccessToken);
          if (accessToken && !accessToken.startsWith('sim-')) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }).catch(() => null);
          }
        } catch {
          // Ignore decryption failures during disconnect
        }
      }
    }

    // Mark as disconnected
    await disconnectAutomation(companyId, AutomationType.email);

    return successResponse({ disconnected: true, message: 'Google connection disconnected successfully.' }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

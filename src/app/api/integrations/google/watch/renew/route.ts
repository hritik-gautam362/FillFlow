import { NextRequest } from 'next/server';
import { renewGmailWatchIfNeeded, renewAllExpiringWatches } from '@/lib/services/email/gmailWatchService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronAuth(request: NextRequest): { authorized: boolean; error?: string; status?: number } {
  const cronSecret = process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!cronSecret) {
    if (isProduction) {
      console.error('[Gmail Watch Renewal] CRITICAL: CRON_SECRET is not configured in production. Failing closed.');
      return { authorized: false, error: 'Unauthorized: CRON_SECRET is required in production.', status: 401 };
    }
    // In local development / test mode, allow unauthenticated access only if CRON_SECRET is not configured
    return { authorized: true };
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const customSecret = request.headers.get('x-cron-secret');

  if (bearer !== cronSecret && customSecret !== cronSecret) {
    return { authorized: false, error: 'Unauthorized: Invalid cron secret.', status: 401 };
  }

  return { authorized: true };
}

/**
 * POST /api/integrations/google/watch/renew
 * Scheduled or on-demand renewal endpoint for Gmail push notification watches.
 * Can be invoked by external cron jobs (e.g. Vercel Cron, Google Cloud Scheduler)
 * or triggered per company.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = verifyCronAuth(request);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const body = await request.json().catch(() => ({}));
    const companyId = body.companyId;

    if (companyId) {
      const result = await renewGmailWatchIfNeeded(companyId, body.thresholdHours || 48);
      return successResponse(result, 200);
    }

    // Otherwise renew all expiring watches across all companies
    const scanResult = await renewAllExpiringWatches(body.thresholdHours || 48);
    return successResponse(scanResult, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/integrations/google/watch/renew
 * Quick health-check or cron ping for watch renewal.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronAuth(request);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const scanResult = await renewAllExpiringWatches(48);
    return successResponse(scanResult, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

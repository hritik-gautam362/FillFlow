import { NextRequest } from 'next/server';
import { requireCompanyAuth } from '@/lib/auth/session';
import { disconnectGoogleIntegration } from '@/lib/services/email/googleDisconnectService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/google/disconnect
 * Safely revokes Google OAuth tokens and marks the company's email automation as disconnected,
 * while selectively purging encrypted tokens from metadata and stopping Pub/Sub watches.
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

    const result = await disconnectGoogleIntegration(companyId);

    return successResponse(result, 200);
  } catch (error) {
    return handleApiError(error);
  }
}


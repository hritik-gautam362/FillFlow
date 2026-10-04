import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  getAutomationConnection,
  updateAutomationConnection,
  disconnectAutomation,
  ConnectionStatus,
} from '@/lib/services/automationConnectionService';
import { isAutomationEnabled } from '@/lib/services/automationAccessService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { AutomationType } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string; type: string }>;
}

const VALID_TYPES = new Set<string>(['web', 'whatsapp', 'email']);

/**
 * GET /api/companies/[id]/automations/[type]/connection
 * Retrieve connection status for a specific automation module.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Verify authenticated user belongs to this company
    await requireCompanyAuth(companyId, request);

    const normalizedType = rawType.toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return errorResponse(`Invalid automation type '${rawType}'.`, 400);
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const automationType = normalizedType as AutomationType;
    const accessEnabled = await isAutomationEnabled(companyId, automationType);
    const connection = await getAutomationConnection(companyId, automationType);

    // Sanitize metadata to never expose external client secrets or tokens
    const { getGooglePubSubWebhookUrl, getGmailPubSubTopic } = await import('@/lib/services/email/gmailWatchService');

    const sanitizedConnection = {
      ...connection,
      provider: connection.provider || null,
      domain: automationType === AutomationType.email ? process.env.MAILGUN_DOMAIN || 'mg.apexbyte.io' : undefined,
      googlePubSubWebhookUrl: automationType === AutomationType.email ? getGooglePubSubWebhookUrl() : undefined,
      googlePubSubTopic: automationType === AutomationType.email ? getGmailPubSubTopic() : undefined,
      accessEnabled,
      metadata: connection.metadata
        ? Object.fromEntries(
            Object.entries(connection.metadata as Record<string, unknown>).filter(
              ([k]) => !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token')
            )
          )
        : null,
    };

    const response = successResponse(sanitizedConnection, 200);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/companies/[id]/automations/[type]/connection
 * Prepare / establish connection for an automation channel.
 * Rejects if the automation access is LOCKED.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Verify company authorization
    await requireCompanyAuth(companyId, request);

    const normalizedType = rawType.toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return errorResponse(`Invalid automation type '${rawType}'.`, 400);
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const automationType = normalizedType as AutomationType;

    // Strict check: Access must be ACTIVE
    const accessEnabled = await isAutomationEnabled(companyId, automationType);
    if (!accessEnabled) {
      return errorResponse(
        `Cannot connect: ${automationType} automation is locked. Contact administrator to activate access.`,
        403
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      status = ConnectionStatus.connected,
      provider,
      externalId,
      displayName,
      metadata,
    } = body;

    const connection = await updateAutomationConnection(companyId, automationType, {
      status: status as ConnectionStatus,
      provider,
      externalId,
      displayName,
      metadata,
    });

    return successResponse(connection, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/companies/[id]/automations/[type]/connection
 * Disconnect an active automation connection.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Verify company authorization
    await requireCompanyAuth(companyId, request);

    const normalizedType = rawType.toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return errorResponse(`Invalid automation type '${rawType}'.`, 400);
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const connection = await disconnectAutomation(companyId, normalizedType as AutomationType);

    return successResponse(connection, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  AutomationType,
  activateAutomation,
  deactivateAutomation,
  getAutomationAccess,
} from '@/lib/services/automationAccessService';
import {
  getEmailQuota,
  updateMonthlyLimit,
  setAdminAutomationDisabled,
} from '@/lib/services/emailQuotaService';
import { requireCompanyAuth, requirePlatformAdmin } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

interface RouteContext {
  params: Promise<{ id: string; type: string }>;
}

const VALID_TYPES = new Set<string>(['web', 'whatsapp', 'email']);

/**
 * PATCH /api/companies/[id]/automations/[type]
 * Platform Admin ONLY activation / deactivation of a company automation.
 *
 * Request body:
 * {
 *   "enabled": boolean,
 *   "expiresAt"?: string (ISO date string) | null
 * }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Platform admin security enforcement: only platform_admin can activate/deactivate
    await requirePlatformAdmin(request);

    const normalizedType = rawType.toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return errorResponse(
        `Invalid automation type '${rawType}'. Supported types: web, whatsapp, email.`,
        400
      );
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.enabled !== 'boolean') {
      return errorResponse(
        'Request body must include boolean "enabled" field.',
        400
      );
    }

    const automationType = normalizedType as AutomationType;
    let expiresAt: Date | null | undefined = undefined;

    if (body.expiresAt) {
      const parsedDate = new Date(body.expiresAt);
      if (isNaN(parsedDate.getTime())) {
        return errorResponse('Invalid expiresAt date format. Must be an ISO date string.', 400);
      }
      expiresAt = parsedDate;
    } else if (body.expiresAt === null) {
      expiresAt = null;
    }

    let updatedRecord;
    if (automationType === AutomationType.email) {
      if (typeof body.monthlyLimit === 'number') {
        await updateMonthlyLimit(companyId, body.monthlyLimit);
      }
      if (body.enabled) {
        await setAdminAutomationDisabled(companyId, false);
        updatedRecord = await activateAutomation(companyId, automationType, expiresAt);
      } else {
        await setAdminAutomationDisabled(companyId, true);
        updatedRecord = await deactivateAutomation(companyId, automationType);
      }
      const quota = await getEmailQuota(companyId);
      return successResponse({ ...updatedRecord, quota }, 200);
    } else {
      if (body.enabled) {
        updatedRecord = await activateAutomation(companyId, automationType, expiresAt);
      } else {
        updatedRecord = await deactivateAutomation(companyId, automationType);
      }
      return successResponse(updatedRecord, 200);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/companies/[id]/automations/[type]
 * Inspect specific automation access record.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Verify company authorization
    await requireCompanyAuth(companyId, request);

    const normalizedType = rawType.toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return errorResponse(
        `Invalid automation type '${rawType}'. Supported types: web, whatsapp, email.`,
        400
      );
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const access = await getAutomationAccess(companyId, normalizedType as AutomationType);

    if (normalizedType === 'email') {
      const quota = await getEmailQuota(companyId);
      return successResponse({ ...access, quota }, 200);
    }

    return successResponse(access, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

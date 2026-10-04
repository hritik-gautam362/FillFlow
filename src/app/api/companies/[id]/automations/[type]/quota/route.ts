import { NextRequest } from 'next/server';
import { requireCompanyAuth, requirePlatformAdmin } from '@/lib/auth/session';
import {
  getEmailQuota,
  updateMonthlyLimit,
  setAdminAutomationDisabled,
  resetCompanyEmailQuota,
  getQuotaAuditLogs,
} from '@/lib/services/emailQuotaService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

interface RouteContext {
  params: Promise<{ id: string; type: string }>;
}

/**
 * GET /api/companies/[id]/automations/[type]/quota
 * Retrieves quota details, status, and audit logs.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    if (rawType.toLowerCase() !== 'email') {
      return errorResponse('Quota tracking is currently only supported for email automation.', 400);
    }

    // Company user or platform admin can view their quota
    await requireCompanyAuth(companyId, request);

    const quotaInfo = await getEmailQuota(companyId);
    const auditLogs = await getQuotaAuditLogs(companyId, 10);

    return successResponse(
      {
        ...quotaInfo,
        auditLogs,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/companies/[id]/automations/[type]/quota
 * Platform admin only: change monthly limit, enable/disable, or reset quota.
 *
 * Body options:
 * - { monthlyLimit: number }
 * - { adminDisabled: boolean }
 * - { action: 'reset' }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId, type: rawType } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    if (rawType.toLowerCase() !== 'email') {
      return errorResponse('Quota tracking is currently only supported for email automation.', 400);
    }

    // Platform admin security check
    await requirePlatformAdmin(request);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid JSON body.', 400);
    }

    let updatedQuota;

    if (typeof body.monthlyLimit === 'number') {
      if (!Number.isInteger(body.monthlyLimit) || body.monthlyLimit < 0) {
        return errorResponse('Monthly limit must be an integer greater than or equal to 0.', 400);
      }
      updatedQuota = await updateMonthlyLimit(companyId, body.monthlyLimit);
    } else if (typeof body.adminDisabled === 'boolean') {
      updatedQuota = await setAdminAutomationDisabled(companyId, body.adminDisabled);
    } else if (body.action === 'reset') {
      updatedQuota = await resetCompanyEmailQuota(companyId, true);
    } else {
      return errorResponse('Specify monthlyLimit, adminDisabled, or action: "reset".', 400);
    }

    const auditLogs = await getQuotaAuditLogs(companyId, 10);

    return successResponse(
      {
        ...updatedQuota,
        auditLogs,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}

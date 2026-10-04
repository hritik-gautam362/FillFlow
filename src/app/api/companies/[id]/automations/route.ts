import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { getCompanyAutomations } from '@/lib/services/automationAccessService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/companies/[id]/automations
 * Returns the access/lock status of all platform automations for the company.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: companyId } = await context.params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Verify company authorization
    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const automations = await getCompanyAutomations(companyId);

    return successResponse(automations, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

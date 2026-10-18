import { NextRequest } from 'next/server';
import { requireCompanyAuth } from '@/lib/auth/session';
import { UserRole } from '@prisma/client';
import { purgeCompanyGmailData, deleteCompanyAccount } from '@/lib/services/dataDeletionService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/companies/[id]/data-deletion
 *
 * Authenticated endpoint for requesting user data deletion:
 * - action: 'purge_gmail_data' -> purges all Gmail credentials, leads, and inquiry history
 * - action: 'delete_company_account' -> permanently deletes company workspace and all cascaded data
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // 1. Enforce tenant authorization
    const authContext = await requireCompanyAuth(companyId, request);

    // 2. Enforce admin role (only company_admin or platform_admin can delete data)
    if (authContext.user.role !== UserRole.company_admin && authContext.user.role !== UserRole.platform_admin) {
      return errorResponse('Access denied: Company administrator privileges required for data deletion.', 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const confirmation = body.confirmation;

    if (action === 'purge_gmail_data') {
      const result = await purgeCompanyGmailData(companyId, authContext.user.id);
      return successResponse(result, 200);
    }

    if (action === 'delete_company_account') {
      if (!confirmation) {
        return errorResponse('Confirmation is required to delete company account.', 400);
      }

      const result = await deleteCompanyAccount(companyId, confirmation, authContext.user.id);
      return successResponse(result, 200);
    }

    return errorResponse(
      'Invalid action. Supported actions: "purge_gmail_data" or "delete_company_account".',
      400
    );
  } catch (error) {
    return handleApiError(error);
  }
}

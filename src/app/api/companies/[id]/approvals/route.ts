import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { listApprovalItems } from '@/lib/services/aiApprovalService';
import { ApprovalStatus } from '@/lib/ai/approvalTypes';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!isNonEmptyString(companyId)) {
      return errorResponse('Company ID parameter is required.', 400);
    }

    // Verify company authorization
    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') as ApprovalStatus | 'ALL' | null;

    const items = await listApprovalItems(companyId, statusParam || undefined);
    return successResponse(items, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { reopenApprovalItem } from '@/lib/services/aiApprovalService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId, itemId } = await params;

    if (!isNonEmptyString(companyId) || !isNonEmptyString(itemId)) {
      return errorResponse('Company ID and Item ID parameters are required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const item = await reopenApprovalItem(companyId, itemId);
    return successResponse(item, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

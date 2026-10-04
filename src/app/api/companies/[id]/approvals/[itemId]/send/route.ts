import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { approveAndSendItem } from '@/lib/services/aiApprovalService';
import { requireCompanyAuth, getSessionContext } from '@/lib/auth/session';
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

    const session = await getSessionContext(request);
    const userEmail = session?.user?.email || 'company_admin';

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    let finalDraft: string | undefined;
    try {
      const body = await request.json();
      finalDraft = body.finalDraft;
    } catch {
      // Empty body is acceptable; will send currentDraft
    }

    const result = await approveAndSendItem(companyId, itemId, {
      finalDraft,
      userEmail,
    });

    if (!result.success) {
      return errorResponse(result.error || 'Failed to approve and send email', 400);
    }

    return successResponse(result, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

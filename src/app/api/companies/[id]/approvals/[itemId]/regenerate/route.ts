import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { regenerateApprovalDraft } from '@/lib/services/aiApprovalService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';
import { DraftVariationStyle } from '@/lib/ai/approvalTypes';

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

    const body = await request.json();
    const variationStyle: DraftVariationStyle = body.variationStyle || 'professional';
    const instructions: string | undefined = body.instructions;

    const result = await regenerateApprovalDraft(companyId, itemId, variationStyle, instructions);

    if (!result.success) {
      return errorResponse(result.error || 'Failed to regenerate draft variation', 400);
    }

    return successResponse(result, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

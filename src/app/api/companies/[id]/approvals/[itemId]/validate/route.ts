import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import { getApprovalItem, validateEditedDraftText } from '@/lib/services/aiApprovalService';
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

    const item = await getApprovalItem(companyId, itemId);
    if (!item) {
      return errorResponse(`Approval item "${itemId}" not found or unauthorized.`, 404);
    }

    const body = await request.json();
    const draftText = body.draftText as string;

    if (typeof draftText !== 'string' || draftText.trim().length === 0) {
      return errorResponse('draftText is required for validation.', 400);
    }

    const validation = validateEditedDraftText(draftText, item.latestCustomerMessage, {
      currentTurnRequirements: item.currentTurnRequirements,
      restrictedTopics: item.restrictedTopics,
      commercialTermsDetected: item.commercialTermsDetected,
      updatedOverrides: item.updatedOverrides,
      companyInstruction: item.companyInstruction,
    });
    return successResponse(validation, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  getApprovalItem,
  selectDraftVariation,
  updateApprovalDraft,
  reopenApprovalItem,
  generateDraftsFromInstruction,
} from '@/lib/services/aiApprovalService';
import { DraftVariationStyle } from '@/lib/ai/approvalTypes';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    return successResponse(item, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId, itemId } = await params;

    if (!isNonEmptyString(companyId) || !isNonEmptyString(itemId)) {
      return errorResponse('Company ID and Item ID parameters are required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const body = await request.json();
    const action = body.action as 'select_variation' | 'edit_draft' | 'reopen' | 'generate_reply';

    if (action === 'select_variation') {
      const variation = body.variation as DraftVariationStyle;
      if (!variation || !['professional', 'relationship', 'warm', 'concise'].includes(variation)) {
        return errorResponse('Invalid draft variation style. Must be professional, relationship, warm, or concise.', 400);
      }
      const updated = await selectDraftVariation(companyId, itemId, variation);
      return successResponse(updated, 200);
    }

    if (action === 'edit_draft') {
      const editedText = body.editedText as string;
      if (typeof editedText !== 'string' || editedText.trim().length === 0) {
        return errorResponse('editedText must be a non-empty string.', 400);
      }
      const updated = await updateApprovalDraft(companyId, itemId, editedText);
      return successResponse(updated, 200);
    }

    if (action === 'reopen') {
      const updated = await reopenApprovalItem(companyId, itemId);
      return successResponse(updated, 200);
    }

    if (action === 'generate_reply') {
      const instruction = body.instruction || body.companyInstruction;
      if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
        return errorResponse('instruction must be a non-empty string.', 400);
      }
      const result = await generateDraftsFromInstruction(companyId, itemId, instruction.trim());
      if (!result.success) {
        return errorResponse(result.error || 'Failed to generate drafts from instruction', 400);
      }
      return successResponse(result, 200);
    }

    return errorResponse('Invalid action. Must be "select_variation", "edit_draft", "reopen", or "generate_reply".', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  getTeachAiSuggestions,
  acceptTeachAiSuggestion,
  dismissTeachAiSuggestion,
  addCompanyKnowledge,
} from '@/lib/services/companyPermissionService';
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

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const suggestions = await getTeachAiSuggestions(companyId);
    return successResponse(suggestions, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!isNonEmptyString(companyId)) {
      return errorResponse('Company ID parameter is required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const body = await request.json();
    const { action, suggestionId, customEdits, title, content, category } = body;

    if (action === 'create' || action === 'save_pending') {
      if (!isNonEmptyString(content)) {
        return errorResponse('content is required when creating knowledge.', 400);
      }
      const newItem = await addCompanyKnowledge(companyId, {
        title: title || 'Approved Decision Knowledge',
        content,
        category: category || 'commercial_policies',
        verified: false,
        status: 'PENDING_REVIEW',
        source: 'AI_SUGGESTION',
      });
      return successResponse({ created: true, item: newItem }, 201);
    }

    if (!isNonEmptyString(suggestionId)) {
      return errorResponse('suggestionId is required.', 400);
    }

    if (action === 'accept') {
      const verifiedItem = await acceptTeachAiSuggestion(companyId, suggestionId, customEdits);
      if (!verifiedItem) {
        return errorResponse(`Suggestion "${suggestionId}" not found for company.`, 404);
      }
      return successResponse({ accepted: true, item: verifiedItem }, 200);
    }

    if (action === 'dismiss') {
      const dismissed = await dismissTeachAiSuggestion(companyId, suggestionId);
      if (!dismissed) {
        return errorResponse(`Suggestion "${suggestionId}" not found for company.`, 404);
      }
      return successResponse({ dismissed: true }, 200);
    }

    return errorResponse('Invalid action. Supported actions: "create", "accept" or "dismiss".', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

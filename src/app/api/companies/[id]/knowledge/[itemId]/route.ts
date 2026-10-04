import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  updateCompanyKnowledge,
  deleteCompanyKnowledge,
  verifyCompanyKnowledge,
} from '@/lib/services/companyPermissionService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId, itemId } = await params;

    if (!isNonEmptyString(companyId) || !isNonEmptyString(itemId)) {
      return errorResponse('Company ID and Item ID are required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const body = await request.json();

    if (body.action === 'verify') {
      const verifiedItem = await verifyCompanyKnowledge(companyId, itemId, body.verifiedBy);
      if (!verifiedItem) {
        return errorResponse(`Knowledge item "${itemId}" not found for company.`, 404);
      }
      return successResponse(verifiedItem, 200);
    }

    const updated = await updateCompanyKnowledge(companyId, itemId, body);
    if (!updated) {
      return errorResponse(`Knowledge item "${itemId}" not found for company.`, 404);
    }

    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId, itemId } = await params;

    if (!isNonEmptyString(companyId) || !isNonEmptyString(itemId)) {
      return errorResponse('Company ID and Item ID are required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const deleted = await deleteCompanyKnowledge(companyId, itemId);
    if (!deleted) {
      return errorResponse(`Knowledge item "${itemId}" not found for company.`, 404);
    }

    return successResponse({ deleted: true }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

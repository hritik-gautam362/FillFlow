import { NextRequest } from 'next/server';
import { updateProjectFeature, deleteProjectFeature } from '@/lib/services/featureService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidComplexity } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: featureId } = await params;

    if (!isNonEmptyString(featureId)) {
      return errorResponse('Feature ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const body = await request.json();
    const { name, description, complexity } = body;

    if (name !== undefined && !isNonEmptyString(name)) {
      return errorResponse('Feature name cannot be empty.', 400);
    }
    if (description !== undefined && !isNonEmptyString(description)) {
      return errorResponse('Feature description cannot be empty.', 400);
    }
    if (complexity !== undefined && !isValidComplexity(complexity)) {
      return errorResponse(`Invalid complexity "${complexity}". Allowed values: Low, Medium, High.`, 400);
    }

    const updated = await updateProjectFeature(
      featureId,
      { name, description, complexity },
      companyId
    );

    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: featureId } = await params;

    if (!isNonEmptyString(featureId)) {
      return errorResponse('Feature ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const deleted = await deleteProjectFeature(featureId, companyId);
    return successResponse(deleted, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

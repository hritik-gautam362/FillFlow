import { NextRequest } from 'next/server';
import { createProjectFeature } from '@/lib/services/featureService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidComplexity } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: briefId } = await params;
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;

    if (!isNonEmptyString(briefId)) {
      return errorResponse('Brief ID is required.', 400);
    }

    const body = await request.json();
    const { name, description, complexity } = body;

    if (!isNonEmptyString(name)) {
      return errorResponse('Feature name is required.', 400);
    }

    if (!isNonEmptyString(description)) {
      return errorResponse('Feature description is required.', 400);
    }

    if (complexity !== undefined && !isValidComplexity(complexity)) {
      return errorResponse(`Invalid complexity "${complexity}". Allowed values: Low, Medium, High.`, 400);
    }

    const feature = await createProjectFeature(
      {
        briefId,
        name,
        description,
        complexity,
      },
      companyId
    );

    return successResponse(feature, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

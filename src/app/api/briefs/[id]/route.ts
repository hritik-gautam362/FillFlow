import { NextRequest } from 'next/server';
import { getProjectBriefById, updateProjectBrief } from '@/lib/services/briefService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: briefId } = await params;

    if (!isNonEmptyString(briefId)) {
      return errorResponse('Brief ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const brief = await getProjectBriefById(briefId, companyId);
    if (!brief) {
      return errorResponse(`Project brief with id "${briefId}" not found.`, 404);
    }

    return successResponse(brief, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: briefId } = await params;

    if (!isNonEmptyString(briefId)) {
      return errorResponse('Brief ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const body = await request.json();
    const {
      title,
      summary,
      projectType,
      targetAudience,
      requiredTechStack,
      budgetRange,
      estimatedDuration,
      keyRisks,
      rawConversationLength,
      structuredJson,
    } = body;

    const updated = await updateProjectBrief(
      briefId,
      {
        title,
        summary,
        projectType,
        targetAudience,
        requiredTechStack,
        budgetRange,
        estimatedDuration,
        keyRisks,
        rawConversationLength,
        structuredJson,
      },
      companyId
    );

    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest } from 'next/server';
import {
  createProjectBrief,
  getProjectBriefByLeadId,
  updateProjectBrief,
} from '@/lib/services/briefService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidComplexity } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID is required.', 400);
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
      features,
    } = body;

    // Validation
    if (!isNonEmptyString(title)) return errorResponse('title is required.', 400);
    if (!isNonEmptyString(summary)) return errorResponse('summary is required.', 400);
    if (!isNonEmptyString(projectType)) return errorResponse('projectType is required.', 400);
    if (!isNonEmptyString(targetAudience)) return errorResponse('targetAudience is required.', 400);
    if (!Array.isArray(requiredTechStack)) return errorResponse('requiredTechStack must be an array of strings.', 400);
    if (!isNonEmptyString(budgetRange)) return errorResponse('budgetRange is required.', 400);
    if (!isNonEmptyString(estimatedDuration)) return errorResponse('estimatedDuration is required.', 400);
    if (structuredJson === undefined || structuredJson === null) return errorResponse('structuredJson object is required.', 400);

    if (features && Array.isArray(features)) {
      for (const feat of features) {
        if (!isNonEmptyString(feat.name) || !isNonEmptyString(feat.description)) {
          return errorResponse('Each feature must contain a valid name and description.', 400);
        }
        if (feat.complexity && !isValidComplexity(feat.complexity)) {
          return errorResponse(`Invalid feature complexity "${feat.complexity}". Allowed values: Low, Medium, High.`, 400);
        }
      }
    }

    const brief = await createProjectBrief(
      {
        leadId,
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
        features,
      },
      companyId
    );

    return successResponse(brief, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const brief = await getProjectBriefByLeadId(leadId, companyId);
    if (!brief) {
      return errorResponse(`Project brief for lead "${leadId}" was not found.`, 404);
    }

    return successResponse(brief, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const existingBrief = await getProjectBriefByLeadId(leadId, companyId);
    if (!existingBrief) {
      return errorResponse(`Project brief for lead "${leadId}" was not found.`, 404);
    }

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
      existingBrief.id,
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

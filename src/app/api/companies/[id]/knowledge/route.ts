import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  getCompanyKnowledge,
  addCompanyKnowledge,
} from '@/lib/services/companyPermissionService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';
import { CompanyKnowledgeCategory } from '@/lib/ai/permissionTypes';

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

    const items = await getCompanyKnowledge(companyId);
    return successResponse(items, 200);
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
    const { title, content, category, verified = true } = body;

    if (!isNonEmptyString(title) || !isNonEmptyString(content)) {
      return errorResponse('Knowledge title and content are required.', 400);
    }

    const validCategories: CompanyKnowledgeCategory[] = [
      'company',
      'services',
      'commercial',
      'partnerships',
      'communication',
    ];

    const safeCategory: CompanyKnowledgeCategory = validCategories.includes(category)
      ? category
      : 'company';

    const item = await addCompanyKnowledge(companyId, {
      title: title.trim(),
      content: content.trim(),
      category: safeCategory,
      verified: Boolean(verified),
      source: 'COMPANY',
    });

    return successResponse(item, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

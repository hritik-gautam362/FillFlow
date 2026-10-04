import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCompany } from '@/lib/services/companyService';
import { getSessionContext } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, logo, industry, teamSize } = body;

    if (!isNonEmptyString(name)) {
      return errorResponse('Company name is required and must be a non-empty string.', 400);
    }

    const company = await createCompany({
      name,
      logo,
      industry,
      teamSize,
    });

    return successResponse(company, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionContext(request);
    if (!session) {
      return errorResponse('Authentication required.', 401);
    }

    const { searchParams } = new URL(request.url);
    const nameParam = searchParams.get('name');

    // If no specific name requested or user is not platform_admin, return their authorized company
    if (!nameParam || session.user.role !== 'platform_admin') {
      return successResponse(session.company, 200);
    }

    // Platform admin can query by name
    const company = await prisma.company.findFirst({
      where: { name: nameParam },
    });

    if (!company) {
      return errorResponse(`Company with name "${nameParam}" not found.`, 404);
    }

    return successResponse(company, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

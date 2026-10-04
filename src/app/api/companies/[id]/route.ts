import { NextRequest } from 'next/server';
import { getCompanyById, updateCompany } from '@/lib/services/companyService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!isNonEmptyString(id)) {
      return errorResponse('Company ID is required.', 400);
    }

    // Server-side multi-tenant authorization
    await requireCompanyAuth(id, request);

    const company = await getCompanyById(id);
    if (!company) {
      return errorResponse(`Company with id "${id}" not found.`, 404);
    }

    return successResponse(company, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!isNonEmptyString(id)) {
      return errorResponse('Company ID is required.', 400);
    }

    // Server-side multi-tenant authorization
    await requireCompanyAuth(id, request);

    const body = await request.json();
    const {
      name,
      logo,
      industry,
      teamSize,
      website,
      phone,
      address,
      city,
      state,
      country,
      timezone,
      businessHours,
      communicationSettings,
      tone,
      responseDelay,
      signature,
      signatureEnabled,
      onboardingCompleted,
      onboardingStep,
      onboardingCompletedAt,
    } = body;

    if (name !== undefined && !isNonEmptyString(name)) {
      return errorResponse('Company name cannot be empty.', 400);
    }

    if (businessHours !== undefined && businessHours !== null && typeof businessHours !== 'object') {
      return errorResponse('Invalid business hours configuration.', 400);
    }

    if (communicationSettings !== undefined && communicationSettings !== null && typeof communicationSettings !== 'object') {
      return errorResponse('Invalid communication settings configuration.', 400);
    }

    if (onboardingStep !== undefined && (typeof onboardingStep !== 'number' || onboardingStep < 1 || onboardingStep > 7)) {
      return errorResponse('Invalid onboarding step (must be an integer between 1 and 7).', 400);
    }

    if (onboardingCompleted !== undefined && typeof onboardingCompleted !== 'boolean') {
      return errorResponse('Invalid onboardingCompleted value (must be boolean).', 400);
    }

    // If marked completed without explicit timestamp, default to now
    let resolvedCompletedAt = onboardingCompletedAt;
    if (onboardingCompleted === true && resolvedCompletedAt === undefined) {
      resolvedCompletedAt = new Date();
    }

    // Only permitted company fields are passed; platform controls & quotas are never accepted
    const updated = await updateCompany(id, {
      name,
      logo,
      industry,
      teamSize,
      website,
      phone,
      address,
      city,
      state,
      country,
      timezone,
      businessHours,
      communicationSettings,
      tone,
      responseDelay,
      signature,
      signatureEnabled,
      onboardingCompleted,
      onboardingStep,
      onboardingCompletedAt: resolvedCompletedAt,
    });
    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

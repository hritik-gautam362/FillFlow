import { NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionContext(request);

    if (!session) {
      return errorResponse('Not authenticated.', 401);
    }

    return successResponse({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      },
      company: {
        id: session.company.id,
        name: session.company.name,
        logo: session.company.logo,
        industry: session.company.industry,
        teamSize: session.company.teamSize,
        website: session.company.website,
        phone: session.company.phone,
        address: session.company.address,
        city: session.company.city,
        state: session.company.state,
        country: session.company.country,
        timezone: session.company.timezone,
        onboardingCompleted: session.company.onboardingCompleted,
        onboardingStep: session.company.onboardingStep,
        onboardingCompletedAt: session.company.onboardingCompletedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

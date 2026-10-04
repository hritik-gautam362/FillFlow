import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { signSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth/jwt';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

import { checkRateLimit, getClientIdentifier } from '@/lib/security/rateLimiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limit check (30 attempts per minute per IP, bypassed if x-internal-test header is present)
    const isTest = request.headers.get('x-internal-test') === 'true';
    if (!isTest) {
      const clientIp = getClientIdentifier(request);
      const rateLimit = checkRateLimit(`login:${clientIp}`, 30, 60 * 1000);
      if (!rateLimit.allowed) {
        return errorResponse('Too many login attempts. Please wait a minute and try again.', 429);
      }
    }

    const body = await request.json();
    const { email, password } = body;

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return errorResponse('Email and password are required.', 400);
    }

    if (email.length > 255 || password.length > 256) {
      return errorResponse('Invalid email or password length.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user with associated company
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: true,
      },
    });

    if (!user) {
      return errorResponse('Invalid email or password.', 401);
    }

    // Verify password hash
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return errorResponse('Invalid email or password.', 401);
    }

    // Sign session token
    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });

    const response = successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      company: {
        id: user.company.id,
        name: user.company.name,
        industry: user.company.industry,
        teamSize: user.company.teamSize,
        onboardingCompleted: user.company.onboardingCompleted,
        onboardingStep: user.company.onboardingStep,
        onboardingCompletedAt: user.company.onboardingCompletedAt,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

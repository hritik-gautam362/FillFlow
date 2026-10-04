import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { signSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth/jwt';
import { ensureDefaultAutomationAccess } from '@/lib/services/automationAccessService';
import { ensureDefaultCompanyPermissionConfig } from '@/lib/services/companyPermissionService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidEmail } from '@/lib/validators';
import { UserRole } from '@prisma/client';

import { checkRateLimit, getClientIdentifier } from '@/lib/security/rateLimiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limit check (20 signups per minute per IP, bypassed if x-internal-test header is present)
    const isTest = request.headers.get('x-internal-test') === 'true';
    if (!isTest) {
      const clientIp = getClientIdentifier(request);
      const rateLimit = checkRateLimit(`signup:${clientIp}`, 20, 60 * 1000);
      if (!rateLimit.allowed) {
        return errorResponse('Too many registration requests. Please wait a minute and try again.', 429);
      }
    }

    const body = await request.json();
    const { name, email, password, companyName, industry, teamSize } = body;

    // Validate inputs
    if (!isNonEmptyString(name) || name.length > 200) {
      return errorResponse('Full name is required and cannot exceed 200 characters.', 400);
    }
    if (!isNonEmptyString(email) || !isValidEmail(email) || email.length > 255) {
      return errorResponse('A valid email address is required (max 255 characters).', 400);
    }
    if (!isNonEmptyString(password) || password.length < 6 || password.length > 128) {
      return errorResponse('Password must be between 6 and 128 characters.', 400);
    }
    if (!isNonEmptyString(companyName) || companyName.length > 200) {
      return errorResponse('Company/Agency name is required and cannot exceed 200 characters.', 400);
    }
    if (industry && (typeof industry !== 'string' || industry.length > 100)) {
      return errorResponse('Industry cannot exceed 100 characters.', 400);
    }
    if (teamSize && (typeof teamSize !== 'string' || teamSize.length > 50)) {
      return errorResponse('Team size cannot exceed 50 characters.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already registered
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return errorResponse('An account with this email address already exists.', 409);
    }

    // Hash password securely
    const passwordHash = await hashPassword(password);

    // 1. Create Company/Workspace with onboarding state initialized
    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        industry: industry?.trim() || 'Software Consulting',
        teamSize: teamSize?.trim() || '1-10',
        onboardingCompleted: false,
        onboardingStep: 1,
      },
    });

    // 2. Create User associated with company as company_admin
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: UserRole.company_admin,
        companyId: company.id,
      },
    });

    // 3. Initialize default automation access (Web = ACTIVE, WhatsApp = LOCKED, Email = ACTIVE)
    await ensureDefaultAutomationAccess(company.id);

    // 3b. Initialize default persistent AI permissions in PostgreSQL
    await ensureDefaultCompanyPermissionConfig(company.id).catch((err) =>
      console.warn('[Signup] Non-critical error initializing default AI permissions:', err)
    );

    // 4. Issue secure JWT session token
    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: company.id,
    });

    // 5. Set HTTP-only session cookie
    const response = successResponse(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        company: {
          id: company.id,
          name: company.name,
          industry: company.industry,
          teamSize: company.teamSize,
          onboardingCompleted: company.onboardingCompleted,
          onboardingStep: company.onboardingStep,
        },
      },
      201
    );

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

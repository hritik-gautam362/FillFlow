import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { User, Company, UserRole } from '@prisma/client';
import { AUTH_COOKIE_NAME, verifySessionToken } from './jwt';

export interface AuthenticatedContext {
  user: User;
  company: Company;
}

/**
 * Extracts and verifies the session token from cookies or Authorization header.
 */
export async function getSessionContext(request?: NextRequest): Promise<AuthenticatedContext | null> {
  let token: string | undefined;

  if (request) {
    // 1. Check HTTP-only cookie in NextRequest
    token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

    // 2. Check Authorization Bearer header if cookie is absent
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }
  }

  // 3. Fall back to Next.js cookies() helper if request is not passed or token was not found
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    } catch {
      // Cookies not accessible in this context
    }
  }

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  // Fetch full user and company from database to ensure up-to-date state
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    return null;
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
  });

  if (!company) {
    return null;
  }

  return { user, company };
}

/**
 * Enforces that a user must be authenticated.
 * Returns the AuthenticatedContext or throws an error.
 */
export async function requireAuth(request?: NextRequest): Promise<AuthenticatedContext> {
  const context = await getSessionContext(request);
  if (!context) {
    throw new AuthError('Authentication required. Please log in.', 401);
  }
  return context;
}

/**
 * Enforces that a user belongs to the specified companyId.
 * Platform admins are allowed across all companies.
 */
export async function requireCompanyAuth(
  companyId: string,
  request?: NextRequest
): Promise<AuthenticatedContext> {
  const context = await requireAuth(request);

  if (context.user.role === UserRole.platform_admin) {
    // Platform admin has universal administrative access
    return context;
  }

  if (context.user.companyId !== companyId) {
    throw new AuthError('Access denied: You do not have permission to access this company.', 403);
  }

  return context;
}

/**
 * Enforces platform_admin role.
 */
export async function requirePlatformAdmin(request?: NextRequest): Promise<AuthenticatedContext> {
  const context = await requireAuth(request);

  if (context.user.role !== UserRole.platform_admin) {
    throw new AuthError('Access denied: Platform administrator privileges required.', 403);
  }

  return context;
}

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

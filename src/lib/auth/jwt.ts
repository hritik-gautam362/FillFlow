import { SignJWT, jwtVerify } from 'jose';
import { UserRole } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable is missing in production.');
  }
  return new TextEncoder().encode(secret || 'apexbyte-secret-saas-platform-key-2026-secure');
}

const TOKEN_EXPIRY = '7d';

export const AUTH_COOKIE_NAME = 'auth_session';

/**
 * Sign a secure JWT session token containing user and company identity.
 */
export async function signSessionToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

/**
 * Verify and decode a JWT session token. Returns null if invalid or expired.
 */
export async function verifySessionToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload || !payload.userId || !payload.companyId) {
      return null;
    }
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      role: payload.role as UserRole,
      companyId: String(payload.companyId),
    };
  } catch {
    return null;
  }
}

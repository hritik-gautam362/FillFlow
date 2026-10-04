import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { SignJWT } from 'jose';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'apexbyte-secret-saas-platform-key-2026-secure';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

/**
 * GET /api/integrations/google/start
 * Initiates the Google OAuth 2.0 flow for Gmail / Google Workspace integration.
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAuth(request);
    const url = new URL(request.url);

    const requestedCompanyId = url.searchParams.get('companyId');
    const companyId =
      authContext.user.role === 'platform_admin' && requestedCompanyId
        ? requestedCompanyId
        : authContext.company.id;

    // Strict licensing check: Email automation must not be locked
    const accessCheck = await requireAutomationAccess(companyId, AutomationType.email);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accessCheck.message || 'Email automation is locked for this workspace.',
        },
        { status: 403 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/integrations/google/callback`;

    if (!clientId) {
      // If client ID is missing in development, allow simulated redirection for testing
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev && url.searchParams.get('simulated') === 'true') {
        const simulatedCallbackUrl = `${redirectUri}?code=simulated-auth-code&state=simulated-state`;
        return NextResponse.redirect(simulatedCallbackUrl);
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Google OAuth is not configured. Missing GOOGLE_CLIENT_ID environment variable.',
        },
        { status: 500 }
      );
    }

    const requestedReturnTo = url.searchParams.get('returnTo');
    const isValidReturnTo =
      requestedReturnTo &&
      requestedReturnTo.startsWith('/') &&
      !requestedReturnTo.startsWith('//') &&
      !requestedReturnTo.includes('\\') &&
      !requestedReturnTo.includes('\0');
    const returnTo = isValidReturnTo ? requestedReturnTo : undefined;

    // Generate cryptographically secure CSRF state token tied to company and user
    const stateNonce = crypto.randomBytes(16).toString('hex');
    const stateToken = await new SignJWT({
      companyId,
      userId: authContext.user.id,
      nonce: stateNonce,
      timestamp: Date.now(),
      returnTo,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m') // State expires in 10 minutes
      .sign(JWT_SECRET);

    // Build Google OAuth 2.0 authorization URL with required Gmail scopes
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Google OAuth Start] Initiating OAuth flow for company ${companyId}. Scopes requested: ${scopes.join(', ')}`);
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline'); // Required to obtain refresh_token
    authUrl.searchParams.set('prompt', 'consent select_account'); // Ensures refresh token is re-issued and account/consent prompted
    authUrl.searchParams.set('state', stateToken);

    if (url.searchParams.get('json') === 'true') {
      return NextResponse.json({
        success: true,
        data: { url: authUrl.toString() },
      });
    }

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[Google OAuth Start Error]:', error);
    const message = (error as Error).message || 'Failed to initiate Google OAuth';
    const status = (error as { statusCode?: number }).statusCode || 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

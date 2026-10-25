import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import { SignJWT } from 'jose';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable is missing in production.');
  }
  return new TextEncoder().encode(secret || 'apexbyte-secret-saas-platform-key-2026-secure');
}

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

    const rawClientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientId = rawClientId.trim().replace(/^["']|["']$/g, '');
    const rawRedirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/integrations/google/callback`;
    const redirectUri = rawRedirectUri.trim().replace(/^["']|["']$/g, '');

    const isSimulated =
      process.env.NODE_ENV !== 'production' &&
      (clientId === 'simulated' || !clientId || url.searchParams.get('simulated') === 'true');

    if (!clientId && !isSimulated) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google OAuth is not configured. Missing GOOGLE_CLIENT_ID environment variable.',
        },
        { status: 500 }
      );
    }

    if (!isSimulated && !/^\d+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
      console.error(`[Google OAuth Start] Malformed GOOGLE_CLIENT_ID: "${clientId.slice(0, 5)}..." (len: ${clientId.length})`);
      return NextResponse.json(
        {
          success: false,
          error: 'Google OAuth client ID is malformed or incomplete. Please ensure GOOGLE_CLIENT_ID is properly configured in your .env file.',
        },
        { status: 500 }
      );
    }

    if (isSimulated && url.searchParams.get('simulated') === 'true') {
      const simulatedCallbackUrl = `${redirectUri}?code=simulated-auth-code&state=simulated-state`;
      return NextResponse.redirect(simulatedCallbackUrl);
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
      .sign(getJwtSecret());

    // Build Google OAuth 2.0 authorization URL with minimum required Gmail scopes
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
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
    const requestedPrompt = url.searchParams.get('prompt');
    const promptValue =
      requestedPrompt === 'select_account' || requestedPrompt === 'consent'
        ? requestedPrompt
        : 'consent select_account';
    authUrl.searchParams.set('prompt', promptValue); // Ensures refresh token is re-issued and account/consent prompted
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

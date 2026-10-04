import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { updateAutomationConnection, ConnectionStatus } from '@/lib/services/automationConnectionService';
import { AutomationType } from '@prisma/client';
import { encryptToken } from '@/lib/security/encryption';
import { setupGmailWatch, getGmailPubSubTopic } from '@/lib/services/email/gmailWatchService';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'apexbyte-secret-saas-platform-key-2026-secure';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

interface OAuthStatePayload {
  companyId: string;
  userId: string;
  nonce: string;
  timestamp: number;
  returnTo?: string;
}

/**
 * GET /api/integrations/google/callback
 * Handles Google OAuth redirect callback, token exchange, and encrypted persistence.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  function sanitizeReturnTo(path?: string | null): string {
    const fallback = '/dashboard/automations/email';
    if (!path || typeof path !== 'string') return fallback;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('\0')) {
      return fallback;
    }
    try {
      const dummy = new URL(path, url.origin);
      if (dummy.origin !== url.origin) return fallback;
      return dummy.pathname + dummy.search;
    } catch {
      return fallback;
    }
  }

  const redirectError = (msg: string, returnPath?: string) => {
    const defaultTarget = sanitizeReturnTo(returnPath);
    const target = new URL(defaultTarget, url.origin);
    target.searchParams.set('google_error', msg);
    return NextResponse.redirect(target.toString());
  };

  if (oauthError) {
    console.error('[Google OAuth Callback] Received OAuth provider error:', oauthError);
    return redirectError(oauthError);
  }

  if (!code || !stateParam) {
    return redirectError('Missing required OAuth authorization code or state parameter.');
  }

  // 1. Verify and decode state token for CSRF protection and tenant resolution
  let statePayload: OAuthStatePayload;
  try {
    if (stateParam === 'simulated-state') {
      if (process.env.NODE_ENV === 'production') {
        return redirectError('Simulated OAuth state is strictly prohibited in production.');
      }
      statePayload = {
        companyId: url.searchParams.get('companyId') || 'simulated-company-id',
        userId: 'simulated-user-id',
        nonce: 'simulated-nonce',
        timestamp: Date.now(),
      };
    } else {
      const { payload } = await jwtVerify(stateParam, JWT_SECRET);
      statePayload = payload as unknown as OAuthStatePayload;
    }
  } catch (err) {
    console.error('[Google OAuth Callback] State token validation failed:', (err as Error).message);
    return redirectError('Invalid or expired OAuth state parameter. Please try connecting again.');
  }

  const { companyId } = statePayload;
  if (!companyId) {
    return redirectError('State token is missing required company identifier.');
  }

  // 2. Exchange authorization code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/integrations/google/callback`;

  let accessToken = '';
  let refreshToken = '';
  let expiresIn = 3600;
  let grantedScope = '';
  let googleEmail = '';
  let googleUserId = '';

  const isSimulated =
    process.env.NODE_ENV !== 'production' &&
    (code === 'simulated-auth-code' ||
      clientId === 'simulated' ||
      !clientId);

  if (!isSimulated && code === 'simulated-auth-code') {
    return redirectError('Simulated authorization codes are strictly prohibited in production.');
  }

  if (isSimulated) {
    accessToken = 'sim-google-access-token-' + Date.now();
    refreshToken = 'sim-google-refresh-token-' + Date.now();
    expiresIn = 3600;
    grantedScope = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify';
    googleEmail = 'connected-workspace@gmail.com';
    googleUserId = 'sim-google-user-12345';
  } else {
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error('[Google OAuth Callback] Token exchange failed:', errText);
        return redirectError('Failed to exchange authorization code with Google.');
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      expiresIn = Number(tokenData.expires_in) || 3600;
      grantedScope = tokenData.scope || '';

      // Inspect granted scopes safely without logging any tokens or secrets
      const grantedScopeList = (grantedScope || '').split(/\s+/).filter(Boolean);
      console.log('OAuth granted scopes:\n' + JSON.stringify(grantedScopeList, null, 2));

      // Retrieve primary email and user identifier from Google
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        googleEmail = userInfo.email || '';
        googleUserId = userInfo.id || '';
      } else {
        // Fallback to Gmail profile
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          googleEmail = profile.emailAddress || '';
          googleUserId = profile.emailAddress || '';
        }
      }
    } catch (netErr) {
      console.error('[Google OAuth Callback] Network error during token exchange:', netErr);
      return redirectError('Network error communicating with Google OAuth servers.');
    }
  }

  if (!googleEmail) {
    return redirectError('Could not determine connected Gmail address from Google account.');
  }

  // 3. Verify that the required modify permission is granted
  const grantedScopeList = (grantedScope || '').split(/\s+/).filter(Boolean);
  const hasModifyScope = grantedScopeList.includes('https://www.googleapis.com/auth/gmail.modify');
  const requiresReauth = !hasModifyScope;

  if (requiresReauth) {
    console.error(
      `[Google OAuth Callback] CRITICAL: Reauthorization did not grant 'https://www.googleapis.com/auth/gmail.modify'. Connection marked as requiring reauthorization.`
    );
  } else {
    console.log(
      `[Google OAuth Callback] All required scopes confirmed granted including gmail.modify.`
    );
  }

  // 4. Encrypt sensitive tokens using AES-256-GCM before saving to database
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : '';
  const tokenExpiry = Date.now() + expiresIn * 1000;

  // 5. Update AutomationConnection securely while preserving workspace context and refresh token
  try {
    const existingConn = await prisma.automationConnection.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: AutomationType.email,
        },
      },
    });
    const existingMeta = (existingConn?.metadata as Record<string, unknown>) || {};
    // If Google did not return a new refresh token on reauthorization, preserve existing one
    const finalEncryptedRefreshToken =
      encryptedRefreshToken || (existingMeta.encryptedRefreshToken as string) || '';

    const connectionStatus = requiresReauth ? ConnectionStatus.error : ConnectionStatus.connected;
    const reauthReason = requiresReauth
      ? "Account lacks 'https://www.googleapis.com/auth/gmail.modify' scope. Reauthorization required to grant modify permissions."
      : null;

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Google Connection] Storing mailbox for company ${companyId} (mailbox: ${googleEmail}, user: ${googleUserId}, status: ${connectionStatus})`
      );
    }

    await updateAutomationConnection(companyId, AutomationType.email, {
      status: connectionStatus,
      provider: 'google',
      externalId: googleUserId,
      displayName: googleEmail,
      metadata: {
        ...existingMeta,
        googleEmail,
        googleUserId,
        encryptedAccessToken,
        encryptedRefreshToken: finalEncryptedRefreshToken,
        tokenExpiry,
        scope: grantedScope,
        requiresReauth,
        reauthReason,
        watchStatus: requiresReauth ? 'error' : ((existingMeta.watchStatus as string) || 'pending'),
        watchError: requiresReauth ? reauthReason : ((existingMeta.watchError as string) || null),
        connectedAt: new Date().toISOString(),
      },
    });
  } catch (dbErr) {
    console.error('[Google OAuth Callback] DB update failed:', dbErr);
    return redirectError('Failed to record Google mailbox connection in database.');
  }

  // 6. Establish real-time Gmail push notification watch with Google Cloud Pub/Sub ONLY if modify scope is present
  if (!requiresReauth) {
    try {
      const pubsubTopic = getGmailPubSubTopic();
      const watchRes = await setupGmailWatch(companyId, pubsubTopic);
      if (!watchRes.success) {
        console.warn('[Google OAuth Callback] Gmail watch registration deferred or failed:', watchRes.error);
      } else {
        console.log('[Google OAuth Callback] Gmail watch established successfully with Pub/Sub topic:', pubsubTopic);
      }
    } catch (watchErr) {
      console.warn('[Google OAuth Callback] Pub/Sub watch registration exception:', (watchErr as Error).message);
    }
  }

  const defaultTarget = sanitizeReturnTo(statePayload.returnTo);
  const successUrl = new URL(defaultTarget, url.origin);
  if (requiresReauth) {
    successUrl.searchParams.set('reauth_required', 'true');
    successUrl.searchParams.set('missing_scope', 'gmail.modify');
  } else {
    successUrl.searchParams.set('google_connected', 'true');
  }
  return NextResponse.redirect(successUrl.toString());
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if the request's origin or referer matches the company's configured allowed domain.
 */
export function isOriginAllowed(
  requestOriginOrReferer: string | null,
  allowedDomain: string | null | undefined
): boolean {
  if (!allowedDomain || allowedDomain.trim() === '' || allowedDomain.trim() === '*') {
    return true;
  }

  if (!requestOriginOrReferer) {
    return true;
  }

  try {
    const raw = requestOriginOrReferer.startsWith('http')
      ? requestOriginOrReferer
      : `https://${requestOriginOrReferer}`;
    const reqUrl = new URL(raw);
    const reqHost = reqUrl.hostname.toLowerCase();

    // Permit localhost and 127.0.0.1 for development / local testing
    if (reqHost === 'localhost' || reqHost === '127.0.0.1') {
      return true;
    }

    let cleanAllowed = allowedDomain.trim().toLowerCase();
    if (cleanAllowed.startsWith('http://') || cleanAllowed.startsWith('https://')) {
      cleanAllowed = new URL(cleanAllowed).hostname.toLowerCase();
    } else {
      cleanAllowed = cleanAllowed.split('/')[0].split(':')[0];
    }

    return reqHost === cleanAllowed || reqHost.endsWith(`.${cleanAllowed}`);
  } catch {
    return false;
  }
}

/**
 * Generates CORS headers tailored to the incoming request.
 */
export function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || '*';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle preflight OPTIONS requests for widget endpoints.
 */
export function handleOptions(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

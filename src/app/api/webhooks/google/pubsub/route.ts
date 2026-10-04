import { NextRequest, NextResponse } from 'next/server';
import { handleGooglePubSubWebhook, PubSubPayload } from '@/lib/services/email/googlePubSubWebhookService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/webhooks/google/pubsub
 * Inbound push notification receiver from Google Cloud Pub/Sub for Gmail mailbox changes.
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    const authHeader = request.headers.get('authorization') || '';
    const body = (await request.json().catch(() => ({}))) as PubSubPayload;

    const result = await handleGooglePubSubWebhook({
      body,
      queryToken,
      authHeader,
    });

    return NextResponse.json(result.responseBody, { status: result.statusCode });
  } catch (fatalErr) {
    console.error('[Google Pub/Sub Webhook Fatal Error]:', (fatalErr as Error).message);
    return NextResponse.json(
      { success: false, error: 'Internal server error processing Google Pub/Sub event' },
      { status: 200 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailProvider } from '@/lib/services/email/emailProviderFactory';
import { Prisma } from '@prisma/client';

import { isEventProcessed, recordEventProcessed } from '@/lib/services/email/emailInboundService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/mailgun/events
 * Mailgun Delivery Event Tracking Webhook.
 *
 * Supported events:
 * - delivered
 * - temporary_fail
 * - permanent_fail
 * - complained
 * - opened
 * - clicked
 *
 * Security & Design:
 * - Verifies webhook cryptographic authenticity.
 * - Idempotent event processing.
 * - NEVER triggers AI discovery engine.
 * - Updates message delivery audit trail in database.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload', errorCategory: 'EMAIL_WEBHOOK_INVALID' },
        { status: 400 }
      );
    }

    const provider = getEmailProvider();

    // 1. Extract signature info
    const sigObj = (payload.signature && typeof payload.signature === 'object' ? payload.signature : {}) as Record<string, unknown>;
    const timestamp = String(sigObj.timestamp || payload.timestamp || '');
    const token = String(sigObj.token || payload.token || '');
    const signature = String(sigObj.signature || payload.signature || '');

    // 2. Verify Cryptographic Authenticity
    const isAuthentic = provider.verifyWebhook({ timestamp, token, signature });
    if (!isAuthentic) {
      console.warn('[Mailgun Events Webhook] Unauthorized: Invalid signature.');
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid webhook signature',
          errorCategory: 'EMAIL_WEBHOOK_INVALID',
        },
        { status: 401 }
      );
    }

    // 3. Parse Delivery Event
    const parsedEvent = provider.parseDeliveryEvent(payload);
    if (!parsedEvent) {
      return NextResponse.json(
        { success: false, error: 'Unrecognized event format', errorCategory: 'EMAIL_PROVIDER_ERROR' },
        { status: 400 }
      );
    }

    // 4. Idempotency Check
    const eventData = ((payload['event-data'] || payload) as Record<string, unknown>) || {};
    const rawEventId = String(eventData.id || `${parsedEvent.messageId}-${parsedEvent.event}-${parsedEvent.timestamp}`);

    if (isEventProcessed(rawEventId)) {
      return NextResponse.json(
        { success: true, message: 'Event already recorded (idempotent)', status: 'duplicate_ignored' },
        { status: 200 }
      );
    }
    recordEventProcessed(rawEventId);

    // 5. Audit Trail Update (Find matching outbound chat message by messageId)
    if (parsedEvent.messageId) {
      try {
        const matchingMessage = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { extractedDataSnapshot: { path: ['outboundMessageId'], equals: parsedEvent.messageId } },
              { extractedDataSnapshot: { path: ['providerMessageId'], equals: parsedEvent.messageId } },
            ],
          },
        });

        if (matchingMessage) {
          const currentSnapshot = (matchingMessage.extractedDataSnapshot as Record<string, unknown>) || {};
          const eventHistory = Array.isArray(currentSnapshot.deliveryEvents)
            ? [...currentSnapshot.deliveryEvents]
            : [];

          eventHistory.push({
            event: parsedEvent.event,
            timestamp: parsedEvent.timestamp,
            reason: parsedEvent.reason || null,
            code: parsedEvent.code || null,
            recordedAt: new Date().toISOString(),
          });

          await prisma.chatMessage.update({
            where: { id: matchingMessage.id },
            data: {
              extractedDataSnapshot: {
                ...currentSnapshot,
                latestDeliveryStatus: parsedEvent.event,
                deliveryEvents: eventHistory,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[Mailgun Events Webhook] Could not update delivery record:', (dbErr as Error).message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Delivery event recorded',
        event: parsedEvent.event,
        messageId: parsedEvent.messageId,
      },
      { status: 200 }
    );
  } catch (fatalErr) {
    console.error('[Mailgun Events Webhook Fatal Error]:', (fatalErr as Error).message);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error processing event webhook',
        errorCategory: 'EMAIL_PROVIDER_ERROR',
      },
      { status: 200 }
    );
  }
}

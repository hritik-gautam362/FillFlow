import { NextRequest, NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/services/email/emailProviderFactory';
import { processInboundEmail } from '@/lib/services/email/emailInboundService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/mailgun/inbound
 * Inbound Customer Email Webhook Receiver from Mailgun.
 *
 * Security & Reliability:
 * 1. Cryptographic HMAC-SHA256 signature verification.
 * 2. Multi-tenant company isolation.
 * 3. Idempotency against duplicate webhook deliveries.
 * 4. Integrates with shared AI Requirement Discovery pipeline.
 * 5. Dispatches contextual email reply to client.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: Record<string, unknown> = {};

    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          payload[key] = typeof value === 'string' ? value : (value as File).name;
        });
      } catch (err) {
        console.error('[Mailgun Inbound Webhook] FormData parsing failed:', (err as Error).message);
        return NextResponse.json(
          { success: false, error: 'Invalid form payload', errorCategory: 'EMAIL_WEBHOOK_INVALID' },
          { status: 400 }
        );
      }
    } else {
      try {
        payload = await request.json();
      } catch {
        const rawText = await request.text().catch(() => '');
        try {
          payload = JSON.parse(rawText);
        } catch {
          return NextResponse.json(
            { success: false, error: 'Invalid JSON payload', errorCategory: 'EMAIL_WEBHOOK_INVALID' },
            { status: 400 }
          );
        }
      }
    }

    const provider = getEmailProvider();

    // 1. Extract signature parameters (support both Mailgun v3 JSON and form post)
    const sigObj = (payload.signature && typeof payload.signature === 'object' ? payload.signature : {}) as Record<string, unknown>;
    const timestamp = String(sigObj.timestamp || payload.timestamp || '');
    const token = String(sigObj.token || payload.token || '');
    const signature = String(sigObj.signature || payload.signature || '');

    // 2. Verify Cryptographic Authenticity
    const isAuthentic = provider.verifyWebhook({ timestamp, token, signature });
    if (!isAuthentic) {
      console.warn('[Mailgun Inbound Webhook] Unauthorized: Invalid or expired webhook signature.');
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid webhook signature',
          errorCategory: 'EMAIL_WEBHOOK_INVALID',
        },
        { status: 401 }
      );
    }

    // 3. Parse and normalize incoming email data
    const parsedEmail = provider.parseInboundMessage(payload);

    if (!parsedEmail.sender || !parsedEmail.text) {
      console.warn('[Mailgun Inbound Webhook] Inbound email missing sender or text body.');
      return NextResponse.json(
        {
          success: false,
          error: 'Bad Request: Inbound email must include sender and text content',
          errorCategory: 'EMAIL_PROVIDER_ERROR',
        },
        { status: 400 }
      );
    }

    // 4. Process inbound email through SaaS pipeline
    const processResult = await processInboundEmail(parsedEmail, provider);

    if (processResult.status === 'duplicate_ignored') {
      return NextResponse.json(
        {
          success: true,
          message: 'Message already processed (idempotent)',
          status: 'duplicate_ignored',
        },
        { status: 200 }
      );
    }

    if (processResult.status === 'automation_disabled') {
      return NextResponse.json(
        {
          success: false,
          message: 'Email automation is disabled for this company',
          status: 'automation_disabled',
          errorCategory: 'EMAIL_AUTOMATION_DISABLED',
        },
        { status: 200 } // Return 200 to acknowledge webhook so provider does not repeatedly retry
      );
    }

    if (!processResult.success) {
      console.error('[Mailgun Inbound Webhook] Processing failed:', processResult.errorMessage);
      return NextResponse.json(
        {
          success: false,
          error: processResult.errorMessage || 'Failed to process inbound email',
          errorCategory: processResult.errorCategory || 'EMAIL_PROVIDER_ERROR',
        },
        { status: 200 } // Return 200 to avoid provider retry storm on non-retryable logical failures
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Inbound email processed and reply dispatched',
        leadId: processResult.leadId,
        briefCreated: processResult.briefCreated,
        readyForBrief: processResult.readyForBrief,
      },
      { status: 200 }
    );
  } catch (fatalErr) {
    console.error('[Mailgun Inbound Webhook Fatal Error]:', (fatalErr as Error).message);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error processing email webhook',
        errorCategory: 'EMAIL_PROVIDER_ERROR',
      },
      { status: 200 }
    );
  }
}

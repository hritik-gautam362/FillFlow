import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChannelSource, LeadStatus } from '@prisma/client';
import { getOrCreateDefaultCompany } from '@/lib/services/companyService';
import { processDiscoveryMessage } from '@/lib/services/aiDiscoveryService';
import { requireAutomationAccess, AutomationType } from '@/lib/services/automationAccessService';
import {
  validateWhatsAppSignature,
  verifyWhatsAppWebhookToken,
  parseWhatsAppWebhookPayload,
  sendWhatsAppTextMessage,
} from '@/lib/whatsapp';

// Fast in-memory deduplication cache for recent WhatsApp message IDs
const processedMessageIds = new Set<string>();
const MAX_CACHE_SIZE = 2000;

function isIdInMemoryCache(msgId: string): boolean {
  return processedMessageIds.has(msgId);
}

function recordIdInMemoryCache(msgId: string) {
  if (processedMessageIds.size >= MAX_CACHE_SIZE) {
    const oldest = processedMessageIds.values().next().value;
    if (oldest) processedMessageIds.delete(oldest);
  }
  processedMessageIds.add(msgId);
}

/**
 * GET /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Webhook Subscription Verification
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const isValid = verifyWhatsAppWebhookToken(mode, token);

  if (isValid && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response('Forbidden: Verification token mismatch', {
    status: 403,
  });
}

/**
 * POST /api/webhooks/whatsapp
 * Inbound WhatsApp Cloud API Webhook Receiver
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('x-hub-signature-256');

    // 1. Validate Meta HMAC-SHA256 signature
    const isSignatureValid = validateWhatsAppSignature(rawBody, signatureHeader);
    if (!isSignatureValid) {
      console.warn('[WhatsApp Webhook] Signature validation failed or secret unconfigured.');
      return new Response('Unauthorized: Invalid webhook signature', { status: 401 });
    }

    // 2. Parse JSON payload safely
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response('Bad Request: Invalid JSON', { status: 400 });
    }

    const { inboundMessages, isStatusUpdate } = parseWhatsAppWebhookPayload(payload);

    // If this is merely a status receipt (delivered, read, sent), acknowledge immediately
    if (isStatusUpdate && inboundMessages.length === 0) {
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    // 3. Process each inbound message
    for (const msg of inboundMessages) {
      // Handle non-text messages gracefully (images, audio, documents)
      if (msg.type !== 'text' || !msg.text || msg.text.trim() === '') {
        console.log(`[WhatsApp Webhook] Received unsupported message type '${msg.type}' from ${msg.from}`);
        await sendWhatsAppTextMessage(
          msg.from,
          "Thank you for reaching out! We received your attachment, but please describe your software requirements in text so our AI can prepare your project brief."
        );
        continue;
      }

      const trimmedText = msg.text.trim();

      // 4. Idempotency Protection: Check in-memory cache
      if (isIdInMemoryCache(msg.messageId)) {
        console.log(`[WhatsApp Webhook] Idempotency hit (memory): Message ${msg.messageId} already processed.`);
        continue;
      }

      // Check database for duplicate message ID
      const existingChatMessage = await prisma.chatMessage.findFirst({
        where: {
          extractedDataSnapshot: {
            path: ['whatsappMessageId'],
            equals: msg.messageId,
          },
        },
      });

      if (existingChatMessage) {
        recordIdInMemoryCache(msg.messageId);
        console.log(`[WhatsApp Webhook] Idempotency hit (DB): Message ${msg.messageId} already recorded.`);
        continue;
      }

      // Record in cache to block concurrent in-flight retries
      recordIdInMemoryCache(msg.messageId);

      // 5. Determine Target Company & Verify WhatsApp Automation Access
      const normalizedPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
      let lead = await prisma.lead.findFirst({
        where: {
          channel: ChannelSource.whatsapp,
          phone: { in: [msg.from, normalizedPhone] },
        },
        orderBy: { createdAt: 'desc' },
      });

      const company = lead ? null : await getOrCreateDefaultCompany();
      const targetCompanyId = lead ? lead.companyId : company!.id;

      // Access Control: WhatsApp Automation must be explicitly enabled for this company
      const accessCheck = await requireAutomationAccess(targetCompanyId, AutomationType.whatsapp);
      if (!accessCheck.allowed) {
        console.warn(
          `[WhatsApp Webhook] AUTOMATION_LOCKED: WhatsApp Automation is disabled for company ${targetCompanyId}. Ignoring message ${msg.messageId} from ${msg.from}.`
        );
        // Do NOT call Gemini. Do NOT create a lead. Do NOT save AI response. Do NOT generate Project Brief.
        continue;
      }

      // 6. If automation is active and lead doesn't exist, create new WhatsApp Lead
      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            companyId: targetCompanyId,
            clientName: msg.senderName || 'WhatsApp Client',
            companyName: 'Client Project Co',
            email: '',
            phone: normalizedPhone,
            channel: ChannelSource.whatsapp,
            status: LeadStatus.new,
            qualificationScore: 0,
          },
        });
      }

      // 7. Execute Shared AI Requirement Discovery Pipeline
      const discoveryResult = await processDiscoveryMessage({
        leadId: lead.id,
        messageText: trimmedText,
        whatsappMessageId: msg.messageId,
      });

      // 8. Send AI Response back to user via WhatsApp Cloud API
      await sendWhatsAppTextMessage(msg.from, discoveryResult.reply);
    }

    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (err) {
    console.error('[WhatsApp Webhook Fatal Error]:', err);
    // Return 200 to prevent Meta from spamming retries if an unexpected unrecoverable error happens
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
}

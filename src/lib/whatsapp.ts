import crypto from 'crypto';

export interface WhatsAppInboundMessage {
  from: string; // wa_id e.g. "15551234567"
  senderName: string;
  messageId: string;
  timestamp: string;
  type: string;
  text?: string;
}

export interface ParseWebhookResult {
  inboundMessages: WhatsAppInboundMessage[];
  isStatusUpdate: boolean;
  phoneNumberId?: string;
}

export interface SendWhatsAppResponse {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

/**
 * Validates Meta x-hub-signature-256 header using the server-side WHATSAPP_APP_SECRET.
 */
export function validateWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // If no secret configured in environment, reject for security
  if (!appSecret) {
    console.warn('[WhatsApp Webhook] WHATSAPP_APP_SECRET is not configured.');
    return false;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const signatureHash = signatureHeader.slice(7); // remove 'sha256='
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    const signatureBuffer = Buffer.from(signatureHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (err) {
    console.error('[WhatsApp Signature Validation Error]:', err);
    return false;
  }
}

/**
 * Verifies GET webhook subscription challenge against WHATSAPP_VERIFY_TOKEN.
 */
export function verifyWhatsAppWebhookToken(
  mode: string | null,
  token: string | null
): boolean {
  const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!configuredToken) {
    console.warn('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN is not configured.');
    return false;
  }

  return mode === 'subscribe' && token === configuredToken;
}

/**
 * Safely parses Meta WhatsApp Cloud API webhook payload.
 * Ignores media/audio/images gracefully and detects status receipts.
 */
export function parseWhatsAppWebhookPayload(payload: unknown): ParseWebhookResult {
  const result: ParseWebhookResult = {
    inboundMessages: [],
    isStatusUpdate: false,
  };

  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const p = payload as Record<string, unknown>;
  const entries = Array.isArray(p.entry) ? p.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const val = change?.value;
      if (!val || typeof val !== 'object') continue;

      const valueObj = val as Record<string, unknown>;

      if (valueObj.metadata && typeof valueObj.metadata === 'object') {
        const meta = valueObj.metadata as Record<string, unknown>;
        if (typeof meta.phone_number_id === 'string') {
          result.phoneNumberId = meta.phone_number_id;
        }
      }

      // Check if this is a delivery or read status update
      if (Array.isArray(valueObj.statuses) && valueObj.statuses.length > 0) {
        result.isStatusUpdate = true;
      }

      // Extract contact profile names indexed by wa_id
      const contactNames = new Map<string, string>();
      if (Array.isArray(valueObj.contacts)) {
        for (const contact of valueObj.contacts) {
          if (contact?.wa_id && contact?.profile?.name) {
            contactNames.set(String(contact.wa_id), String(contact.profile.name));
          }
        }
      }

      // Extract incoming messages
      if (Array.isArray(valueObj.messages)) {
        for (const msg of valueObj.messages) {
          if (!msg || !msg.id || !msg.from) continue;

          const from = String(msg.from);
          const senderName = contactNames.get(from) || 'WhatsApp User';
          const msgType = String(msg.type || 'unknown');

          let textBody: string | undefined;
          if (msgType === 'text' && msg.text?.body) {
            textBody = String(msg.text.body);
          }

          result.inboundMessages.push({
            from,
            senderName,
            messageId: String(msg.id),
            timestamp: String(msg.timestamp || Date.now()),
            type: msgType,
            text: textBody,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Sends an outbound text message via Meta's WhatsApp Cloud API using native fetch.
 * Returns gracefully in simulation mode if live Meta credentials are not configured.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  messageText: string
): Promise<SendWhatsAppResponse> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Clean recipient number (remove leading +, spaces, dashes)
  const recipient = to.replace(/[^0-9]/g, '');

  if (!accessToken || !phoneNumberId || accessToken.trim() === '' || phoneNumberId.trim() === '') {
    console.log(
      `[WhatsApp Outbound Simulation] Outbound message to +${recipient} (Meta credentials not configured):\n${messageText}`
    );
    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}`,
    };
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText,
        },
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('[WhatsApp Cloud API Outbound Error]:', {
        status: res.status,
        data,
      });
      return {
        success: false,
        error: data?.error?.message || `Meta API request failed with status ${res.status}`,
      };
    }

    const createdMsgId = data?.messages?.[0]?.id;
    return {
      success: true,
      messageId: createdMsgId,
    };
  } catch (err) {
    console.error('[WhatsApp Cloud API Outbound Network Exception]:', err);
    return {
      success: false,
      error: (err as Error).message || 'Network exception when sending WhatsApp message',
    };
  }
}

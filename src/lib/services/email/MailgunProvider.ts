import crypto from 'crypto';
import {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
  VerifyWebhookParams,
  ParsedInboundEmail,
  ParsedDeliveryEvent,
} from './EmailProvider';

export interface MailgunConfig {
  apiKey?: string;
  domain?: string;
  region?: 'US' | 'EU' | string;
  fromEmail?: string;
  webhookSigningKey?: string;
}

export class MailgunProvider implements EmailProvider {
  readonly providerType = 'mailgun';
  private apiKey: string;
  private domain: string;
  private region: string;
  private defaultFromEmail: string;
  private webhookSigningKey: string;

  constructor(customConfig?: MailgunConfig) {
    this.apiKey = customConfig?.apiKey ?? process.env.MAILGUN_API_KEY ?? '';
    this.domain = customConfig?.domain ?? process.env.MAILGUN_DOMAIN ?? '';
    this.region = (customConfig?.region ?? process.env.MAILGUN_REGION ?? 'US').toUpperCase();
    this.defaultFromEmail =
      customConfig?.fromEmail ??
      process.env.MAILGUN_FROM_EMAIL ??
      (this.domain ? `no-reply@${this.domain}` : 'inbound@apexbyte.io');
    this.webhookSigningKey =
      customConfig?.webhookSigningKey ??
      process.env.MAILGUN_WEBHOOK_SIGNING_KEY ??
      this.apiKey;
  }

  /**
   * Resolves the Mailgun API base URL based on configured region.
   */
  public getBaseUrl(): string {
    return this.region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  }

  public getDomain(): string {
    return this.domain;
  }

  public getDefaultFromEmail(): string {
    return this.defaultFromEmail;
  }

  /**
   * Verifies Mailgun webhook cryptographic signature using HMAC-SHA256.
   * Compares timing-safely to protect against timing attacks.
   */
  public verifyWebhook(params: VerifyWebhookParams): boolean {
    const { timestamp, token, signature } = params;

    if (!timestamp || !token || !signature) {
      return false;
    }

    const signingKey = this.webhookSigningKey || this.apiKey;
    if (!signingKey) {
      console.warn('[MailgunProvider] Cannot verify webhook: No webhook signing key or API key configured.');
      return false;
    }

    // Guard against replay attacks: reject timestamps older than 15 minutes (900 seconds)
    const webhookTime = parseInt(timestamp, 10);
    if (isNaN(webhookTime)) {
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 900;
    if (Math.abs(currentTime - webhookTime) > maxAgeSeconds) {
      console.warn('[MailgunProvider] Webhook rejected: timestamp outside allowed replay window.');
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', signingKey);
      hmac.update(`${timestamp}${token}`);
      const expectedSignature = hmac.digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const providedBuffer = Buffer.from(signature, 'hex');

      if (expectedBuffer.length !== providedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    } catch (err) {
      console.error('[MailgunProvider] Error verifying webhook signature:', (err as Error).message);
      return false;
    }
  }

  /**
   * Sends an email via Mailgun Messages API.
   * Handles 400, 401, 403, 404, 429, 5xx, and network errors cleanly without exposing secrets.
   */
  public async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    const { to, from, subject, text, html, inReplyTo, references, metadata } = params;

    // Simulation fallback if API key or domain is unconfigured or in test mode
    if (!this.apiKey || !this.domain || this.apiKey.startsWith('key-test-fake') || this.apiKey === 'simulated') {
      console.log(
        `[Mailgun Outbound Simulation] Outbound email to <${to}>:\n` +
          `Subject: ${subject}\n` +
          `Body:\n${text}`
      );
      return {
        success: true,
        simulated: true,
        providerMessageId: `<sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@mailgun.simulated>`,
      };
    }

    const endpoint = `${this.getBaseUrl()}/v3/${this.domain}/messages`;
    const sender = from || this.defaultFromEmail;

    // Prepare standard URL-encoded form body
    const formParams = new URLSearchParams();
    formParams.append('from', sender);
    formParams.append('to', to);
    formParams.append('subject', subject);
    formParams.append('text', text);

    if (html) {
      formParams.append('html', html);
    }

    // Threading headers
    if (inReplyTo) {
      formParams.append('h:In-Reply-To', inReplyTo);
    }
    if (references) {
      formParams.append('h:References', references);
    }

    // Metadata variables for tracking
    if (metadata) {
      for (const [key, val] of Object.entries(metadata)) {
        formParams.append(`v:${key}`, typeof val === 'string' ? val : JSON.stringify(val));
      }
    }

    const authHeader = `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formParams.toString(),
      });

      const responseText = await response.text();
      let responseJson: Record<string, unknown> | null = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Non-JSON response
      }

      if (!response.ok) {
        const errorMsg =
          (responseJson?.message as string) ||
          `Mailgun API responded with status ${response.status} (${response.statusText})`;

        console.error('[MailgunProvider] Send message failed:', {
          status: response.status,
          message: errorMsg,
          recipient: to,
        });

        return {
          success: false,
          statusCode: response.status,
          error: errorMsg,
        };
      }

      const providerMessageId = (responseJson?.id as string) || undefined;

      return {
        success: true,
        providerMessageId,
        statusCode: response.status,
      };
    } catch (err) {
      const errorMsg = (err as Error).message || 'Network failure when connecting to Mailgun API';
      console.error('[MailgunProvider] Network exception sending email:', errorMsg);
      return {
        success: false,
        statusCode: 500,
        error: errorMsg,
      };
    }
  }

  /**
   * Normalizes incoming email body text by stripping reply quotes and signatures
   * while strictly preserving project requirements, constraints, and descriptions.
   */
  public normalizeMessage(text: string): string {
    if (!text) return '';

    const lines = text.split(/\r?\n/);
    const cleanedLines: string[] = [];
    let skippingQuotedBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Common email quote boundary headers
      if (
        /^On\s.+wrote:$/i.test(trimmed) ||
        /^-+\s*Original Message\s*-+/i.test(trimmed) ||
        /^-+\s*Forwarded message\s*-+/i.test(trimmed)
      ) {
        skippingQuotedBlock = true;
        continue;
      }

      // Quoted reply line indicator
      if (trimmed.startsWith('>')) {
        continue;
      }

      // Standard email signature delimiter
      if (trimmed === '--' || trimmed === '-- ') {
        break;
      }

      if (!skippingQuotedBlock) {
        cleanedLines.push(line);
      }
    }

    const result = cleanedLines.join('\n').trim();
    // If quote stripping emptied the text (e.g. edge case client only sent inside quotes), fallback to original
    return result.length > 0 ? result : text.trim();
  }

  /**
   * Safely parses Mailgun inbound webhook payloads into a normalized ParsedInboundEmail.
   */
  public parseInboundMessage(payload: unknown): ParsedInboundEmail {
    const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

    // Handle sender parsing: Mailgun may provide 'sender', 'from', or full name formatted e.g. "Alice <alice@test.com>"
    const fromField = String(raw['from'] || raw['sender'] || '');
    const senderEmail = this.extractEmailAddress(fromField) || String(raw['sender'] || '');
    const senderName = this.extractSenderName(fromField);

    const recipientField = String(raw['recipient'] || raw['To'] || raw['to'] || '');
    const recipientEmail = this.extractEmailAddress(recipientField) || recipientField;

    const subject = String(raw['subject'] || 'Project Requirements Inquiry');

    // Mailgun inbound parsed text: prefer stripped-text if available, fallback to body-plain
    const rawText = String(raw['stripped-text'] || raw['body-plain'] || '');
    const text = this.normalizeMessage(rawText);

    const html = raw['stripped-html'] ? String(raw['stripped-html']) : raw['body-html'] ? String(raw['body-html']) : undefined;

    // Header extraction: In-Reply-To, References, Message-Id
    let messageId = String(raw['Message-Id'] || raw['message-id'] || '');
    let inReplyTo = raw['In-Reply-To'] ? String(raw['In-Reply-To']) : undefined;
    let references = raw['References'] ? String(raw['References']) : undefined;

    // Mailgun sometimes sends 'message-headers' as a JSON array of [header, value]
    if (raw['message-headers']) {
      try {
        const headersParsed = typeof raw['message-headers'] === 'string'
          ? JSON.parse(raw['message-headers'])
          : raw['message-headers'];

        if (Array.isArray(headersParsed)) {
          for (const item of headersParsed) {
            if (Array.isArray(item) && item.length >= 2) {
              const name = String(item[0]).toLowerCase();
              const val = String(item[1]);
              if (name === 'message-id' && !messageId) messageId = val;
              if (name === 'in-reply-to' && !inReplyTo) inReplyTo = val;
              if (name === 'references' && !references) references = val;
            }
          }
        }
      } catch {
        // Best effort header extraction
      }
    }

    if (!messageId) {
      // Fallback synthetic message-id using token or timestamp if not provided in headers
      messageId = raw['token']
        ? `<token-${raw['token']}@mailgun.inbound>`
        : `<inbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mailgun.inbound>`;
    }

    const timestamp = raw['timestamp'] ? String(raw['timestamp']) : Date.now();

    return {
      messageId,
      sender: senderEmail.toLowerCase().trim(),
      senderName,
      recipient: recipientEmail.toLowerCase().trim(),
      subject,
      text,
      html,
      inReplyTo,
      references,
      timestamp,
      metadata: raw,
    };
  }

  /**
   * Parses delivery event payloads from Mailgun's event webhooks.
   */
  public parseDeliveryEvent(payload: unknown): ParsedDeliveryEvent | null {
    if (!payload || typeof payload !== 'object') return null;

    const data = payload as Record<string, unknown>;
    const eventData = (data['event-data'] || data) as Record<string, unknown>;

    const event = String(eventData['event'] || '');
    if (!event) return null;

    // Extract Message-ID from headers or id
    const messageHeaders = (eventData['message'] as Record<string, unknown>)?.['headers'] as Record<string, unknown>;
    const messageId = String(
      messageHeaders?.['message-id'] ||
      (eventData['message'] as Record<string, unknown>)?.['id'] ||
      eventData['id'] ||
      ''
    );

    const recipient = String(eventData['recipient'] || '');
    const timestamp = String(eventData['timestamp'] || Date.now());

    const deliveryStatus = (eventData['delivery-status'] as Record<string, unknown>) || {};
    const severity = String(eventData['severity'] || '');

    // Map Mailgun event types into normalized categories
    let normalizedEvent = event;
    if (event === 'failed') {
      normalizedEvent = severity === 'permanent' ? 'permanent_fail' : 'temporary_fail';
    }

    return {
      event: normalizedEvent,
      messageId,
      recipient,
      timestamp,
      code: deliveryStatus['code'] as string | number | undefined,
      reason: String(eventData['reason'] || deliveryStatus['message'] || ''),
      description: String(deliveryStatus['description'] || ''),
      raw: payload,
    };
  }

  /**
   * Helper to extract clean email address from formats like "John Doe <john@example.com>"
   */
  private extractEmailAddress(raw: string): string {
    if (!raw) return '';
    const match = raw.match(/<([^>]+)>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0].trim() : raw.trim();
  }

  /**
   * Helper to extract sender display name from formats like "John Doe <john@example.com>"
   */
  private extractSenderName(raw: string): string | undefined {
    if (!raw) return undefined;
    const angleIndex = raw.indexOf('<');
    if (angleIndex > 0) {
      const name = raw.slice(0, angleIndex).trim().replace(/^["']|["']$/g, '');
      return name.length > 0 ? name : undefined;
    }
    return undefined;
  }
}

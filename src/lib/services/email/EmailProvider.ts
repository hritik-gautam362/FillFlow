/**
 * Email Provider Abstraction Interface.
 * Defines standard contracts for email transports (Mailgun, etc.)
 * so business and AI discovery logic remains strictly decoupled.
 */

export interface SendEmailParams {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  metadata?: Record<string, string>;
  tags?: string[];
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  simulated?: boolean;
  error?: string;
  statusCode?: number;
}

export interface VerifyWebhookParams {
  timestamp: string;
  token: string;
  signature: string;
  body?: string;
}

export interface ParsedInboundEmail {
  messageId: string;
  sender: string; // Clean email address, e.g. "client@example.com"
  senderName?: string; // Display name, e.g. "Alice Smith"
  recipient: string; // Target email address, e.g. "rfp@agency.com"
  subject: string;
  text: string; // Normalized plain text body (stripped of quotes/signatures where practical)
  html?: string;
  inReplyTo?: string;
  references?: string;
  timestamp: number | string;
  rawHeaders?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ParsedDeliveryEvent {
  event: 'delivered' | 'temporary_fail' | 'permanent_fail' | 'complained' | 'opened' | 'clicked' | string;
  messageId: string;
  recipient: string;
  timestamp: number | string;
  reason?: string;
  code?: number | string;
  description?: string;
  raw?: unknown;
}

export interface EmailProvider {
  readonly providerType?: string;

  /**
   * Sends an outbound email message via provider API.
   */
  sendMessage(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Verifies cryptographic authenticity of inbound or event webhook requests.
   */
  verifyWebhook(params: VerifyWebhookParams): boolean;

  /**
   * Parses raw incoming webhook payloads (FormData, JSON, or UrlEncoded) into normalized email objects.
   */
  parseInboundMessage(payload: unknown): ParsedInboundEmail;

  /**
   * Strips unnecessary email quotes and signature noise while preserving core customer requirements.
   */
  normalizeMessage(text: string): string;

  /**
   * Parses delivery / status tracking event payloads.
   */
  parseDeliveryEvent(payload: unknown): ParsedDeliveryEvent | null;

  /**
   * Marks an incoming message as read/processed in the email provider inbox.
   */
  markAsRead?(messageId: string): Promise<void>;

  /**
   * Checks whether an outbound reply from the connected account already exists for a given thread/message.
   */
  hasOutboundReply?(threadId: string, incomingMessageId?: string): Promise<boolean>;
}

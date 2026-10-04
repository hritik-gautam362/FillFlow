import {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
  VerifyWebhookParams,
  ParsedInboundEmail,
  ParsedDeliveryEvent,
} from './EmailProvider';

export interface GoogleProviderConfig {
  companyId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number; // epoch milliseconds
  connectedEmail?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  simulated?: boolean;
  scope?: string;
  onTokenRefreshed?: (newTokens: { accessToken: string; tokenExpiry: number }) => Promise<void>;
}

export interface GmailMessagePayload {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: {
      size?: number;
      data?: string;
    };
    parts?: Array<GmailMessagePayload['payload']>;
  };
}

/**
 * Google Gmail & Google Workspace Email Provider.
 * Implements the standard EmailProvider interface using the official Gmail REST API v1.
 */
export class GoogleProvider implements EmailProvider {
  readonly providerType = 'google';
  private config: GoogleProviderConfig;
  private simulatedRepliedThreads = new Set<string>();
  private simulatedReadMessages = new Set<string>();

  constructor(config?: GoogleProviderConfig) {
    const isSimulated =
      config?.simulated ??
      (Boolean(config?.accessToken?.startsWith('sim-')) ||
        (!config?.accessToken && !process.env.GOOGLE_CLIENT_ID) ||
        process.env.GOOGLE_CLIENT_ID === 'simulated');

    this.config = {
      clientId: config?.clientId || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: config?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: config?.redirectUri || process.env.GOOGLE_REDIRECT_URI || '',
      ...config,
      simulated: isSimulated,
    };
  }

  /**
   * Checks whether the provider is operating in simulated mode.
   */
  isSimulated(): boolean {
    return Boolean(this.config.simulated);
  }

  /**
   * Checks whether the current Google connection was granted a specific OAuth scope.
   */
  hasScope(scopeName: string): boolean {
    if (this.config.simulated) return true;
    if (!this.config.scope) return false;
    return this.config.scope.includes(scopeName);
  }

  /**
   * Retrieves a valid Google access token, automatically refreshing via refresh_token
   * if expired or close to expiry (within 60 seconds).
   */
  async getValidAccessToken(): Promise<string> {
    const now = Date.now();
    const expiry = this.config.tokenExpiry || 0;

    // Refresh if expired or expiring within 60s
    if (expiry && now >= expiry - 60000) {
      if (!this.config.refreshToken && !this.config.simulated) {
        throw new Error('Google access token is expired and no refresh token is available.');
      }

      await this.refreshAccessToken();
    } else if (this.config.simulated && !this.config.accessToken) {
      return 'simulated-google-access-token';
    }

    return this.config.accessToken || 'simulated-google-access-token';
  }

  /**
   * Performs an OAuth 2.0 token refresh request against Google's token endpoint.
   */
  async refreshAccessToken(): Promise<{ accessToken: string; tokenExpiry: number }> {
    if (this.config.simulated) {
      const newExpiry = Date.now() + 3600 * 1000;
      this.config.accessToken = 'simulated-refreshed-token';
      this.config.tokenExpiry = newExpiry;
      if (this.config.onTokenRefreshed) {
        await this.config.onTokenRefreshed({ accessToken: this.config.accessToken, tokenExpiry: newExpiry });
      }
      return { accessToken: this.config.accessToken, tokenExpiry: newExpiry };
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId || '',
        client_secret: this.config.clientSecret || '',
        refresh_token: this.config.refreshToken || '',
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Google OAuth token (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;
    const newExpiry = Date.now() + expiresIn * 1000;

    this.config.accessToken = newAccessToken;
    this.config.tokenExpiry = newExpiry;

    if (this.config.onTokenRefreshed) {
      await this.config.onTokenRefreshed({
        accessToken: newAccessToken,
        tokenExpiry: newExpiry,
      });
    }

    return { accessToken: newAccessToken, tokenExpiry: newExpiry };
  }

  /**
   * Sends an outbound email message via Gmail REST API v1.
   */
  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    const startTime = Date.now();
    if (this.config.simulated) {
      const mockId = `sim-gmail-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      if (params.metadata?.gmailThreadId) {
        this.simulatedRepliedThreads.add(params.metadata.gmailThreadId as string);
      }
      if (params.inReplyTo) {
        this.simulatedRepliedThreads.add(params.inReplyTo);
      }
      if (params.metadata?.incomingGmailMessageId) {
        this.simulatedRepliedThreads.add(params.metadata.incomingGmailMessageId as string);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[GoogleProvider] Simulated sendMessage to ${params.to} | Subject: "${params.subject}" | mockId: ${mockId}`
        );
      }
      return {
        success: true,
        providerMessageId: mockId,
        simulated: true,
      };
    }

    try {
      let accessToken = await this.getValidAccessToken();
      const sender = params.from || this.config.connectedEmail;

      if (!sender) {
        return {
          success: false,
          error: 'Missing sender address for Gmail outbound message.',
        };
      }

      // 1. Build standard RFC 2822 MIME message
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const headers: string[] = [
        `From: ${sender}`,
        `To: ${params.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
      ];

      if (params.inReplyTo) {
        const formattedInReplyTo = params.inReplyTo.trim().startsWith('<')
          ? params.inReplyTo.trim()
          : `<${params.inReplyTo.trim()}>`;
        headers.push(`In-Reply-To: ${formattedInReplyTo}`);
      }
      if (params.references) {
        const formattedReferences = params.references
          .split(/\s+/)
          .map((r) => r.trim())
          .filter(Boolean)
          .map((r) => (r.startsWith('<') ? r : `<${r}>`))
          .join(' ');
        headers.push(`References: ${formattedReferences}`);
      }

      let rawMime: string;

      if (params.html) {
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        rawMime = `${headers.join('\r\n')}\r\n\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: text/plain; charset=UTF-8\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          `${Buffer.from(params.text, 'utf-8').toString('base64')}\r\n\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: text/html; charset=UTF-8\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          `${Buffer.from(params.html, 'utf-8').toString('base64')}\r\n\r\n` +
          `--${boundary}--`;
      } else {
        headers.push(`Content-Type: text/plain; charset=UTF-8`);
        headers.push(`Content-Transfer-Encoding: base64`);
        rawMime = `${headers.join('\r\n')}\r\n\r\n${Buffer.from(params.text, 'utf-8').toString('base64')}`;
      }

      // Convert to URL-safe base64
      const base64Url = Buffer.from(rawMime, 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const requestBody: { raw: string; threadId?: string } = {
        raw: base64Url,
      };

      if (params.metadata?.gmailThreadId) {
        const rawThreadId = String(params.metadata.gmailThreadId).trim();
        // Gmail thread IDs are hexadecimal strings (e.g. "18c5e0a12b456789")
        // Don't send synthetic IDs like "gmail-thread-1790..." which cause 400 Invalid thread_id value
        if (/^[0-9a-fA-F]{16}$/.test(rawThreadId)) {
          requestBody.threadId = rawThreadId;
        }
      }

      let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Automatic retry once on 401 Unauthorized if refresh token is available
      if (response.status === 401 && this.config.refreshToken && !this.config.simulated) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[GoogleProvider] 401 received on sendMessage, refreshing access token and retrying...');
        }
        const refreshed = await this.refreshAccessToken();
        accessToken = refreshed.accessToken;
        response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      }

      if (!response.ok) {
        let errText = await response.text();
        
        // Resilience: If Gmail API rejects with 400 due to non-existent or invalid thread_id on new messages,
        // retry send as a clean new thread without the invalid threadId parameter.
        if (response.status === 400 && requestBody.threadId && /Invalid thread_id value/i.test(errText)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[GoogleProvider] Gmail rejected threadId ${requestBody.threadId} with 400. Retrying send without threadId...`);
          }
          delete requestBody.threadId;
          response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (response.ok) {
            const data = await response.json();
            const durationMs = Date.now() - startTime;
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `[GoogleProvider] Outbound email sent successfully without threadId in ${durationMs}ms: providerMessageId=${data.id}, to=${params.to}`
              );
            }
            return {
              success: true,
              providerMessageId: data.id,
              statusCode: response.status,
            };
          }
          errText = await response.text();
        }

        if (process.env.NODE_ENV !== 'production') {
          console.error(
            `[GoogleProvider] Gmail API send failed (${response.status}) for recipient: ${params.to} | Thread: ${params.metadata?.gmailThreadId || 'none'}. Error: ${errText}`
          );
        }
        return {
          success: false,
          error: `Gmail API send failed (${response.status}): ${errText}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      const durationMs = Date.now() - startTime;

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[GoogleProvider] Outbound email sent successfully in ${durationMs}ms: providerMessageId=${data.id}, to=${params.to}, threadId=${requestBody.threadId || 'none'}`
        );
      }

      return {
        success: true,
        providerMessageId: data.id,
      };
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[GoogleProvider] Unexpected error sending email through Gmail API:', (err as Error).message);
      }
      return {
        success: false,
        error: (err as Error).message || 'Unexpected error sending email through Gmail API',
      };
    }
  }

  /**
   * Fetches and parses a single Gmail message by ID.
   */
  async fetchMessage(messageId: string): Promise<ParsedInboundEmail> {
    if (this.config.simulated) {
      return {
        messageId,
        sender: 'client@example.com',
        senderName: 'Simulated Client',
        recipient: this.config.connectedEmail || 'company@workspace.com',
        subject: 'Inquiry regarding software development services',
        text: 'Hi, we are looking to build a modern SaaS customer portal. Budget is around $25k and we want it launched in 3 months.',
        timestamp: Date.now(),
      };
    }

    let accessToken = await this.getValidAccessToken();
    let res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401 && this.config.refreshToken && !this.config.simulated) {
      const refreshed = await this.refreshAccessToken();
      accessToken = refreshed.accessToken;
      res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!res.ok) {
      const err = await res.text();
      console.error(`[GoogleProvider] Failed to fetch message ${messageId} (${res.status}): ${err}`);
      throw new Error(`Failed to fetch message ${messageId} from Gmail API (${res.status})`);
    }

    const payload = await res.json();
    const parsed = this.parseInboundMessage(payload);

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[GoogleProvider] Inbound message retrieved: id=${messageId}, sender=${parsed.sender}, subject="${parsed.subject}", threadId=${parsed.metadata?.gmailThreadId || 'none'}`
      );
    }

    return parsed;
  }

  /**
   * Fetches the user's Gmail profile, including the current historyId.
   */
  async getProfile(): Promise<{ emailAddress: string; historyId: string }> {
    if (this.config.simulated) {
      return {
        emailAddress: this.config.connectedEmail || 'connected@gmail.com',
        historyId: '100001',
      };
    }

    let accessToken = await this.getValidAccessToken();
    let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401 && this.config.refreshToken && !this.config.simulated) {
      const refreshed = await this.refreshAccessToken();
      accessToken = refreshed.accessToken;
      res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch Gmail profile (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      emailAddress: data.emailAddress || this.config.connectedEmail || '',
      historyId: data.historyId || '1',
    };
  }

  /**
   * Lists message history since a specified history ID.
   * Throws an error with isExpiredHistoryId: true if HTTP 404 (history ID expired/invalid).
   */
  async listHistory(startHistoryId: string): Promise<{ messageIds: string[]; latestHistoryId: string }> {
    if (this.config.simulated) {
      return { messageIds: [], latestHistoryId: startHistoryId };
    }

    let accessToken = await this.getValidAccessToken();
    const messageIds = new Set<string>();
    let pageToken: string | undefined = undefined;
    let latestHistoryId = startHistoryId;
    let pageCount = 0;
    const MAX_PAGES = 5;

    do {
      pageCount++;
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
      url.searchParams.set('startHistoryId', startHistoryId);
      url.searchParams.set('historyTypes', 'messageAdded');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      let res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 401 && this.config.refreshToken && !this.config.simulated) {
        const refreshed = await this.refreshAccessToken();
        accessToken = refreshed.accessToken;
        res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (res.status === 404) {
        const err = new Error(`Gmail historyId ${startHistoryId} is expired or invalid (404)`);
        (err as unknown as { isExpiredHistoryId: boolean; statusCode: number }).isExpiredHistoryId = true;
        (err as unknown as { isExpiredHistoryId: boolean; statusCode: number }).statusCode = 404;
        throw err;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to fetch Gmail history (${res.status}): ${errText}`);
      }

      const data = await res.json();
      if (data.historyId) {
        latestHistoryId = data.historyId;
      }

      if (Array.isArray(data.history)) {
        for (const item of data.history) {
          if (Array.isArray(item.messagesAdded)) {
            for (const added of item.messagesAdded) {
              if (added.message?.id) {
                messageIds.add(added.message.id);
              }
            }
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && pageCount < MAX_PAGES);

    return {
      messageIds: Array.from(messageIds),
      latestHistoryId,
    };
  }

  /**
   * Registers a Cloud Pub/Sub watch on the mailbox for push notifications.
   */
  async setupWatch(topicName: string): Promise<{ historyId: string; expiration: string }> {
    if (this.config.simulated) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[GoogleProvider] Simulated watch setup on topic ${topicName}`);
      }
      return { historyId: '100001', expiration: (Date.now() + 7 * 24 * 3600 * 1000).toString() };
    }

    let accessToken = await this.getValidAccessToken();
    let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
      }),
    });

    if (res.status === 401 && this.config.refreshToken && !this.config.simulated) {
      const refreshed = await this.refreshAccessToken();
      accessToken = refreshed.accessToken;
      res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName,
          labelIds: ['INBOX'],
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      let diagnosticError = `Failed to set up Gmail watch (${res.status}): ${errText}`;
      if (res.status === 403 && (errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || !this.hasScope('gmail.modify'))) {
        diagnosticError = `Gmail API 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT: Account lacks 'https://www.googleapis.com/auth/gmail.modify' scope. The workspace must be reauthorized via OAuth to grant modify permissions.`;
      } else if (
        (res.status === 404 || res.status === 400) &&
        (errText.includes('Resource not found') || errText.includes('PubSub') || errText.includes('gmail-inbound'))
      ) {
        diagnosticError = `Google Cloud Pub/Sub topic '${topicName}' not found or service account gmail-api-push@system.gserviceaccount.com lacks Pub/Sub Publisher role in Google Cloud Console project automation-508113.`;
      }
      console.error(`[GoogleProvider] ${diagnosticError}`);
      throw new Error(diagnosticError);
    }

    const data = await res.json();
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[GoogleProvider] Gmail watch created: topic=${topicName}, historyId=${data.historyId}, expiration=${data.expiration}`
      );
    }
    return {
      historyId: data.historyId,
      expiration: data.expiration,
    };
  }

  /**
   * Cancels active push notification watch.
   */
  async stopWatch(): Promise<void> {
    if (this.config.simulated) return;

    const accessToken = await this.getValidAccessToken();
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  /**
   * Verifies incoming Google Cloud Pub/Sub webhook authenticity.
   * Can verify via bearer verification token or query secret.
   */
  verifyWebhook(params: VerifyWebhookParams): boolean {
    const expectedToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
    if (!expectedToken) {
      // If no verification token configured, accept in development
      return true;
    }
    return params.token === expectedToken;
  }

  /**
   * Marks a message as read in Gmail by removing the UNREAD label.
   */
  async markAsRead(messageId: string): Promise<void> {
    if (this.config.simulated) {
      this.simulatedReadMessages.add(messageId);
      return;
    }

    try {
      let accessToken = await this.getValidAccessToken();
      let res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            removeLabelIds: ['UNREAD'],
          }),
        }
      );

      // Handle 401 by refreshing token and retrying once
      if (res.status === 401 && this.config.refreshToken && !this.config.simulated) {
        const refreshed = await this.refreshAccessToken();
        accessToken = refreshed.accessToken;
        res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              removeLabelIds: ['UNREAD'],
            }),
          }
        );
      }

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 403 && err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
          console.error(
            `[GoogleProvider] 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT: Account lacks 'https://www.googleapis.com/auth/gmail.modify' scope. The workspace must be reauthorized via OAuth to grant modify permissions.`
          );
        } else {
          console.error(`[GoogleProvider] Failed to mark message ${messageId} as read (${res.status}): ${err}`);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.log(`[GoogleProvider] Successfully marked message ${messageId} as read (UNREAD label removed).`);
      }
    } catch (err) {
      console.error(`[GoogleProvider] Error marking message ${messageId} as read:`, (err as Error).message);
    }
  }

  /**
   * Checks whether an outbound reply from the connected account already exists for a specific incoming message in the thread.
   */
  async hasOutboundReply(threadId: string, incomingMessageId?: string): Promise<boolean> {
    if (this.config.simulated) {
      if (incomingMessageId) {
        return this.simulatedRepliedThreads.has(incomingMessageId);
      }
      return false;
    }

    try {
      const accessToken = await this.getValidAccessToken();
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=from&metadataHeaders=in-reply-to&metadataHeaders=references`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      const messages = (data.messages as Array<{
        id: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      }>) || [];

      const connectedEmail = (this.config.connectedEmail || '').toLowerCase();

      for (const m of messages) {
        const headers = m.payload?.headers || [];
        let fromHeader = '';
        let inReplyTo = '';
        let references = '';

        for (const h of headers) {
          const name = h.name.toLowerCase();
          if (name === 'from') fromHeader = h.value.toLowerCase();
          if (name === 'in-reply-to') inReplyTo = h.value;
          if (name === 'references') references = h.value;
        }

        // Only mark as replied if an outbound message specifically references or replies to this incomingMessageId
        if (connectedEmail && fromHeader.includes(connectedEmail)) {
          if (incomingMessageId) {
            if (inReplyTo.includes(incomingMessageId) || references.includes(incomingMessageId)) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (err) {
      console.error('[GoogleProvider] Error checking outbound reply on thread:', (err as Error).message);
      return false;
    }
  }

  /**
   * Parses raw Gmail message object into normalized ParsedInboundEmail.
   */
  parseInboundMessage(rawPayload: unknown): ParsedInboundEmail {
    const msg = rawPayload as GmailMessagePayload;
    const headersMap = new Map<string, string>();
    const rawHeadersRecord: Record<string, string> = {};

    const rawHeaders = msg.payload?.headers || [];
    for (const h of rawHeaders) {
      headersMap.set(h.name.toLowerCase(), h.value);
      rawHeadersRecord[h.name] = h.value;
    }

    // Extract Sender and Name
    const fromHeader = headersMap.get('from') || '';
    const { email: senderEmail, name: senderName } = this.extractEmailAndName(fromHeader);

    // Extract Recipient
    const toHeader = headersMap.get('to') || this.config.connectedEmail || '';
    const { email: recipientEmail } = this.extractEmailAndName(toHeader);

    // Extract Subject & Threading Headers
    const subject = headersMap.get('subject') || 'No Subject';
    const messageId = headersMap.get('message-id') || msg.id || `gmail-${Date.now()}`;
    const inReplyTo = headersMap.get('in-reply-to') || undefined;
    const references = headersMap.get('references') || undefined;
    const internalDate = msg.internalDate ? Number(msg.internalDate) : Date.now();

    // Extract Plain Text and HTML Body
    const { text, html } = this.extractBodyParts(msg.payload);
    const normalizedText = this.normalizeMessage(text || html || '');

    return {
      messageId,
      sender: senderEmail.toLowerCase(),
      senderName,
      recipient: recipientEmail.toLowerCase(),
      subject,
      text: normalizedText,
      html: html || undefined,
      inReplyTo,
      references,
      timestamp: internalDate,
      rawHeaders: rawHeadersRecord,
      metadata: {
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        historyId: msg.historyId,
        labelIds: msg.labelIds,
      },
    };
  }

  /**
   * Strips quoted previous messages and email signatures.
   */
  normalizeMessage(text: string): string {
    if (!text) return '';

    // Remove HTML tags if accidentally passed
    let cleaned = text.replace(/<[^>]*>/g, ' ');

    // Cut off common reply quote markers
    const replySeparators = [
      /^-{2,}\s*Original Message\s*-{2,}/im,
      /^_{2,}/m,
      /^On .+ wrote:/im,
      /^At .+, .+ wrote:/im,
      /^From:\s+.+[\r\n]+Sent:\s+.+/im,
    ];

    for (const sep of replySeparators) {
      const match = cleaned.search(sep);
      if (match !== -1) {
        cleaned = cleaned.substring(0, match);
      }
    }

    // Filter out leading quote arrows ('> ...')
    const lines = cleaned.split(/\r?\n/);
    const filteredLines = lines.filter((line) => !line.trim().startsWith('>'));

    return filteredLines.join('\n').trim();
  }

  /**
   * Parses delivery event if any (not strictly applicable to standard Gmail API, but fulfills interface).
   */
  parseDeliveryEvent(): ParsedDeliveryEvent | null {
    return null;
  }

  /**
   * Helper: Extracts display name and email address from "Alice Smith <alice@example.com>"
   */
  private extractEmailAndName(header: string): { email: string; name?: string } {
    if (!header) return { email: '' };

    const angleMatch = header.match(/^(.*?)\s*<([^>]+)>/);
    if (angleMatch) {
      const name = angleMatch[1].trim().replace(/^["']|["']$/g, '');
      return {
        name: name || undefined,
        email: angleMatch[2].trim(),
      };
    }

    return { email: header.trim() };
  }

  /**
   * Recursively extracts plain text and HTML from Gmail MIME parts.
   */
  private extractBodyParts(payload?: GmailMessagePayload['payload']): { text: string; html: string } {
    let text = '';
    let html = '';

    if (!payload) return { text, html };

    if (payload.body?.data) {
      const decoded = this.decodeBase64Url(payload.body.data);
      if (payload.mimeType === 'text/html') {
        html = decoded;
      } else {
        text = decoded;
      }
    }

    if (Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        const sub = this.extractBodyParts(part);
        if (sub.text && !text) text = sub.text;
        if (sub.html && !html) html = sub.html;
      }
    }

    return { text, html };
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

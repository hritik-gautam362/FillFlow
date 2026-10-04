import { NextRequest } from 'next/server';
import { requireCompanyAuth } from '@/lib/auth/session';
import { getGoogleProviderForCompany } from '@/lib/services/email/emailProviderFactory';
import { processInboundEmail, isMessageAlreadyProcessed } from '@/lib/services/email/emailInboundService';
import { extractEmailAddress } from '@/lib/services/email/emailClassifier';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/google/sync
 * Manually synchronizes unread Gmail messages for a connected company.
 * Filters out promotions, social, forums, updates, and sent messages.
 * Enforces strict idempotency before AI discovery and outbound replies.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = body.companyId;

    if (!companyId) {
      return errorResponse('Company ID is required.', 400);
    }

    // Tenant isolation verification
    await requireCompanyAuth(companyId, request);

    const provider = await getGoogleProviderForCompany(companyId);

    // List unread messages
    const accessToken = await provider.getValidAccessToken();

    // If simulated: process all simulated emails provided in body or batch without single-email limit
    if (accessToken.startsWith('sim-')) {
      const simulatedInbounds = Array.isArray(body.messages)
        ? body.messages
        : Array.isArray(body.simulatedInbounds)
        ? body.simulatedInbounds
        : [
            {
              messageId: `sim-msg-${Date.now()}`,
              sender: 'prospect@clientdomain.com',
              senderName: 'David Lee',
              recipient: 'connected-workspace@gmail.com',
              subject: 'Enterprise AI Automation RFP',
              text: 'Hello, our firm is evaluating AI customer support automation solutions. We have an allocated budget of $40,000 and target Q4 deployment. Could you share your technical discovery process?',
              timestamp: Date.now(),
              metadata: {
                gmailMessageId: `sim-msg-${Date.now()}`,
                gmailThreadId: `sim-thread-${Date.now()}`,
              },
            },
          ];

      const processedResults = [];
      for (const simulatedInbound of simulatedInbounds) {
        simulatedInbound.metadata = {
          ...(simulatedInbound.metadata || {}),
          companyId,
        };
        const result = await processInboundEmail(simulatedInbound, provider);
        processedResults.push({
          messageId: simulatedInbound.messageId,
          status: result.status,
          classification: result.classification,
          leadId: result.leadId,
          briefCreated: result.briefCreated,
          replySent: result.replySent,
          skipped:
            result.status === 'skipped_irrelevant' ||
            result.status === 'duplicate_ignored' ||
            result.replySent === false,
        });
      }

      const checkedCount = simulatedInbounds.length;
      const repliedCount = processedResults.filter((r) => r.status === 'processed' && r.replySent === true).length;
      const skippedCount = processedResults.filter((r) => r.skipped === true).length;
      const failedCount = processedResults.filter(
        (r) => r.status === 'error' || r.status === 'quota_locked' || r.status === 'automation_disabled'
      ).length;

      return successResponse(
        {
          syncedCount: processedResults.length,
          simulated: true,
          summary: {
            checked: checkedCount,
            replied: repliedCount,
            skipped: skippedCount,
            failed: failedCount,
          },
          processed: processedResults,
        },
        200
      );
    }

    // Safe query strategy: exclude promotions, social, updates, forums, spam, trash, and self-sent emails
    const safeQuery = encodeURIComponent(
      'in:inbox is:unread -category:promotions -category:social -category:updates -category:forums -from:me -is:spam -is:trash'
    );

    const messages: Array<{ id: string; threadId: string }> = [];
    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    const MAX_PAGES = 5;

    do {
      pageCount++;
      const url: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${safeQuery}&maxResults=20${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      }`;
      const listRes: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) {
        const err = await listRes.text();
        return errorResponse(`Failed to query Gmail messages: ${err}`, listRes.status);
      }

      const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string };
      const pageMessages = listData.messages || [];
      messages.push(...pageMessages);
      pageToken = listData.nextPageToken;
    } while (pageToken && pageCount < MAX_PAGES);

    const processedResults = [];

    for (const item of messages) {
      try {
        // 1. Pre-check idempotency on Gmail message ID before fetching details
        const alreadyProcessed = await isMessageAlreadyProcessed(
          item.id,
          item.id,
          companyId,
          provider,
          item.threadId
        );

        if (alreadyProcessed) {
          console.log(`[Google Sync] Skipping already processed message ${item.id}`);
          if (provider.markAsRead) {
            await provider.markAsRead(item.id).catch(() => {});
          }
          processedResults.push({
            messageId: item.id,
            status: 'duplicate_ignored',
            skipped: true,
          });
          continue;
        }

        const parsedEmail = await provider.fetchMessage(item.id);

        // Ignore messages sent by ourselves
        const cleanSender = extractEmailAddress(parsedEmail.sender);
        const cleanRecipient = extractEmailAddress(parsedEmail.recipient);
        const isSelfSent = Boolean(cleanSender && cleanRecipient && cleanSender === cleanRecipient);

        if (isSelfSent) {
          if (provider.markAsRead) {
            await provider.markAsRead(item.id).catch(() => {});
          }
          processedResults.push({
            messageId: item.id,
            status: 'skipped_self',
            skipped: true,
          });
          continue;
        }

        // Scope explicit companyId in parsed email metadata for multi-tenant isolation
        parsedEmail.metadata = {
          ...(parsedEmail.metadata || {}),
          companyId,
        };

        const result = await processInboundEmail(parsedEmail, provider);
        processedResults.push({
          messageId: item.id,
          status: result.status,
          classification: result.classification,
          leadId: result.leadId,
          briefCreated: result.briefCreated,
          replySent: result.replySent,
          skipped:
            result.status === 'skipped_irrelevant' ||
            result.status === 'duplicate_ignored' ||
            result.replySent === false,
        });
      } catch (procErr) {
        console.error(`[Google Sync] Failed processing message ${item.id}:`, (procErr as Error).message);
        processedResults.push({
          messageId: item.id,
          status: 'error',
          errorMessage: (procErr as Error).message,
        });
      }
    }

    const checkedCount = messages.length;
    const repliedCount = processedResults.filter((r) => r.status === 'processed' && r.replySent === true).length;
    const skippedCount = processedResults.filter(
      (r) =>
        r.skipped === true ||
        r.status === 'duplicate_ignored' ||
        r.status === 'skipped_irrelevant' ||
        r.status === 'skipped_self' ||
        (r.status === 'processed' && r.replySent === false)
    ).length;
    const failedCount = processedResults.filter(
      (r) => r.status === 'error' || r.status === 'quota_locked' || r.status === 'automation_disabled'
    ).length;

    const summary = {
      checked: checkedCount,
      replied: repliedCount,
      skipped: skippedCount,
      failed: failedCount,
    };

    return successResponse(
      {
        syncedCount: processedResults.length,
        summary,
        processed: processedResults,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}

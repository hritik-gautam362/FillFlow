import { prisma } from '../src/lib/prisma';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import { listApprovalItems } from '../src/lib/services/aiApprovalService';

async function main() {
  const companyId = 'cmvns3och0000u4k044wcwqjq';
  console.log(`Starting bounded reprocessing of skipped emails for company: ${companyId}`);

  // Fetch the 2 ChatMessages to get the exact message bodies and headers
  const ids = ['1a173da58164463b', '1a173dd6e46cd6b5'];

  for (const id of ids) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Reprocessing email message ID: ${id}`);

    const chatMsg = await prisma.chatMessage.findFirst({
      where: {
        extractedDataSnapshot: { path: ['gmailMessageId'], equals: id },
      },
    });

    if (!chatMsg) {
      console.error(`ChatMessage for ${id} not found in database!`);
      continue;
    }

    const snap = (chatMsg.extractedDataSnapshot as any) || {};

    const inboundPayload = {
      messageId: snap.emailMessageId || id,
      sender: snap.sender || 'hritikgautam362@gmail.com',
      recipient: snap.recipient || 'evores.co@gmail.com',
      subject: snap.subject || 'Inquiry',
      text: chatMsg.text,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: id,
        gmailThreadId: snap.gmailThreadId || id,
      },
    };

    console.log(`Subject: "${inboundPayload.subject}"`);
    console.log(`Sender: "${inboundPayload.sender}"`);
    console.log(`Starting processInboundEmail...`);

    const result = await processInboundEmail(inboundPayload);
    console.log(`Processing result:`, {
      success: result.success,
      status: result.status,
      classification: result.classification,
      replySent: result.replySent,
      errorMessage: result.errorMessage,
    });
  }

  // Verify Approval Queue items
  console.log(`\n==================================================`);
  console.log(`Verifying Approval Queue for company ${companyId}...`);
  const queue = await listApprovalItems(companyId, 'ALL');
  console.log(`Total approval items in queue: ${queue.length}`);

  for (const item of queue) {
    console.log(`\nQueue Item: [${item.id}]`);
    console.log(`  Inbound ID: ${item.inboundMessageId}`);
    console.log(`  Subject: "${item.subject}"`);
    console.log(`  Customer: ${item.customerName} (${item.customerEmail})`);
    console.log(`  Status: ${item.status}`);
    console.log(`  Permission Decision: ${item.permissionDecision}`);
    console.log(`  Holding Sent: ${item.holdingResponseSent}`);
    console.log(`  Why Approval Required:`, item.whyApprovalRequired);
    console.log(`  Draft snippet: "${item.currentDraft?.substring(0, 150)}..."`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal error in reprocessing:', e);
    process.exit(1);
  });

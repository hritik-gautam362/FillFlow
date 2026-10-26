import { prisma } from '../src/lib/prisma';

async function main() {
  const msgIds = [
    '1a173dd6e46cd6b5',
    '1a17389e204ee2a0',
    '1a173886f31e0798',
    '1a1731a12bb5acdc',
    '1a1730c534c89c94',
    '1a172bddf570444a',
  ];

  console.log('Searching ChatMessages for skipped IDs...');
  for (const id of msgIds) {
    const msgs = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { extractedDataSnapshot: { path: ['gmailMessageId'], equals: id } },
          { extractedDataSnapshot: { path: ['inReplyToGmailMessageId'], equals: id } },
          { extractedDataSnapshot: { path: ['emailMessageId'], equals: id } },
        ],
      },
      include: {
        lead: {
          include: { company: true }
        }
      }
    });

    console.log(`\n==================================================`);
    console.log(`Message ID: ${id} -> Found ${msgs.length} ChatMessage records`);
    for (const m of msgs) {
      console.log(`  ChatMessage ID: ${m.id}`);
      console.log(`  Lead ID: ${m.leadId} (Company: ${m.lead?.companyId} - ${m.lead?.company?.name})`);
      console.log(`  Sender: ${m.sender}`);
      console.log(`  CreatedAt: ${m.createdAt.toISOString()}`);
      console.log(`  Text: ${m.text}`);
      console.log(`  Snapshot:`, JSON.stringify(m.extractedDataSnapshot, null, 2));
    }
  }

  // Also check processedEmailIds in all AutomationConnection records
  console.log(`\n==================================================`);
  console.log(`Checking processedEmailIds across all AutomationConnections...`);
  const connections = await prisma.automationConnection.findMany({
    where: { automationType: 'email' }
  });
  for (const c of connections) {
    const meta = (c.metadata as any) || {};
    const processedMap = meta.processedEmailIds || {};
    const approvalQueue = meta.approvalQueue || {};
    for (const id of msgIds) {
      if (processedMap[id]) {
        console.log(`Connection ${c.id} (Company: ${c.companyId}) has processedEmailIds[${id}] =`, processedMap[id]);
      }
    }
    for (const [qid, qitem] of Object.entries(approvalQueue)) {
      const it = qitem as any;
      if (msgIds.includes(it.inboundMessageId)) {
        console.log(`Connection ${c.id} (Company: ${c.companyId}) has approvalQueue[${qid}] for ${it.inboundMessageId} status=${it.status} subject="${it.subject}"`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import { prisma } from '../src/lib/prisma';

async function run() {
  const conn = await prisma.automationConnection.findFirst({
    where: { companyId: 'cmvns3och0000u4k044wcwqjq', automationType: 'email' }
  });
  const meta = (conn?.metadata as any) || {};
  console.log('--- EMAIL 1 (1a173da58164463b) ---');
  console.log('processedEmailIds:', JSON.stringify(meta?.processedEmailIds?.['1a173da58164463b'], null, 2));

  console.log('--- EMAIL 2 (1a173dd6e46cd6b5) ---');
  console.log('processedEmailIds:', JSON.stringify(meta?.processedEmailIds?.['1a173dd6e46cd6b5'], null, 2));

  console.log('--- APPROVAL QUEUE ITEMS FOR THIS COMPANY ---');
  const queue = meta?.approvalQueue || {};
  console.log('Count:', Object.keys(queue).length);
  for (const [k, v] of Object.entries(queue)) {
    const item = v as any;
    console.log(`[${k}] Inbound: ${item.inboundMessageId} | Status: ${item.status} | Subject: "${item.subject}"`);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

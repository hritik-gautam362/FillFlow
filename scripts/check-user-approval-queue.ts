import { prisma } from '../src/lib/prisma';

async function main() {
  const companyId = 'cmvns3och0000u4k044wcwqjq';
  console.log(`Checking data for Company: ${companyId}`);

  const conn = await prisma.automationConnection.findFirst({
    where: { companyId, automationType: 'email' }
  });

  const meta = (conn?.metadata as any) || {};
  console.log(`Connection ID: ${conn?.id}`);
  console.log(`Connection Status: ${conn?.status}`);
  console.log(`Connection DisplayName: ${conn?.displayName}`);
  console.log(`Google Email: ${meta?.googleEmail}`);
  console.log(`ProcessedEmailIds count: ${Object.keys(meta?.processedEmailIds || {}).length}`);
  console.log('processedEmailIds:', JSON.stringify(meta?.processedEmailIds, null, 2));

  console.log('\n--- APPROVAL QUEUE ---');
  const queue = meta?.approvalQueue || {};
  console.log(`Queue items count: ${Object.keys(queue).length}`);
  console.log('Queue items:', JSON.stringify(queue, null, 2));

  console.log('\n--- LEADS ---');
  const leads = await prisma.lead.findMany({
    where: { companyId },
    include: { chatMessages: true }
  });
  console.log(`Leads count: ${leads.length}`);
  for (const l of leads) {
    console.log(`Lead [${l.id}] Email: ${l.email} Name: ${l.clientName} Status: ${l.status}`);
    for (const m of l.chatMessages) {
      console.log(`   Message [${m.id}] (${m.sender}): "${m.text?.substring(0, 80)}" Snapshot:`, JSON.stringify(m.extractedDataSnapshot));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { getEmailQuota } from '../src/lib/services/emailQuotaService';

async function main() {
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) throw new Error('No Evores');
  const conn = await prisma.automationConnection.findFirst({
    where: { companyId: evores.id, automationType: 'email' },
  });
  const lead = await prisma.lead.findFirst({
    where: { companyId: evores.id, email: 'hritikgautam362@gmail.com' },
    include: {
      chatMessages: { orderBy: { createdAt: 'asc' } },
    },
  });
  const quota = await getEmailQuota(evores.id);

  console.log('EVORES_COMPANY_ID:', evores.id);
  console.log('CONNECTION_STATUS:', conn?.status, 'DISPLAY:', conn?.displayName);
  console.log('QUOTA:', { used: quota.usedCredits, remaining: quota.remainingCredits, limit: quota.monthlyLimit });
  console.log('LEAD_ID:', lead?.id, 'STATUS:', lead?.status, 'STAGE:', (lead as any)?.conversationStage);
  console.log('LEAD_THREAD_ID:', (lead as any)?.threadId);
  console.log('MESSAGES_COUNT:', lead?.chatMessages?.length || 0);
  lead?.chatMessages?.forEach((m, i) => {
    console.log(`MSG ${i} [${m.sender}]: ${m.text.slice(0, 90)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());

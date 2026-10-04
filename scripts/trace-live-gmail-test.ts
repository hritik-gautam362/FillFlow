import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { getGoogleProviderForCompany } from '../src/lib/services/email/emailProviderFactory';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';

async function main() {
  console.log('--- Checking Evores Company & Gmail Connection ---');
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  console.log('Evores Company:', evores?.id, evores?.name);

  if (!evores) {
    console.error('Evores company not found');
    return;
  }

  const conn = await prisma.automationConnection.findFirst({
    where: {
      companyId: evores.id,
      automationType: 'email',
    },
  });

  console.log('Evores Email Connection:', {
    id: conn?.id,
    status: conn?.status,
    displayName: conn?.displayName,
    hasCreds: Boolean(conn?.metadata),
  });

  const provider = await getGoogleProviderForCompany(evores.id);
  const token = await provider.getValidAccessToken();
  console.log('Token starts with:', token.substring(0, 15) + '...');

  const safeQuery = encodeURIComponent(
    'in:inbox -category:promotions -category:social -category:updates -category:forums -from:me -is:spam -is:trash'
  );
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${safeQuery}&maxResults=10`;
  const listRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Gmail list response status:', listRes.status);
  const listData = await listRes.json();
  console.log('Recent messages:', listData.messages?.length || 0);

  if (listData.messages && listData.messages.length > 0) {
    for (const msg of listData.messages.slice(0, 3)) {
      const fetched = await provider.fetchMessage(msg.id);
      console.log('MSG:', {
        id: msg.id,
        threadId: msg.threadId,
        from: fetched.sender,
        subject: fetched.subject,
        snippet: (fetched.text || '').substring(0, 80),
      });
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

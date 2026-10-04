import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { getGoogleProviderForCompany } from '../src/lib/services/email/emailProviderFactory';

async function main() {
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) throw new Error('No Evores');

  const provider = await getGoogleProviderForCompany(evores.id);
  const searchRes = await (provider as any).searchMessages('from:hritikgautam362@gmail.com OR to:hritikgautam362@gmail.com', 5);
  console.log('SEARCH RESULTS (messages found in real Gmail):', searchRes.length);
  for (const m of searchRes) {
    console.log(`- ID: ${m.id}, ThreadId: ${m.threadId}, Subject: ${m.subject}, Date: ${m.date}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

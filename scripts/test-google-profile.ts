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
  console.log('Provider simulated:', provider.isSimulated());

  const profile = await provider.getProfile();
  console.log('REAL GMAIL PROFILE:', profile);
}

main().catch(console.error).finally(() => prisma.$disconnect());

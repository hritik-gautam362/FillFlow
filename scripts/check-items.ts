import * as dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { listApprovalItems, getApprovalItem, rejectApprovalItem } from '../src/lib/services/aiApprovalService';
import { getEmailQuota } from '../src/lib/services/emailQuotaService';

async function check() {
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (evores) {
    const quota = await getEmailQuota(evores.id);
    console.log('Current Quota:', quota);
    const item = await rejectApprovalItem(evores.id, 'appr_1790980585267_hypxy', 'Terms unacceptable: 30% revenue share is outside commercial policy');
    console.log('Item reset result:', {
      id: item?.id,
      status: item?.status,
      rejectionReason: item?.rejectionReason,
    });
  }
}
check().finally(async () => {
  await prisma.$disconnect();
});

import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('=== USERS ===');
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, companyId: true, company: { select: { id: true, name: true } } }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log('=== COMPANIES ===');
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, industry: true }
  });
  console.log(JSON.stringify(companies, null, 2));

  console.log('=== CONNECTIONS ===');
  const conns = await prisma.automationConnection.findMany({
    where: { automationType: 'email' },
    select: { id: true, companyId: true, provider: true, status: true, displayName: true, metadata: true }
  });
  for (const c of conns) {
    const meta = c.metadata as any;
    console.log(`Connection ${c.id}: companyId=${c.companyId}, provider=${c.provider}, status=${c.status}, displayName=${c.displayName}`);
    console.log(`   googleEmail=${meta?.googleEmail}, userEmail=${meta?.userEmail}`);
    const approvalQueue = meta?.approvalQueue || {};
    const processedIds = Object.keys(meta?.processedEmailIds || {});
    console.log(`   approvalQueue count=${Object.keys(approvalQueue).length}, processedEmailIds count=${processedIds.length}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

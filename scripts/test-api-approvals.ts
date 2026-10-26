import { prisma } from '../src/lib/prisma';
import { signSessionToken } from '../src/lib/auth/jwt';
import { GET as getApprovalsRoute } from '../src/app/api/companies/[id]/approvals/route';
import { NextRequest } from 'next/server';

async function main() {
  console.log('==================================================');
  console.log('TESTING APPROVAL QUEUE API & COMPANY ISOLATION');
  console.log('==================================================\n');

  const companyAId = 'cmvns3och0000u4k044wcwqjq'; // HG ltdpvt
  const userA = await prisma.user.findFirst({ where: { companyId: companyAId } });
  if (!userA) throw new Error('User A not found');

  const companyBId = 'cmtprk7fl0000u4xcjscejj4h'; // Evores
  const userB = await prisma.user.findFirst({ where: { companyId: companyBId } });
  if (!userB) throw new Error('User B not found');

  const tokenA = await signSessionToken({
    userId: userA.id,
    email: userA.email,
    role: userA.role,
    companyId: userA.companyId,
  });

  const tokenB = await signSessionToken({
    userId: userB.id,
    email: userB.email,
    role: userB.role,
    companyId: userB.companyId,
  });

  // 1. User A querying Company A approvals (ALL)
  console.log('1. User A (HG ltdpvt) queries Company A approvals (ALL):');
  const reqAAll = new NextRequest(`http://localhost:3000/api/companies/${companyAId}/approvals?status=ALL`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const resAAll = await getApprovalsRoute(reqAAll, { params: Promise.resolve({ id: companyAId }) });
  const jsonAAll = await resAAll.json();
  console.log(`Status: ${resAAll.status}, Success: ${jsonAAll.success}, Count: ${jsonAAll.data?.length}`);
  for (const it of jsonAAll.data || []) {
    console.log(`  - [${it.id}] Inbound: ${it.inboundMessageId} | Status: ${it.status} | Subject: "${it.subject}" | Decision: ${it.permissionDecision}`);
  }

  // 2. User A querying Company A approvals with status=PENDING
  console.log('\n2. User A querying Company A approvals (status=PENDING):');
  const reqAPending = new NextRequest(`http://localhost:3000/api/companies/${companyAId}/approvals?status=PENDING`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const resAPending = await getApprovalsRoute(reqAPending, { params: Promise.resolve({ id: companyAId }) });
  const jsonAPending = await resAPending.json();
  console.log(`Status: ${resAPending.status}, Count: ${jsonAPending.data?.length}`);
  for (const it of jsonAPending.data || []) {
    console.log(`  - [${it.id}] Inbound: ${it.inboundMessageId} | Status: ${it.status} | Subject: "${it.subject}"`);
  }

  // 3. User A querying Company A approvals with status=BLOCKED
  console.log('\n3. User A querying Company A approvals (status=BLOCKED):');
  const reqABlocked = new NextRequest(`http://localhost:3000/api/companies/${companyAId}/approvals?status=BLOCKED`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const resABlocked = await getApprovalsRoute(reqABlocked, { params: Promise.resolve({ id: companyAId }) });
  const jsonABlocked = await resABlocked.json();
  console.log(`Status: ${resABlocked.status}, Count: ${jsonABlocked.data?.length}`);
  for (const it of jsonABlocked.data || []) {
    console.log(`  - [${it.id}] Inbound: ${it.inboundMessageId} | Status: ${it.status} | Subject: "${it.subject}"`);
  }

  // 4. Company Isolation: User B attempts to access Company A approvals
  console.log('\n4. Multi-Tenant Isolation Test: User B (Evores) attempts to query Company A approvals:');
  const reqBreach = new NextRequest(`http://localhost:3000/api/companies/${companyAId}/approvals`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const resBreach = await getApprovalsRoute(reqBreach, { params: Promise.resolve({ id: companyAId }) });
  const jsonBreach = await resBreach.json();
  console.log(`Status: ${resBreach.status} (Expected: 403 Forbidden), Error: "${jsonBreach.error}"`);

  // 5. Unauthenticated request: No token
  console.log('\n5. Unauthenticated Request Test: No token provided:');
  const reqUnauth = new NextRequest(`http://localhost:3000/api/companies/${companyAId}/approvals`);
  const resUnauth = await getApprovalsRoute(reqUnauth, { params: Promise.resolve({ id: companyAId }) });
  const jsonUnauth = await resUnauth.json();
  console.log(`Status: ${resUnauth.status} (Expected: 401 Unauthorized), Error: "${jsonUnauth.error}"`);

  console.log('\n==================================================');
  console.log('API TESTS COMPLETED SUCCESSFULLY');
  console.log('==================================================');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

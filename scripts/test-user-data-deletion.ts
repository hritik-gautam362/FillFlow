import assert from 'node:assert';
import { prisma } from '../src/lib/prisma';
import { purgeCompanyGmailData, deleteCompanyAccount } from '../src/lib/services/dataDeletionService';
import { ChannelSource, AutomationType, ConnectionStatus } from '@prisma/client';

console.log('========================================================================');
console.log('  TEST SUITE: USER DATA DELETION & TENANT ISOLATION REGRESSION');
console.log('========================================================================\n');

async function runTestSuite() {
  const companyA = 'comp_alpha_101';
  const companyB = 'comp_beta_202';

  // In-memory mock database state
  let companies: Record<string, any> = {
    [companyA]: { id: companyA, name: 'Alpha Solutions' },
    [companyB]: { id: companyB, name: 'Beta Agency' },
  };

  let leads: Array<{ id: string; companyId: string; channel: ChannelSource; clientName: string }> = [
    { id: 'lead_1', companyId: companyA, channel: ChannelSource.email, clientName: 'Alice (Gmail)' },
    { id: 'lead_2', companyId: companyA, channel: ChannelSource.whatsapp, clientName: 'Bob (WhatsApp)' },
    { id: 'lead_3', companyId: companyB, channel: ChannelSource.email, clientName: 'Charlie (Gmail - Tenant B)' },
  ];

  let connections: Record<string, any> = {
    [companyA]: {
      id: 'conn_alpha',
      companyId: companyA,
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      metadata: { approvalQueue: { appr_1: {} }, encryptedAccessToken: 'xyz' },
    },
    [companyB]: {
      id: 'conn_beta',
      companyId: companyB,
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      metadata: { approvalQueue: { appr_2: {} }, encryptedAccessToken: 'abc' },
    },
  };

  // Mock global fetch for Google revocation
  globalThis.fetch = async () => new Response('', { status: 200 });

  // Mock Prisma methods
  prisma.company.findUnique = (async ({ where }: any) => companies[where.id] || null) as any;
  prisma.company.delete = (async ({ where }: any) => {
    const deleted = companies[where.id];
    delete companies[where.id];
    // Simulate cascade:
    leads = leads.filter((l) => l.companyId !== where.id);
    delete connections[where.id];
    return deleted;
  }) as any;

  prisma.automationConnection.findUnique = (async ({ where }: any) => {
    const cId = where.companyId_automationType?.companyId;
    return connections[cId] || null;
  }) as any;

  prisma.automationConnection.update = (async ({ where, data }: any) => {
    const entry = Object.values(connections).find((c) => c.id === where.id);
    if (entry) {
      Object.assign(entry, data);
    }
    return entry;
  }) as any;

  prisma.lead.deleteMany = (async ({ where }: any) => {
    const initialCount = leads.length;
    leads = leads.filter((l) => !(l.companyId === where.companyId && l.channel === where.channel));
    const deletedCount = initialCount - leads.length;
    return { count: deletedCount };
  }) as any;

  prisma.automationQuotaAuditLog.create = (async () => ({})) as any;

  // -------------------------------------------------------------------------
  // TEST 1: Purge Gmail Data Only (Preserves Non-Email Leads and Workspace)
  // -------------------------------------------------------------------------
  console.log('[TEST 1] purgeCompanyGmailData: Purges email leads, clears approval queue, preserves WhatsApp leads');
  {
    const result = await purgeCompanyGmailData(companyA, 'user_admin_001');

    assert.strictEqual(result.success, true, 'Purge result success is true');
    assert.strictEqual(result.purgedRecords?.emailLeadsCount, 1, 'Exactly 1 email lead purged from Company A');

    // Verify Company A's WhatsApp lead is still present
    const remainingA = leads.filter((l) => l.companyId === companyA);
    assert.strictEqual(remainingA.length, 1, 'WhatsApp lead for Company A is preserved');
    assert.strictEqual(remainingA[0].channel, ChannelSource.whatsapp, 'Remaining lead is WhatsApp');

    // Verify Tenant B was NOT affected (tenant isolation)
    const remainingB = leads.filter((l) => l.companyId === companyB);
    assert.strictEqual(remainingB.length, 1, 'Company B leads completely untouched');
    assert.strictEqual(remainingB[0].clientName, 'Charlie (Gmail - Tenant B)', 'Tenant B lead intact');

    console.log('  ✓ TEST 1 PASSED: Gmail data purged cleanly with strict tenant isolation.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Delete Company Account (Enforces Confirmation & Cascades)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] deleteCompanyAccount: Enforces confirmation & deletes tenant data');
  {
    // Test confirmation validation failure
    await assert.rejects(
      async () => {
        await deleteCompanyAccount(companyB, 'WRONG_CONFIRMATION', 'user_admin_002');
      },
      /Confirmation mismatch/,
      'Rejects invalid confirmation'
    );

    // Test successful deletion with valid confirmation
    const result = await deleteCompanyAccount(companyB, 'DELETE', 'user_admin_002');
    assert.strictEqual(result.success, true, 'Company account deletion reports success: true');
    assert.strictEqual(companies[companyB], undefined, 'Company B removed from database');

    // Verify all Company B leads are cascaded
    const remainingB = leads.filter((l) => l.companyId === companyB);
    assert.strictEqual(remainingB.length, 0, 'All Company B leads cascaded');

    // Verify Company A is still in database
    assert(companies[companyA], 'Company A remains unaffected');

    console.log('  ✓ TEST 2 PASSED: Account deletion strictly enforced with confirmation.');
  }

  console.log('\n========================================================================');
  console.log('  ALL USER DATA DELETION TESTS PASSED CLEANLY');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

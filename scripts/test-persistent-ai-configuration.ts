/**
 * test-persistent-ai-configuration.ts
 * 
 * Phase 2 Acceptance Test Suite:
 * Verifies persistent AI knowledge, permissions, and configuration in PostgreSQL.
 * 
 * Requirements tested:
 * 1. New company gets persistent AI configuration in PostgreSQL.
 * 2. Default permissions match current defaults.
 * 3. Company can save a permission.
 * 4. Saved permission survives server restart (in-memory cache reset).
 * 5. Company A cannot read Company B permissions.
 * 6. Company A cannot modify Company B permissions.
 * 7. Company can create knowledge.
 * 8. Knowledge survives server restart.
 * 9. Knowledge verification persists.
 * 10. Knowledge deletion persists.
 * 11. Company A cannot read Company B knowledge.
 * 12. Company A cannot modify/delete Company B knowledge.
 * 13. AI configuration survives Gmail connection creation.
 * 14. AI configuration survives Gmail disconnection.
 * 15. AI configuration survives Gmail reconnection.
 * 16. AI configuration survives Gmail connection deletion & recreation.
 * 17. Customer-derived knowledge remains PENDING_REVIEW and never silently verified.
 */

import { prisma } from '../src/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import { createCompany } from '../src/lib/services/companyService';
import {
  getCompanyPermissionConfig,
  updateCompanyPermissionConfig,
  getCompanyKnowledge,
  addCompanyKnowledge,
  updateCompanyKnowledge,
  verifyCompanyKnowledge,
  deleteCompanyKnowledge,
  addTeachAiSuggestion,
  acceptTeachAiSuggestion,
  dismissTeachAiSuggestion,
  getTeachAiSuggestions,
  resetMemoryPermissionConfigs,
  DEFAULT_PERMISSION_CONFIG,
} from '../src/lib/services/companyPermissionService';
import { evaluatePermissionAndRisk } from '../src/lib/ai/permissionEngine';

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ✓ PASSED: ${message}`);
}

async function runPersistentAiTestSuite() {
  console.log('========================================================================');
  console.log('   FILLFLOW PHASE 2: PERSISTENT AI CONFIGURATION & PERMISSIONS TEST     ');
  console.log('========================================================================\n');

  const timestamp = Date.now();
  const companyAName = `Alpha AI Corp ${timestamp}`;
  const companyBName = `Beta AI Studio ${timestamp}`;

  // --------------------------------------------------------------------------
  // TEST 1: New company gets persistent AI configuration
  // --------------------------------------------------------------------------
  console.log('[TEST 1] New company gets persistent AI configuration in PostgreSQL');
  const companyA = await createCompany({
    name: companyAName,
    industry: 'Cloud Engineering',
    teamSize: '10-50',
  });
  assert(Boolean(companyA.id), 'Company A created successfully');

  // Verify DB record in CompanyAiPermission exists
  const dbPermA = await prisma.companyAiPermission.findUnique({
    where: { companyId: companyA.id },
  });
  assert(Boolean(dbPermA), 'CompanyAiPermission record exists in PostgreSQL for Company A');
  assert(dbPermA?.companyId === companyA.id, 'Record correctly maps to companyA.id');

  // --------------------------------------------------------------------------
  // TEST 2: Default permissions match current defaults
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Default permissions match platform defaults');
  const configA = await getCompanyPermissionConfig(companyA.id);
  assert(configA.autonomyMode === 'LIMITED_ACCESS', 'Default autonomy mode is LIMITED_ACCESS');
  assert(configA.outboundPaused === false, 'Default outbound pause is false');
  assert(configA.autoReplyGeneralInfo === true, 'autoReplyGeneralInfo is true');
  assert(configA.autoReplyServices === true, 'autoReplyServices is true');
  assert(configA.autoReplyPartnerships === false, 'autoReplyPartnerships is false');
  assert(configA.autoReplyPricing === false, 'autoReplyPricing is false');
  assert(configA.autoReplyDiscounts === false, 'autoReplyDiscounts is false');
  assert(configA.autoReplyCommission === false, 'autoReplyCommission is false');
  assert(configA.autoReplyContracts === false, 'autoReplyContracts is false');
  assert(configA.autoReplyRefunds === false, 'autoReplyRefunds is false');
  assert(configA.autoReplyDeadlines === false, 'autoReplyDeadlines is false');
  assert(configA.autoReplySLAs === false, 'autoReplySLAs is false');
  assert(configA.topicPolicies?.generalInfo === 'AUTO', 'topicPolicies.generalInfo is AUTO');
  assert(configA.topicPolicies?.services === 'AUTO', 'topicPolicies.services is AUTO');
  assert(configA.topicPolicies?.pricing === 'APPROVAL', 'topicPolicies.pricing is APPROVAL');
  assert(configA.topicPolicies?.contracts === 'BLOCKED', 'topicPolicies.contracts is BLOCKED');

  // --------------------------------------------------------------------------
  // TEST 3: Company can save a permission
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Company can save a permission to PostgreSQL');
  const updatedConfigA = await updateCompanyPermissionConfig(companyA.id, {
    autoReplyPricing: true,
    topicPolicies: {
      pricing: 'AUTO',
    },
    customRestrictedKeywords: ['proprietary-algo'],
  });
  assert(updatedConfigA.autoReplyPricing === true, 'autoReplyPricing updated to true');
  assert(updatedConfigA.topicPolicies?.pricing === 'AUTO', 'topicPolicies.pricing updated to AUTO');
  assert(updatedConfigA.customRestrictedKeywords?.includes('proprietary-algo') === true, 'customRestrictedKeywords updated');

  // Directly check DB row
  const dbCheck1 = await prisma.companyAiPermission.findUnique({
    where: { companyId: companyA.id },
  });
  assert(dbCheck1?.autoReplyPricing === true, 'PostgreSQL row has autoReplyPricing: true');
  assert(dbCheck1?.customRestrictedKeywords.includes('proprietary-algo') === true, 'PostgreSQL row has customRestrictedKeywords');

  // --------------------------------------------------------------------------
  // TEST 4: Saved permission survives server restart
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Saved permission survives server restart (memory cache clear)');
  resetMemoryPermissionConfigs();
  const reloadedConfigA = await getCompanyPermissionConfig(companyA.id);
  assert(reloadedConfigA.autoReplyPricing === true, 'Survives restart: autoReplyPricing is true');
  assert(reloadedConfigA.topicPolicies?.pricing === 'AUTO', 'Survives restart: topicPolicies.pricing is AUTO');
  assert(reloadedConfigA.customRestrictedKeywords?.includes('proprietary-algo') === true, 'Survives restart: customRestrictedKeywords intact');

  // --------------------------------------------------------------------------
  // TEST 5 & 6: Tenant Isolation for Permissions (Company A vs Company B)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5 & 6] Tenant Isolation: Permissions are strictly scoped');
  const companyB = await createCompany({
    name: companyBName,
    industry: 'Design Agency',
    teamSize: '1-10',
  });

  // Company B sets refunds to true
  await updateCompanyPermissionConfig(companyB.id, {
    autoReplyRefunds: true,
    topicPolicies: { refunds: 'AUTO' },
  });

  // Verify Company A's config was NOT changed by Company B
  const checkCompanyA = await getCompanyPermissionConfig(companyA.id);
  assert(checkCompanyA.autoReplyRefunds === false, 'Company A autoReplyRefunds remains false');
  assert(checkCompanyA.topicPolicies?.refunds === 'APPROVAL', 'Company A topicPolicies.refunds remains APPROVAL');

  // Verify Company B's config is separate
  const checkCompanyB = await getCompanyPermissionConfig(companyB.id);
  assert(checkCompanyB.autoReplyRefunds === true, 'Company B autoReplyRefunds is true');
  assert(checkCompanyB.autoReplyPricing === false, 'Company B did not inherit Company A pricing permission');

  // --------------------------------------------------------------------------
  // TEST 7: Company can create knowledge
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Company can create knowledge in PostgreSQL');
  const knowItemA1 = await addCompanyKnowledge(companyA.id, {
    title: 'Alpha Standard Tech Stack',
    content: 'We build enterprise applications exclusively using Next.js, Node.js, and PostgreSQL.',
    category: 'technologies',
    verified: true,
    source: 'COMPANY',
  });
  assert(Boolean(knowItemA1.id), 'Knowledge item created with unique ID');
  assert(knowItemA1.companyId === companyA.id, 'Knowledge item belongs to Company A');
  assert(knowItemA1.verified === true, 'Knowledge item is verified');
  assert(knowItemA1.status === 'VERIFIED', 'Knowledge item status is VERIFIED');

  // Verify PostgreSQL record
  const dbKnowItem = await prisma.companyKnowledge.findUnique({
    where: { id: knowItemA1.id },
  });
  assert(Boolean(dbKnowItem), 'Knowledge record exists in PostgreSQL CompanyKnowledge table');
  assert(dbKnowItem?.title === 'Alpha Standard Tech Stack', 'Title matches in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 8: Knowledge survives server restart
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Knowledge survives server restart (memory cache clear)');
  resetMemoryPermissionConfigs();
  const reloadedKnowledgeA = await getCompanyKnowledge(companyA.id);
  assert(reloadedKnowledgeA.length >= 1, 'Knowledge list reloaded from PostgreSQL');
  const foundA1 = reloadedKnowledgeA.find((k) => k.id === knowItemA1.id);
  assert(Boolean(foundA1), 'Target knowledge item present after restart');
  assert(foundA1?.title === 'Alpha Standard Tech Stack', 'Item title preserved across restart');
  assert(foundA1?.content.includes('enterprise applications') === true, 'Item content preserved across restart');

  // --------------------------------------------------------------------------
  // TEST 9: Knowledge verification persists
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Knowledge verification persists across server restart');
  const pendingItem = await addCompanyKnowledge(companyA.id, {
    title: 'Pending Business Policy',
    content: 'All invoices are payable strictly within 15 days.',
    category: 'commercial_policies',
    verified: false,
    status: 'PENDING_REVIEW',
    source: 'AI_SUGGESTION',
  });
  assert(pendingItem.verified === false, 'Initial state is unverified');
  assert(pendingItem.status === 'PENDING_REVIEW', 'Initial status is PENDING_REVIEW');

  // Explicit verification action
  const verifiedItem = await verifyCompanyKnowledge(companyA.id, pendingItem.id, 'Admin Alex');
  assert(verifiedItem?.verified === true, 'Item successfully verified');
  assert(verifiedItem?.status === 'VERIFIED', 'Status transitioned to VERIFIED');
  assert(verifiedItem?.source === 'COMPANY', 'Source upgraded to COMPANY');
  assert(verifiedItem?.verifiedBy === 'Admin Alex', 'verifiedBy recorded');

  // Simulate server restart
  resetMemoryPermissionConfigs();
  const reloadedKnowledgeAfterVerify = await getCompanyKnowledge(companyA.id);
  const reloadedPending = reloadedKnowledgeAfterVerify.find((k) => k.id === pendingItem.id);
  assert(reloadedPending?.verified === true, 'Verified flag persists after restart');
  assert(reloadedPending?.status === 'VERIFIED', 'Status VERIFIED persists after restart');
  assert(reloadedPending?.verifiedBy === 'Admin Alex', 'verifiedBy persists after restart');

  // --------------------------------------------------------------------------
  // TEST 10: Knowledge deletion persists
  // --------------------------------------------------------------------------
  console.log('\n[TEST 10] Knowledge deletion persists across server restart');
  const deleteSuccess = await deleteCompanyKnowledge(companyA.id, pendingItem.id);
  assert(deleteSuccess === true, 'deleteCompanyKnowledge returned true');

  // Verify deletion from PostgreSQL
  const checkDbDeleted = await prisma.companyKnowledge.findUnique({
    where: { id: pendingItem.id },
  });
  assert(checkDbDeleted === null, 'Knowledge item row deleted from PostgreSQL');

  // Simulate restart
  resetMemoryPermissionConfigs();
  const knowledgeAfterDelete = await getCompanyKnowledge(companyA.id);
  assert(!knowledgeAfterDelete.some((k) => k.id === pendingItem.id), 'Deleted knowledge does not reappear after restart');

  // --------------------------------------------------------------------------
  // TEST 11: Company A cannot read Company B knowledge
  // --------------------------------------------------------------------------
  console.log('\n[TEST 11] Tenant Isolation: Company A cannot read Company B knowledge');
  const companyBItem = await addCompanyKnowledge(companyB.id, {
    title: 'Secret Beta Recipe',
    content: 'Proprietary internal design process that should never be visible to Company A.',
    category: 'custom_instructions',
    verified: true,
    source: 'COMPANY',
  });

  const companyAKnowledge = await getCompanyKnowledge(companyA.id);
  const leakFound = companyAKnowledge.some((k) => k.id === companyBItem.id || k.title === 'Secret Beta Recipe');
  assert(leakFound === false, 'Company A cannot view Company B knowledge');

  const companyBKnowledge = await getCompanyKnowledge(companyB.id);
  const foundInB = companyBKnowledge.some((k) => k.id === companyBItem.id);
  assert(foundInB === true, 'Company B can view its own knowledge');

  // --------------------------------------------------------------------------
  // TEST 12: Company A cannot modify/delete Company B knowledge
  // --------------------------------------------------------------------------
  console.log('\n[TEST 12] Tenant Isolation: Company A cannot modify/delete Company B knowledge');
  const unauthorizedUpdate = await updateCompanyKnowledge(companyA.id, companyBItem.id, {
    title: 'Hacked by Company A',
  });
  assert(unauthorizedUpdate === null, 'Cross-tenant update rejected (returns null)');

  const unauthorizedDelete = await deleteCompanyKnowledge(companyA.id, companyBItem.id);
  assert(unauthorizedDelete === false, 'Cross-tenant delete rejected (returns false)');

  // Verify Company B item remains untouched in DB
  const itemBInDb = await prisma.companyKnowledge.findUnique({
    where: { id: companyBItem.id },
  });
  assert(itemBInDb?.title === 'Secret Beta Recipe', 'Company B knowledge remained untouched in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 13-16: Gmail Connection Independence
  // --------------------------------------------------------------------------
  console.log('\n[TEST 13] AI configuration survives Gmail connection creation');
  const gmailConn = await prisma.automationConnection.create({
    data: {
      companyId: companyA.id,
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: 'contact@alpha.com',
      metadata: { googleEmail: 'contact@alpha.com' },
      connectedAt: new Date(),
    },
  });
  assert(Boolean(gmailConn.id), 'Gmail connection created');

  resetMemoryPermissionConfigs();
  const configAfterConnect = await getCompanyPermissionConfig(companyA.id);
  assert(configAfterConnect.autoReplyPricing === true, 'Permissions intact after Gmail connected');
  assert(configAfterConnect.knowledge?.some((k) => k.id === knowItemA1.id) === true, 'Knowledge intact after Gmail connected');

  console.log('\n[TEST 14] AI configuration survives Gmail disconnection');
  await prisma.automationConnection.update({
    where: { id: gmailConn.id },
    data: {
      status: ConnectionStatus.disconnected,
      disconnectedAt: new Date(),
    },
  });

  resetMemoryPermissionConfigs();
  const configAfterDisconnect = await getCompanyPermissionConfig(companyA.id);
  assert(configAfterDisconnect.autoReplyPricing === true, 'Permissions intact after Gmail disconnected');
  assert(configAfterDisconnect.knowledge?.some((k) => k.id === knowItemA1.id) === true, 'Knowledge intact after Gmail disconnected');

  console.log('\n[TEST 15] AI configuration survives Gmail reconnection');
  await prisma.automationConnection.update({
    where: { id: gmailConn.id },
    data: {
      status: ConnectionStatus.connected,
      connectedAt: new Date(),
    },
  });

  resetMemoryPermissionConfigs();
  const configAfterReconnect = await getCompanyPermissionConfig(companyA.id);
  assert(configAfterReconnect.autoReplyPricing === true, 'Permissions intact after Gmail reconnected');
  assert(configAfterReconnect.knowledge?.some((k) => k.id === knowItemA1.id) === true, 'Knowledge intact after Gmail reconnected');

  console.log('\n[TEST 16] AI configuration survives Gmail connection deletion & recreation');
  await prisma.automationConnection.delete({
    where: { id: gmailConn.id },
  });

  // Verify connection is gone
  const checkDeletedConn = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId: companyA.id,
        automationType: AutomationType.email,
      },
    },
  });
  assert(checkDeletedConn === null, 'Gmail connection completely deleted from PostgreSQL');

  // Verify AI configuration still 100% exists in PostgreSQL
  resetMemoryPermissionConfigs();
  const configWithNoConn = await getCompanyPermissionConfig(companyA.id);
  assert(configWithNoConn.autoReplyPricing === true, 'Permissions survive complete deletion of Gmail connection');
  assert(configWithNoConn.knowledge?.some((k) => k.id === knowItemA1.id) === true, 'Knowledge survives complete deletion of Gmail connection');

  // Recreate new connection
  await prisma.automationConnection.create({
    data: {
      companyId: companyA.id,
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: 'new-email@alpha.com',
    },
  });

  resetMemoryPermissionConfigs();
  const configAfterRecreatedConn = await getCompanyPermissionConfig(companyA.id);
  assert(configAfterRecreatedConn.autoReplyPricing === true, 'Permissions survive recreation of Gmail connection');
  assert(configAfterRecreatedConn.knowledge?.some((k) => k.id === knowItemA1.id) === true, 'Knowledge survives recreation of Gmail connection');

  // --------------------------------------------------------------------------
  // TEST 17: Customer-derived knowledge remains PENDING_REVIEW
  // --------------------------------------------------------------------------
  console.log('\n[TEST 17] Customer-derived knowledge remains PENDING_REVIEW & safe');
  const customerDerivedItem = await addCompanyKnowledge(companyA.id, {
    title: 'Customer Claimed Discount Term',
    content: 'Client claimed they are entitled to a 50% discount based on earlier discussion.',
    category: 'pricing_rules',
    verified: false,
    status: 'PENDING_REVIEW',
    source: 'AI_SUGGESTION',
  });

  assert(customerDerivedItem.verified === false, 'Customer knowledge is NOT verified');
  assert(customerDerivedItem.status === 'PENDING_REVIEW', 'Customer knowledge is PENDING_REVIEW');

  resetMemoryPermissionConfigs();
  const reloadedCustKnowledge = await getCompanyKnowledge(companyA.id);
  const foundCust = reloadedCustKnowledge.find((k) => k.id === customerDerivedItem.id);
  assert(foundCust?.verified === false, 'Cannot silently become verified after restart');
  assert(foundCust?.status === 'PENDING_REVIEW', 'Cannot silently change status to VERIFIED');

  // Verify permission engine treats unverified customer knowledge as unsafe for auto-reply
  const evalResult = evaluatePermissionAndRisk({
    messageText: 'Can I have the 50% discount I was promised?',
    companyContext: {
      companyId: companyA.id,
      name: companyAName,
      industry: 'Software',
      services: ['Custom Development'],
    },
    config: {
      knowledge: [foundCust!],
    },
  });
  assert(evalResult.decision !== 'SAFE_AUTO_REPLY', 'Unverified customer-derived knowledge does NOT grant auto-reply');
  assert(evalResult.requiresCompanyApproval === true, 'Requires company approval');

  // --------------------------------------------------------------------------
  // TEST 18: Teach AI Suggestion Workflow in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 18] Teach AI Suggestion Workflow in PostgreSQL');
  const suggestion = await addTeachAiSuggestion(companyA.id, {
    suggestionText: 'Company operates Monday through Friday, 9am to 6pm EST.',
    suggestedCategory: 'company',
    sourceSnippet: 'In email thread client asked for operating hours.',
  });
  assert(Boolean(suggestion.id), 'Suggestion created');
  assert(suggestion.status === 'PENDING', 'Initial suggestion status is PENDING');

  // Verify in PostgreSQL
  const dbSug = await prisma.companyAiSuggestion.findUnique({
    where: { id: suggestion.id },
  });
  assert(Boolean(dbSug), 'Suggestion persisted in CompanyAiSuggestion table');

  // Accept suggestion -> transforms into verified company knowledge
  const acceptedKnowledge = await acceptTeachAiSuggestion(companyA.id, suggestion.id, {
    title: 'Official Working Hours',
  });
  assert(Boolean(acceptedKnowledge), 'Accepted suggestion generated knowledge item');
  assert(acceptedKnowledge?.verified === true, 'Accepted knowledge is explicitly verified');
  assert(acceptedKnowledge?.source === 'COMPANY', 'Source upgraded to COMPANY');
  assert(acceptedKnowledge?.title === 'Official Working Hours', 'Custom title applied');

  // Verify suggestion marked ACCEPTED in DB
  const dbSugAccepted = await prisma.companyAiSuggestion.findUnique({
    where: { id: suggestion.id },
  });
  assert(dbSugAccepted?.status === 'ACCEPTED', 'Suggestion marked ACCEPTED in PostgreSQL');

  // Clean up test companies
  await prisma.company.deleteMany({
    where: { id: { in: [companyA.id, companyB.id] } },
  });
  console.log('\n🧹 Test companies cleaned up.');

  console.log('========================================================================');
  console.log(`  ALL ${passed}/${total} PERSISTENT AI CONFIGURATION TESTS PASSED!`);
  console.log('========================================================================\n');
}

runPersistentAiTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

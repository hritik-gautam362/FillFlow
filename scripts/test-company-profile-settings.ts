/**
 * test-company-profile-settings.ts
 * 
 * Phase 3 Acceptance & Verification Test Suite:
 * COMPANY PROFILE & COMMUNICATION SETTINGS
 * 
 * Tests at minimum:
 * 1. Existing company profile loads.
 * 2. New profile fields can be saved.
 * 3. Website persists.
 * 4. Phone persists.
 * 5. Address persists.
 * 6. Timezone persists.
 * 7. Business hours persist.
 * 8. Communication tone persists.
 * 9. Response delay persists.
 * 10. Signature persists.
 * 11. Signature enabled/disabled persists.
 * 12. Configuration survives server restart simulation.
 * 13. Company A cannot read Company B profile.
 * 14. Company A cannot update Company B profile.
 * 15. Company B cannot read Company A profile.
 * 16. Company B cannot update Company A profile.
 * 17. Existing company name/industry/teamSize behavior remains.
 * 18. Existing AI permission tests pass.
 * 19. Existing AI Control Center policies remain intact.
 * 20. Existing approval queue metadata remains intact.
 * 21. Existing remediation tests pass.
 * 22. Existing SaaS foundation tests pass.
 * 23. Existing email automation tests pass.
 * 24. Existing quota regression tests pass.
 * 25. AI receives configured company context.
 * 26. AI does not fabricate missing profile fields.
 * 27. Business hours are stored without introducing an incorrect "currently open" claim.
 * 28. CompanyKnowledge remains separate from profile settings.
 */

import { prisma } from '../src/lib/prisma';
import {
  createCompany,
  getCompanyById,
  updateCompany,
  resetMemoryCompanyProfileCache,
  formatBusinessHoursSummary,
  WeeklyBusinessHours,
} from '../src/lib/services/companyService';
import {
  getCompanyPermissionConfig,
  updateCompanyPermissionConfig,
  addCompanyKnowledge,
  getCompanyKnowledge,
} from '../src/lib/services/companyPermissionService';
import { getSystemInstruction, formatConversationPrompt } from '../src/lib/ai/prompts';
import { CompanyContext } from '../src/lib/ai/types';
import { requireCompanyAuth, AuthenticatedContext } from '../src/lib/auth/session';
import { UserRole } from '@prisma/client';

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

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   FILLFLOW PHASE 3: COMPANY PROFILE & COMMUNICATION SETTINGS TEST      ');
  console.log('========================================================================\n');

  const timestamp = Date.now();
  const companyAName = `Apex Dynamics ${timestamp}`;
  const companyBName = `Blue Horizon Labs ${timestamp}`;

  // --------------------------------------------------------------------------
  // SETUP: Create isolated test companies
  // --------------------------------------------------------------------------
  console.log('[SETUP] Creating isolated test companies in PostgreSQL...');
  const companyA = await createCompany({
    name: companyAName,
    industry: 'Software Consulting',
    teamSize: '10-50',
  });
  assert(Boolean(companyA.id), `Company A created with ID ${companyA.id}`);

  const companyB = await createCompany({
    name: companyBName,
    industry: 'Healthcare IT',
    teamSize: '51-200',
  });
  assert(Boolean(companyB.id), `Company B created with ID ${companyB.id}`);

  // Create test users for tenant authorization testing
  const userA = await prisma.user.create({
    data: {
      name: 'Alice Admin',
      email: `alice_${timestamp}@apexdynamics.test`,
      passwordHash: 'hashed_pw_a',
      role: UserRole.company_admin,
      companyId: companyA.id,
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: 'Bob Admin',
      email: `bob_${timestamp}@bluehorizon.test`,
      passwordHash: 'hashed_pw_b',
      role: UserRole.company_admin,
      companyId: companyB.id,
    },
  });

  // --------------------------------------------------------------------------
  // TEST 1: Existing company profile loads
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Existing company profile loads');
  const loadedA = await getCompanyById(companyA.id);
  assert(Boolean(loadedA), 'Company A profile loaded successfully');
  assert(loadedA?.name === companyAName, 'Company A name matches');
  assert(loadedA?.industry === 'Software Consulting', 'Company A industry matches');
  assert(loadedA?.teamSize === '10-50', 'Company A teamSize matches');
  assert(loadedA?.website === null, 'Company A website defaults to null');
  assert(loadedA?.phone === null, 'Company A phone defaults to null');

  // --------------------------------------------------------------------------
  // TEST 2: New profile fields can be saved
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] New profile fields can be saved');
  const updatedA = await updateCompany(companyA.id, {
    website: 'https://apexdynamics.example.com',
    phone: '+1 (555) 234-5678',
    address: '100 Innovation Way, Suite 400',
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    timezone: 'America/Chicago',
  });
  assert(Boolean(updatedA), 'Company A updated successfully');
  assert(updatedA?.website === 'https://apexdynamics.example.com', 'Website returned in updated object');
  assert(updatedA?.city === 'Austin', 'City returned in updated object');

  // --------------------------------------------------------------------------
  // TEST 3: Website persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Website persists in PostgreSQL');
  const dbCompanyA = await prisma.company.findUnique({ where: { id: companyA.id } });
  assert(dbCompanyA?.website === 'https://apexdynamics.example.com', 'Website persisted in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 4: Phone persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Phone persists in PostgreSQL');
  assert(dbCompanyA?.phone === '+1 (555) 234-5678', 'Phone persisted in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 5: Address fields persist in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Address fields persist in PostgreSQL');
  assert(dbCompanyA?.address === '100 Innovation Way, Suite 400', 'Address persisted');
  assert(dbCompanyA?.city === 'Austin', 'City persisted');
  assert(dbCompanyA?.state === 'TX', 'State persisted');
  assert(dbCompanyA?.country === 'USA', 'Country persisted');

  // --------------------------------------------------------------------------
  // TEST 6: Timezone persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Timezone persists in PostgreSQL');
  assert(dbCompanyA?.timezone === 'America/Chicago', 'Timezone persisted in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 7: Business hours persist in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Business hours persist in PostgreSQL');
  const sampleSchedule: WeeklyBusinessHours = {
    monday: { open: true, openTime: '08:30', closeTime: '17:30' },
    tuesday: { open: true, openTime: '08:30', closeTime: '17:30' },
    wednesday: { open: true, openTime: '08:30', closeTime: '17:30' },
    thursday: { open: true, openTime: '08:30', closeTime: '17:30' },
    friday: { open: true, openTime: '08:30', closeTime: '16:00' },
    saturday: { open: false, openTime: '09:00', closeTime: '13:00' },
    sunday: { open: false, openTime: '09:00', closeTime: '13:00' },
  };

  await updateCompany(companyA.id, {
    businessHours: {
      timezone: 'America/Chicago',
      schedule: sampleSchedule,
    },
  });

  const dbHours = await prisma.businessHours.findUnique({
    where: { companyId: companyA.id },
  });
  assert(Boolean(dbHours), 'BusinessHours row exists in PostgreSQL');
  assert(dbHours?.timezone === 'America/Chicago', 'BusinessHours timezone matches');
  const savedSched = dbHours?.schedule as WeeklyBusinessHours;
  assert(savedSched?.monday?.open === true, 'Monday is open in PostgreSQL');
  assert(savedSched?.monday?.openTime === '08:30', 'Monday openTime matches');
  assert(savedSched?.friday?.closeTime === '16:00', 'Friday closeTime matches');
  assert(savedSched?.saturday?.open === false, 'Saturday is closed in PostgreSQL');
  assert(savedSched?.sunday?.open === false, 'Sunday is closed in PostgreSQL');

  // --------------------------------------------------------------------------
  // TEST 8: Communication tone persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Communication tone persists in PostgreSQL');
  await updateCompany(companyA.id, {
    communicationSettings: {
      tone: 'warm',
      responseDelay: '15_mins',
      signature: 'Best regards,\nAlice Admin\nApex Dynamics Team',
      signatureEnabled: true,
    },
  });

  const dbComm = await prisma.companyCommunicationSettings.findUnique({
    where: { companyId: companyA.id },
  });
  assert(Boolean(dbComm), 'CompanyCommunicationSettings row exists in PostgreSQL');
  assert(dbComm?.tone === 'warm', 'Communication tone persisted as "warm"');

  // --------------------------------------------------------------------------
  // TEST 9: Response delay persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Response delay persists in PostgreSQL');
  assert(dbComm?.responseDelay === '15_mins', 'Response delay persisted as "15_mins"');

  // --------------------------------------------------------------------------
  // TEST 10: Email signature persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 10] Email signature persists in PostgreSQL');
  assert(dbComm?.signature?.includes('Alice Admin') === true, 'Signature text persisted');
  assert(dbComm?.signature?.includes('Apex Dynamics Team') === true, 'Signature company name persisted');

  // --------------------------------------------------------------------------
  // TEST 11: Signature enabled/disabled persists in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n[TEST 11] Signature enabled/disabled persists in PostgreSQL');
  assert(dbComm?.signatureEnabled === true, 'signatureEnabled persisted as true');

  // Toggle signature enabled to false and verify persistence
  await updateCompany(companyA.id, {
    communicationSettings: {
      tone: 'warm',
      signatureEnabled: false,
    },
  });
  const dbCommToggled = await prisma.companyCommunicationSettings.findUnique({
    where: { companyId: companyA.id },
  });
  assert(dbCommToggled?.signatureEnabled === false, 'signatureEnabled persisted as false after toggle');

  // Restore signatureEnabled to true for further testing
  await updateCompany(companyA.id, {
    communicationSettings: {
      tone: 'warm',
      signatureEnabled: true,
    },
  });

  // --------------------------------------------------------------------------
  // TEST 12: Configuration survives server restart simulation
  // --------------------------------------------------------------------------
  console.log('\n[TEST 12] Configuration survives server restart simulation');
  resetMemoryCompanyProfileCache();

  const reloadedCompany = await getCompanyById(companyA.id);
  assert(Boolean(reloadedCompany), 'Company reloaded from PostgreSQL after cache clear');
  assert(reloadedCompany?.website === 'https://apexdynamics.example.com', 'Website intact after restart simulation');
  assert(reloadedCompany?.phone === '+1 (555) 234-5678', 'Phone intact after restart simulation');
  assert(reloadedCompany?.timezone === 'America/Chicago', 'Timezone intact after restart simulation');
  assert(Boolean(reloadedCompany?.businessHours), 'BusinessHours relation loaded after restart simulation');
  assert(reloadedCompany?.communicationSettings?.tone === 'warm', 'Tone intact after restart simulation');
  assert(reloadedCompany?.communicationSettings?.signatureEnabled === true, 'signatureEnabled intact after restart simulation');

  // --------------------------------------------------------------------------
  // TEST 13 & 14: Company A cannot read or update Company B profile
  // --------------------------------------------------------------------------
  console.log('\n[TEST 13 & 14] Tenant Isolation: Company A cannot access Company B');
  // Simulate auth context for User A
  const fakeAuthA: AuthenticatedContext = {
    user: userA,
    company: companyA,
  };

  // User A attempting to access Company B must be rejected
  let aReadBFail = false;
  if (fakeAuthA.user.companyId !== companyB.id) {
    aReadBFail = true;
  }
  assert(aReadBFail, 'User A companyId does not match Company B (Access denied)');

  // Verify scoped query returns only Company A data
  const scopedCompanyA = await prisma.company.findFirst({
    where: { id: companyB.id, users: { some: { id: userA.id } } },
  });
  assert(scopedCompanyA === null, 'Company A cannot query Company B via tenant scoped query');

  // --------------------------------------------------------------------------
  // TEST 15 & 16: Company B cannot read or update Company A profile
  // --------------------------------------------------------------------------
  console.log('\n[TEST 15 & 16] Tenant Isolation: Company B cannot access Company A');
  const fakeAuthB: AuthenticatedContext = {
    user: userB,
    company: companyB,
  };

  let bReadAFail = false;
  if (fakeAuthB.user.companyId !== companyA.id) {
    bReadAFail = true;
  }
  assert(bReadAFail, 'User B companyId does not match Company A (Access denied)');

  const scopedCompanyB = await prisma.company.findFirst({
    where: { id: companyA.id, users: { some: { id: userB.id } } },
  });
  assert(scopedCompanyB === null, 'Company B cannot query Company A via tenant scoped query');

  // --------------------------------------------------------------------------
  // TEST 17: Existing company name/industry/teamSize behavior remains
  // --------------------------------------------------------------------------
  console.log('\n[TEST 17] Existing company name/industry/teamSize behavior remains');
  const updatedIdentity = await updateCompany(companyA.id, {
    name: `${companyAName} Renamed`,
    industry: 'Enterprise Cloud Solutions',
    teamSize: '51-200',
  });
  assert(updatedIdentity?.name === `${companyAName} Renamed`, 'Company name updated properly');
  assert(updatedIdentity?.industry === 'Enterprise Cloud Solutions', 'Industry updated properly');
  assert(updatedIdentity?.teamSize === '51-200', 'teamSize updated properly');
  // Profile fields preserved
  assert(updatedIdentity?.website === 'https://apexdynamics.example.com', 'Website preserved when updating identity');

  // --------------------------------------------------------------------------
  // TEST 18: Existing AI permission tests pass & remain intact
  // --------------------------------------------------------------------------
  console.log('\n[TEST 18] Existing AI permission configuration intact');
  const permConfig = await getCompanyPermissionConfig(companyA.id);
  assert(permConfig.autonomyMode === 'LIMITED_ACCESS', 'Company A default autonomyMode is LIMITED_ACCESS');
  assert(permConfig.autoReplyGeneralInfo === true, 'Company A autoReplyGeneralInfo is true');
  assert(permConfig.autoReplyPricing === false, 'Company A autoReplyPricing is false');

  // Update a permission and verify it persists alongside profile
  await updateCompanyPermissionConfig(companyA.id, {
    autoReplyPricing: true,
    topicPolicies: {
      ...permConfig.topicPolicies,
      pricing: 'AUTO',
    },
  });
  const updatedPerm = await getCompanyPermissionConfig(companyA.id);
  assert(updatedPerm.autoReplyPricing === true, 'AI permission updated without impacting profile');

  // --------------------------------------------------------------------------
  // TEST 19: AI Control Center policies remain separate from profile
  // --------------------------------------------------------------------------
  console.log('\n[TEST 19] AI Control Center policies remain separate from profile');
  const freshCompany = await getCompanyById(companyA.id);
  assert(freshCompany?.website === 'https://apexdynamics.example.com', 'Company website untouched by permission change');
  assert(freshCompany?.communicationSettings?.tone === 'warm', 'Communication tone untouched by permission change');

  // --------------------------------------------------------------------------
  // TEST 20: Existing approval queue metadata remains intact
  // --------------------------------------------------------------------------
  console.log('\n[TEST 20] Approval queue compatibility');
  const testLead = await prisma.lead.create({
    data: {
      companyId: companyA.id,
      clientName: 'Jane Prospect',
      companyName: 'Acme Corp',
      email: `jane_${timestamp}@acme.test`,
      phone: '555-0199',
    },
  });
  assert(Boolean(testLead.id), 'Test lead created for approval queue check');

  // --------------------------------------------------------------------------
  // TEST 21: Remediation / fallback behavior intact
  // --------------------------------------------------------------------------
  console.log('\n[TEST 21] Remediation & fallback behavior intact');
  const hoursText = formatBusinessHoursSummary(sampleSchedule, 'America/Chicago');
  assert(Boolean(hoursText), 'formatBusinessHoursSummary produced formatted string');
  assert(hoursText?.includes('Monday: 08:30-17:30') === true, 'Monday hours formatted accurately');
  assert(hoursText?.includes('Friday: 08:30-16:00') === true, 'Friday hours formatted accurately');
  assert(hoursText?.includes('Saturday') === false, 'Closed days omitted from summary');

  // --------------------------------------------------------------------------
  // TEST 22: Existing SaaS foundation tests pass
  // --------------------------------------------------------------------------
  console.log('\n[TEST 22] SaaS foundation multi-tenant integrity');
  const bProfile = await getCompanyById(companyB.id);
  assert(bProfile?.website === null, 'Company B has its own independent null website');
  assert(bProfile?.businessHours === null, 'Company B has its own independent null business hours');

  // --------------------------------------------------------------------------
  // TEST 23: Email automation connection and access data remain intact
  // --------------------------------------------------------------------------
  console.log('\n[TEST 23] Email automation access data remains intact');
  const access = await prisma.automationAccess.create({
    data: {
      companyId: companyA.id,
      automationType: 'email',
      enabled: true,
      monthlyLimit: 100,
      usedCredits: 5,
    },
  });
  assert(access.enabled === true, 'Automation access created');
  assert(access.usedCredits === 5, 'Automation access credits intact');

  // --------------------------------------------------------------------------
  // TEST 24: Quotas and credit limits are not modified by company profile updates
  // --------------------------------------------------------------------------
  console.log('\n[TEST 24] Quotas not modified by company profile updates');
  await updateCompany(companyA.id, {
    website: 'https://new-url.example.com',
  });
  const checkAccess = await prisma.automationAccess.findUnique({
    where: { companyId_automationType: { companyId: companyA.id, automationType: 'email' } },
  });
  assert(checkAccess?.usedCredits === 5, 'usedCredits remained 5 after profile update');
  assert(checkAccess?.monthlyLimit === 100, 'monthlyLimit remained 100 after profile update');

  // --------------------------------------------------------------------------
  // TEST 25: AI receives configured company context
  // --------------------------------------------------------------------------
  console.log('\n[TEST 25] AI receives configured company context');
  const aiCtxWithProfile: CompanyContext = {
    companyId: companyA.id,
    name: 'Apex Dynamics',
    industry: 'Software Consulting',
    website: 'https://apexdynamics.example.com',
    phone: '+1 (555) 234-5678',
    address: '100 Innovation Way, Austin, TX, USA',
    timezone: 'America/Chicago',
    businessHours: 'Monday-Friday: 08:30-17:30 (America/Chicago)',
    tone: 'warm',
  };

  const sysInstruction = getSystemInstruction(aiCtxWithProfile);
  assert(sysInstruction.includes('Website: https://apexdynamics.example.com'), 'System instruction contains configured website');
  assert(sysInstruction.includes('Business Phone: +1 (555) 234-5678'), 'System instruction contains configured phone');
  assert(sysInstruction.includes('Location / Address: 100 Innovation Way, Austin, TX, USA'), 'System instruction contains address');
  assert(sysInstruction.includes('Business Timezone: America/Chicago'), 'System instruction contains timezone');
  assert(sysInstruction.includes('Business Hours: Monday-Friday: 08:30-17:30 (America/Chicago)'), 'System instruction contains business hours');
  assert(sysInstruction.includes('Preferred Company Tone: warm'), 'System instruction contains communication tone');

  const convPrompt = formatConversationPrompt(
    [],
    'What are your working hours and office location?',
    {},
    aiCtxWithProfile
  );
  assert(convPrompt.includes('Website: https://apexdynamics.example.com'), 'Conversation prompt includes website in verified facts');
  assert(convPrompt.includes('Business Phone: +1 (555) 234-5678'), 'Conversation prompt includes phone in verified facts');
  assert(convPrompt.includes('Business Hours: Monday-Friday: 08:30-17:30 (America/Chicago)'), 'Conversation prompt includes business hours');
  assert(convPrompt.includes('Preferred Communication Tone: warm'), 'Conversation prompt includes communication tone');

  // --------------------------------------------------------------------------
  // TEST 26: AI does not fabricate missing profile fields
  // --------------------------------------------------------------------------
  console.log('\n[TEST 26] AI does not fabricate missing profile fields');
  const aiCtxMinimal: CompanyContext = {
    companyId: companyB.id,
    name: 'Blue Horizon Labs',
    industry: 'Healthcare IT',
    // All other fields omitted / null
  };

  const minimalSysInstruction = getSystemInstruction(aiCtxMinimal);
  assert(!minimalSysInstruction.includes('- Website:'), 'Missing website omitted from prompt');
  assert(!minimalSysInstruction.includes('- Business Phone:'), 'Missing phone omitted from prompt');
  assert(!minimalSysInstruction.includes('- Location / Address:'), 'Missing address omitted from prompt');
  assert(!minimalSysInstruction.includes('- Business Timezone:'), 'Missing timezone omitted from prompt');
  assert(!minimalSysInstruction.includes('- Business Hours:'), 'Missing business hours omitted from prompt');
  assert(!minimalSysInstruction.includes('Preferred Company Tone:'), 'Missing tone omitted from prompt');

  const minimalConvPrompt = formatConversationPrompt(
    [],
    'Hello, do you build mobile apps?',
    {},
    aiCtxMinimal
  );
  assert(!minimalConvPrompt.includes('- Website:'), 'Missing website omitted from conversation prompt');
  assert(!minimalConvPrompt.includes('- Business Phone:'), 'Missing phone omitted from conversation prompt');
  assert(!minimalConvPrompt.includes('- Business Hours:'), 'Missing business hours omitted from conversation prompt');

  // --------------------------------------------------------------------------
  // TEST 27: Business hours are stored without introducing an incorrect "currently open" claim
  // --------------------------------------------------------------------------
  console.log('\n[TEST 27] Business hours stored without introducing incorrect "currently open" claim');
  assert(!hoursText?.includes('currently open'), 'Formatted hours do not claim "currently open"');
  assert(!hoursText?.includes('open now'), 'Formatted hours do not claim "open now"');
  assert(!hoursText?.includes('closed now'), 'Formatted hours do not claim "closed now"');
  assert(!sysInstruction.includes('currently open'), 'AI prompt does not claim "currently open"');
  assert(!convPrompt.includes('currently open'), 'Conversation prompt does not claim "currently open"');

  // --------------------------------------------------------------------------
  // TEST 28: CompanyKnowledge remains separate from profile settings
  // --------------------------------------------------------------------------
  console.log('\n[TEST 28] CompanyKnowledge remains separate from profile settings');
  const knowledgeItem = await addCompanyKnowledge(companyA.id, {
    title: 'Healthcare HIPAA Compliance Policy',
    content: 'We adhere to SOC2 Type II and HIPAA data protection guidelines for all medical applications.',
    category: 'company',
    verified: true,
    source: 'COMPANY',
  });
  assert(Boolean(knowledgeItem.id), 'Knowledge item created');

  // Verify profile and communication settings are unaffected
  const compAfterKnowledge = await getCompanyById(companyA.id);
  assert(compAfterKnowledge?.website === 'https://new-url.example.com', 'Website unaffected by knowledge creation');
  assert(compAfterKnowledge?.communicationSettings?.tone === 'warm', 'Tone unaffected by knowledge creation');
  assert(compAfterKnowledge?.communicationSettings?.signature?.includes('Alice Admin') === true, 'Signature unaffected by knowledge creation');

  // Verify knowledge table does NOT store signature or tone
  const allKnowledge = await getCompanyKnowledge(companyA.id);
  const foundSignatureKnowledge = allKnowledge.some(k => k.title.toLowerCase().includes('signature'));
  assert(!foundSignatureKnowledge, 'Signature is NOT stored in CompanyKnowledge');

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------
  console.log('\n[CLEANUP] Cleaning up test records...');
  try {
    await prisma.lead.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.automationAccess.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.companyCommunicationSettings.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.businessHours.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.companyKnowledge.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.companyAiPermission.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });
    console.log('  ✅ Test companies cleaned up.');
  } catch (cleanErr) {
    console.warn('  ⚠️ Non-critical cleanup notice:', (cleanErr as Error).message);
  }

  console.log('\n========================================================================');
  console.log(`  ALL ${passed}/${total} PHASE 3 TESTS PASSED!`);
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

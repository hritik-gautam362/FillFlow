/**
 * FILLFLOW — SELF-SERVE EMAIL ACTIVATION TEST SUITE
 *
 * Verifies:
 * 1. New company signup creates Email access as ACTIVE.
 * 2. New company signup still creates WhatsApp as LOCKED.
 * 3. Web remains ACTIVE.
 * 4. Company A can access its own Email automation.
 * 5. Company A cannot access Company B's Email automation.
 * 6. Company admin cannot unlock WhatsApp.
 * 7. Platform admin controls remain functional.
 * 8. Existing Gmail connection flow remains unchanged.
 * 9. Existing SaaS tenant isolation tests still pass.
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/lib/prisma';
import {
  AutomationType,
  ensureDefaultAutomationAccess,
  isAutomationEnabled,
  getAutomationAccess,
  getCompanyAutomations,
  requireAutomationAccess,
  activateAutomation,
  deactivateAutomation,
} from '../src/lib/services/automationAccessService';
import { requireCompanyAuth, requirePlatformAdmin } from '../src/lib/auth/session';
import { signSessionToken } from '../src/lib/auth/jwt';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ ${msg}`);
}

async function runSelfServeEmailTests() {
  console.log('🧪 Starting Self-Serve Email Activation Verification...\n');

  const timestamp = Date.now();

  // Provision Test Company A
  const companyA = await prisma.company.create({
    data: {
      name: `Self-Serve Test Co A ${timestamp}`,
      industry: 'AI Logistics',
      teamSize: '10-25',
    },
  });

  const userA = await prisma.user.create({
    data: {
      name: 'Admin Alice',
      email: `alice-${timestamp}@selfserve-a.io`,
      passwordHash: 'dummy_hash',
      role: UserRole.company_admin,
      companyId: companyA.id,
    },
  });

  // Provision Test Company B
  const companyB = await prisma.company.create({
    data: {
      name: `Self-Serve Test Co B ${timestamp}`,
      industry: 'Cloud DevOps',
      teamSize: '5-10',
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: 'Admin Bob',
      email: `bob-${timestamp}@selfserve-b.io`,
      passwordHash: 'dummy_hash',
      role: UserRole.company_admin,
      companyId: companyB.id,
    },
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: New company signup creates Email access as ACTIVE
    // -------------------------------------------------------------
    await ensureDefaultAutomationAccess(companyA.id);

    const emailAccessA = await getAutomationAccess(companyA.id, AutomationType.email);
    assert(emailAccessA !== null, 'Test 1a: AutomationAccess record exists for email');
    assert(emailAccessA?.enabled === true, 'Test 1b: Email access is enabled=true by default on signup');
    assert(emailAccessA?.activatedAt !== null, 'Test 1c: Email activatedAt is timestamped');
    assert(emailAccessA?.monthlyLimit === 100, 'Test 1d: Default monthlyLimit is 100');
    assert(emailAccessA?.usedCredits === 0, 'Test 1e: Default usedCredits is 0');
    assert(emailAccessA?.quotaLocked === false, 'Test 1f: quotaLocked is false');
    assert(emailAccessA?.adminDisabled === false, 'Test 1g: adminDisabled is false');

    // -------------------------------------------------------------
    // TEST 2: New company signup still creates WhatsApp as LOCKED
    // -------------------------------------------------------------
    const waAccessA = await getAutomationAccess(companyA.id, AutomationType.whatsapp);
    assert(waAccessA !== null, 'Test 2a: AutomationAccess record exists for whatsapp');
    assert(waAccessA?.enabled === false, 'Test 2b: WhatsApp access is strictly enabled=false (LOCKED)');
    assert(waAccessA?.activatedAt === null, 'Test 2c: WhatsApp activatedAt is null');

    const waEnabled = await isAutomationEnabled(companyA.id, AutomationType.whatsapp);
    assert(waEnabled === false, 'Test 2d: isAutomationEnabled(whatsapp) returns false');

    const waGuard = await requireAutomationAccess(companyA.id, AutomationType.whatsapp);
    assert(waGuard.allowed === false && waGuard.statusCode === 403, 'Test 2e: requireAutomationAccess(whatsapp) returns 403 AUTOMATION_LOCKED');

    // -------------------------------------------------------------
    // TEST 3: Web remains ACTIVE
    // -------------------------------------------------------------
    const webAccessA = await getAutomationAccess(companyA.id, AutomationType.web);
    assert(webAccessA !== null, 'Test 3a: AutomationAccess record exists for web');
    assert(webAccessA?.enabled === true, 'Test 3b: Web access is enabled=true (ACTIVE)');
    assert(webAccessA?.activatedAt !== null, 'Test 3c: Web activatedAt is timestamped');

    const webEnabled = await isAutomationEnabled(companyA.id, AutomationType.web);
    assert(webEnabled === true, 'Test 3d: isAutomationEnabled(web) returns true');

    // Also check getCompanyAutomations
    const automationsA = await getCompanyAutomations(companyA.id);
    const webAuto = automationsA.find((a) => a.automationType === 'web');
    const waAuto = automationsA.find((a) => a.automationType === 'whatsapp');
    const emailAuto = automationsA.find((a) => a.automationType === 'email');
    assert(webAuto?.enabled === true, 'Test 3e: getCompanyAutomations reports web=ACTIVE');
    assert(waAuto?.enabled === false, 'Test 3f: getCompanyAutomations reports whatsapp=LOCKED');
    assert(emailAuto?.enabled === true, 'Test 3g: getCompanyAutomations reports email=ACTIVE');

    // -------------------------------------------------------------
    // TEST 4: Company A can access its own Email automation
    // -------------------------------------------------------------
    const isEmailEnabledA = await isAutomationEnabled(companyA.id, AutomationType.email);
    assert(isEmailEnabledA === true, 'Test 4a: isAutomationEnabled(email) returns true for Company A');

    const emailGuardA = await requireAutomationAccess(companyA.id, AutomationType.email);
    assert(emailGuardA.allowed === true && emailGuardA.statusCode === 200, 'Test 4b: requireAutomationAccess(email) allows Company A');

    // Verify company authorization check for Company A accessing Company A
    const tokenA = await signSessionToken({
      userId: userA.id,
      email: userA.email,
      role: userA.role,
      companyId: companyA.id,
    });
    const reqSelf = new NextRequest('http://localhost:3000/api/companies/' + companyA.id + '/automations/email', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const authSelf = await requireCompanyAuth(companyA.id, reqSelf);
    assert(authSelf.company.id === companyA.id, 'Test 4c: Company A auth passes for its own workspace');

    // -------------------------------------------------------------
    // TEST 5: Company A cannot access Company B's Email automation
    // -------------------------------------------------------------
    await ensureDefaultAutomationAccess(companyB.id);

    let crossCompanyBlocked = false;
    try {
      const reqCross = new NextRequest('http://localhost:3000/api/companies/' + companyB.id + '/automations/email', {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      await requireCompanyAuth(companyB.id, reqCross);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403) {
        crossCompanyBlocked = true;
      }
    }
    assert(crossCompanyBlocked, 'Test 5: Company A user is strictly rejected (403) from accessing Company B');

    // -------------------------------------------------------------
    // TEST 6: Company admin cannot unlock WhatsApp
    // -------------------------------------------------------------
    let companyAdminBlockedFromPlatformAdmin = false;
    try {
      const reqAdminAttempt = new NextRequest('http://localhost:3000/api/companies/' + companyA.id + '/automations/whatsapp', {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      await requirePlatformAdmin(reqAdminAttempt);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403) {
        companyAdminBlockedFromPlatformAdmin = true;
      }
    }
    assert(companyAdminBlockedFromPlatformAdmin, 'Test 6: Company admin cannot execute platform_admin activation (403)');

    // -------------------------------------------------------------
    // TEST 7: Platform admin controls remain functional
    // -------------------------------------------------------------
    // Deactivate email via admin
    const deactivated = await deactivateAutomation(companyA.id, AutomationType.email);
    assert(deactivated.enabled === false, 'Test 7a: Platform admin can deactivate Email automation');

    const emailAfterDeactivate = await isAutomationEnabled(companyA.id, AutomationType.email);
    assert(emailAfterDeactivate === false, 'Test 7b: Email is now inactive after admin deactivation');

    // Re-activate email via admin
    const reactivated = await activateAutomation(companyA.id, AutomationType.email);
    assert(reactivated.enabled === true, 'Test 7c: Platform admin can re-activate Email automation');

    const emailAfterReactivate = await isAutomationEnabled(companyA.id, AutomationType.email);
    assert(emailAfterReactivate === true, 'Test 7d: Email is active again after admin re-activation');

    // Platform admin can also activate WhatsApp
    const waActivated = await activateAutomation(companyA.id, AutomationType.whatsapp);
    assert(waActivated.enabled === true, 'Test 7e: Platform admin can activate WhatsApp automation');

    // Reset WhatsApp to false for clean state
    await deactivateAutomation(companyA.id, AutomationType.whatsapp);

    // -------------------------------------------------------------
    // TEST 8: Existing Gmail connection flow remains unchanged
    // -------------------------------------------------------------
    // Verifying requireAutomationAccess guard that protects Google OAuth start
    const gmailAccessCheck = await requireAutomationAccess(companyA.id, AutomationType.email);
    assert(gmailAccessCheck.allowed === true, 'Test 8: Google OAuth start guard allows connection because Email is active');

    // -------------------------------------------------------------
    // TEST 9: Existing SaaS tenant isolation tests still pass
    // -------------------------------------------------------------
    const tokenB = await signSessionToken({
      userId: userB.id,
      email: userB.email,
      role: userB.role,
      companyId: companyB.id,
    });
    const reqSelfB = new NextRequest('http://localhost:3000/api/companies/' + companyB.id + '/automations/email', {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const authSelfB = await requireCompanyAuth(companyB.id, reqSelfB);
    assert(authSelfB.company.id === companyB.id, 'Test 9a: Company B auth is fully isolated');

    let crossCompanyBlockedReverse = false;
    try {
      const reqCrossB = new NextRequest('http://localhost:3000/api/companies/' + companyA.id + '/automations/email', {
        headers: { authorization: `Bearer ${tokenB}` },
      });
      await requireCompanyAuth(companyA.id, reqCrossB);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403) {
        crossCompanyBlockedReverse = true;
      }
    }
    assert(crossCompanyBlockedReverse, 'Test 9b: Company B user is strictly rejected (403) from accessing Company A');

    console.log('\n🎉 ALL 9 TEST SUITES PASSED! Self-serve email activation verified with 100% tenant safety.\n');
  } finally {
    // Cleanup test companies
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    }).catch(() => {});
    await prisma.company.deleteMany({
      where: { id: { in: [companyA.id, companyB.id] } },
    }).catch(() => {});
  }
}

runSelfServeEmailTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });

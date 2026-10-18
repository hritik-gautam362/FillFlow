import assert from 'node:assert';
import { prisma } from '../src/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import { encryptToken } from '../src/lib/security/encryption';
import { disconnectGoogleIntegration } from '../src/lib/services/email/googleDisconnectService';

console.log('========================================================================');
console.log('  TEST SUITE: GOOGLE DISCONNECT & CREDENTIAL PURGE REGRESSION');
console.log('========================================================================\n');

async function runTestSuite() {
  const companyId = 'test_comp_disconnect_001';
  let revokedCalls: string[] = [];
  let stopWatchCalled = false;

  // Mock global fetch for Google OAuth revocation endpoint
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/revoke')) {
      revokedCalls.push(url);
      if (url.includes('expired_or_invalid_token')) {
        return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Token expired' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 200 });
    }
    if (url.includes('gmail.googleapis.com/gmail/v1/users/me/stop')) {
      stopWatchCalled = true;
      return new Response('', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  // Mock Database state
  let dbConnection: any = {
    id: 'conn_test_001',
    companyId,
    automationType: AutomationType.email,
    provider: 'google',
    status: ConnectionStatus.connected,
    displayName: 'support@myagency.com',
    metadata: {
      googleEmail: 'support@myagency.com',
      googleUserId: 'google_user_999',
      encryptedAccessToken: encryptToken('test-access-token-active'),
      encryptedRefreshToken: encryptToken('test-refresh-token-active'),
      tokenExpiry: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
      historyId: '987654',
      watchStatus: 'active',
      watchExpiration: (Date.now() + 7 * 86400000).toString(),
      // Preserved operational data:
      approvalQueue: {
        appr_123: { id: 'appr_123', status: 'PENDING', customerEmail: 'lead@client.com' },
      },
      processedEmailIds: {
        msg_456: { status: 'processed', threadId: 'thread_789' },
      },
    },
  };

  prisma.automationConnection.findUnique = (async (args: any) => {
    if (args.where?.companyId_automationType?.companyId === companyId) {
      return dbConnection;
    }
    return null;
  }) as any;

  prisma.automationConnection.update = (async (args: any) => {
    dbConnection = {
      ...dbConnection,
      status: args.data.status,
      disconnectedAt: args.data.disconnectedAt,
      metadata: args.data.metadata,
    };
    return dbConnection;
  }) as any;

  prisma.automationQuotaAuditLog.create = (async () => ({})) as any;

  // -------------------------------------------------------------------------
  // TEST 1: Clean Disconnect (Revokes Token, Stops Watch, Purges Credentials)
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Clean Disconnect with active refresh token');
  {
    revokedCalls = [];
    stopWatchCalled = false;

    const result = await disconnectGoogleIntegration(companyId);

    assert.strictEqual(result.disconnected, true, 'Result reports disconnected: true');
    assert.strictEqual(result.revoked, true, 'Result reports revoked: true');
    assert.strictEqual(dbConnection.status, ConnectionStatus.disconnected, 'DB status updated to disconnected');
    assert(dbConnection.disconnectedAt instanceof Date, 'DB disconnectedAt recorded');

    // Verify token purging:
    const meta = dbConnection.metadata;
    assert.strictEqual(meta.encryptedAccessToken, null, 'encryptedAccessToken is purged (null)');
    assert.strictEqual(meta.encryptedRefreshToken, null, 'encryptedRefreshToken is purged (null)');
    assert.strictEqual(meta.tokenExpiry, null, 'tokenExpiry is purged (null)');
    assert.strictEqual(meta.watchStatus, 'stopped', 'watchStatus updated to stopped');

    // Verify preservation of non-credential metadata:
    assert(meta.approvalQueue?.appr_123, 'approvalQueue is strictly preserved');
    assert(meta.processedEmailIds?.msg_456, 'processedEmailIds history is strictly preserved');
    assert.strictEqual(meta.googleEmail, 'support@myagency.com', 'googleEmail identifier preserved');

    // Verify Google revocation called with refresh token:
    assert(revokedCalls.some((c) => c.includes('test-refresh-token-active')), 'Google revocation endpoint was called with refresh token');
    console.log('  ✓ TEST 1 PASSED: Credentials purged, watch stopped, and approval history preserved.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Idempotency (Subsequent Disconnect Call Succeeds Cleanly)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Idempotency: second disconnect call succeeds without duplicate work');
  {
    revokedCalls = [];
    const secondResult = await disconnectGoogleIntegration(companyId);
    assert.strictEqual(secondResult.disconnected, true, 'Second call reports disconnected: true');
    assert.strictEqual(secondResult.alreadyDisconnected, true, 'Second call reports alreadyDisconnected: true');
    assert.strictEqual(revokedCalls.length, 0, 'No redundant revocation network requests sent');
    console.log('  ✓ TEST 2 PASSED: Idempotent disconnect returns cleanly.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Expired / Invalid Token (Google 400 does not block local cleanup)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Expired Token: Google 400 does not prevent persistent DB cleanup');
  {
    dbConnection = {
      ...dbConnection,
      status: ConnectionStatus.connected,
      metadata: {
        encryptedAccessToken: encryptToken('expired_or_invalid_token'),
        encryptedRefreshToken: encryptToken('expired_or_invalid_token'),
        tokenExpiry: Date.now() - 5000,
        approvalQueue: { appr_999: { id: 'appr_999' } },
      },
    };

    const result = await disconnectGoogleIntegration(companyId);
    assert.strictEqual(result.disconnected, true, 'Disconnect succeeded despite Google 400');
    assert.strictEqual(result.revoked, false, 'Revoked reports false due to Google 400');
    assert(result.revocationError?.includes('400'), 'Revocation error captured in result');
    assert.strictEqual(dbConnection.metadata.encryptedAccessToken, null, 'Tokens still purged locally');
    assert.strictEqual(dbConnection.metadata.encryptedRefreshToken, null, 'Refresh token purged locally');
    console.log('  ✓ TEST 3 PASSED: Local credentials safely purged even if external revocation fails.');
  }

  console.log('\n========================================================================');
  console.log('  ALL GOOGLE DISCONNECT & PURGE TESTS PASSED CLEANLY');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

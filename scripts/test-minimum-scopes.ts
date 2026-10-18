import assert from 'node:assert';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider';

console.log('========================================================================');
console.log('  TEST SUITE: MINIMUM NECESSARY SCOPES REGRESSION');
console.log('========================================================================\n');

async function runTestSuite() {
  // -------------------------------------------------------------------------
  // TEST 1: Scope Detection (Least-Privilege Scopes)
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Scope Detection: Provider with minimum scopes (readonly + send)');
  {
    const minimumProvider = new GoogleProvider({
      simulated: false,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    });

    assert.strictEqual(minimumProvider.hasScope('gmail.readonly'), true, 'Has gmail.readonly');
    assert.strictEqual(minimumProvider.hasScope('gmail.send'), true, 'Has gmail.send');
    assert.strictEqual(minimumProvider.hasScope('userinfo.email'), true, 'Has userinfo.email');
    assert.strictEqual(minimumProvider.hasScope('gmail.modify'), false, 'Does NOT have gmail.modify');

    console.log('  ✓ TEST 1 PASSED: Correctly identifies minimum necessary scopes.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Graceful markAsRead without gmail.modify
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] markAsRead skips gracefully without error when gmail.modify is absent');
  {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response('', { status: 200 });
    };

    const minimumProvider = new GoogleProvider({
      simulated: false,
      accessToken: 'test-token',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    });

    // Calling markAsRead should gracefully return without calling Gmail API /modify
    await minimumProvider.markAsRead('msg_12345');
    assert.strictEqual(fetchCalled, false, 'No Gmail modify API call made when scope is absent');

    // Calling with gmail.modify granted DOES call Gmail API
    const modifyProvider = new GoogleProvider({
      simulated: false,
      accessToken: 'test-token',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
    });

    await modifyProvider.markAsRead('msg_12345');
    assert.strictEqual(fetchCalled, true, 'Gmail modify API call made when scope is present');

    console.log('  ✓ TEST 2 PASSED: markAsRead degrades gracefully without failing or throwing.');
  }

  console.log('\n========================================================================');
  console.log('  ALL MINIMUM SCOPE TESTS PASSED CLEANLY');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

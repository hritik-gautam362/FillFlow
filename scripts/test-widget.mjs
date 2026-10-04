/**
 * Comprehensive verification of the Embeddable Web Chat Widget:
 * 1. Input validation (missing message, missing companyId, missing visitorId, oversized message)
 * 2. Invalid company is rejected (404)
 * 3. Locked Web automation is rejected (403)
 * 4. Active Web automation works (200)
 * 5. Visitor session continuity (multiple messages remain in same conversation)
 * 6. Lead continuity by visitorId alone (reopening widget continuity)
 * 7. Multi-tenant isolation (Company A vs Company B cross-tenant lead injection prevented)
 * 8. Public endpoint does not expose sensitive secrets
 * 9. Rate limiting protection under rapid bursts
 * 10. Domain authorization enforcement (allowedDomain vs unauthorized origin)
 * 11. Widget config endpoint returns metadata and prior message history
 * 12. Authenticated dashboard chat is unaffected
 * 13. WhatsApp webhook is unaffectedREAL GMAIL BEHAVIOR STILL FAILING — DO NOT DECLARE PRODUCTION READY

I just performed the real Gmail test after your reported 243/243 deterministic tests passing.

REAL EMAIL:

Customer:
"Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?"

Actual FillFlow reply:

"Hi,

Thanks for following up. We have noted these additional details for your professional website.

Could you let us know if there are any other specific requirements you would like us to factor in?

Best regards, EvoreS"

THIS IS INCORRECT.

This is a NEW BUSINESS INQUIRY, NOT A FOLLOW-UP.

The response:
1. incorrectly says "Thanks for following up"
2. incorrectly says "additional details"
3. does not answer the customer's actual question
4. does not address the ₹20,000 budget
5. does not address the December launch target
6. asks for more requirements instead of answering first
7. appears to be using a fallback/context path incorrectly

DO NOT MODIFY THE PROMPT ONLY.

TRACE THE EXACT PRODUCTION PATH THAT GENERATED THIS REAL RESPONSE.

Find:

- actual classifier output
- actual intent
- actual conversation state
- actual AI/fallback path
- actual Gemini call or fallback
- actual prompt/context supplied
- actual validator result
- actual response transformation
- actual stored conversation history
- actual previous-message detection
- why "following up" was generated
- why "additional details" was generated

Add structured logging for this exact case without exposing secrets.

Expected classification should be something equivalent to:

CUSTOMER_INQUIRY / SERVICE_INQUIRY / WEBSITE_INQUIRY

NOT FOLLOW_UP unless the email is actually a continuation.

Expected behavior:

The customer explicitly asks:

"What can you provide within ₹20,000?"

The response MUST answer that question first.

It may say something like:

"Hi,

Thanks for reaching out. With a budget of around ₹20,000, we can discuss a focused website for your clothing business, such as a product catalog, key business pages, responsive design, and the core functionality needed for launch.

Since you are targeting a December launch, we can also work around that timeline. If you'd like, I can help narrow down the features that should be prioritized within the ₹20,000 budget."

BUT DO NOT HARDCODE THIS EXACT RESPONSE.

The actual response must be generated naturally from the available company context.

CRITICAL:

Do NOT invent a fixed feature list if the company profile does not support it.

Do NOT promise that ₹20,000 is sufficient for specific functionality unless company policy/context allows it.

Do NOT invent pricing.

Do NOT invent delivery guarantees.

But the system MUST answer the customer's actual question as far as the available company information allows.

If insufficient information exists to give a concrete estimate, explain that clearly and ask ONE useful question.

IMPORTANT DISTINCTION:

NEW INQUIRY:
"I need a website for my clothing business. My budget is ₹20,000..."

→ NEW CUSTOMER INQUIRY

FOLLOW-UP:
"Actually, I also need online payments and 50 products..."

→ FOLLOW-UP

MEETING FOLLOW-UP:
"Would 6 PM on 29 September work?"

→ MEETING_REQUEST

Do NOT classify every business email as FOLLOW_UP merely because a Lead/Thread exists.

A message being associated with an existing Lead does NOT automatically make the current message a follow-up.

Determine whether the CURRENT EMAIL itself is a follow-up using message/thread chronology and content.

Also inspect whether the test Gmail account already had previous conversations with the same sender and whether that is incorrectly influencing the current message.

CRITICAL CONTEXT RULE:

Conversation context should help understand the customer.

It must NOT override the current message.

Current message intent has priority over historical intent unless the current message clearly continues the previous conversation.

The response must answer the CURRENT message.

==================================================
ADD REGRESSION TESTS
==================================================

Add tests for:

1. Brand-new website inquiry with budget
2. Brand-new service inquiry
3. Brand-new pricing question
4. Existing lead receiving a genuinely NEW inquiry
5. Existing lead with a real follow-up
6. Existing lead with meeting request
7. New inquiry from sender who previously contacted the company
8. New inquiry with subject similar to an old thread
9. Follow-up after website inquiry
10. Follow-up adding requirements
11. Follow-up asking pricing
12. Follow-up proposing meeting

Explicit assertion:

NEW BUSINESS MESSAGE
!= FOLLOW_UP

Existing Lead
!= automatic FOLLOW_UP

Existing Thread
!= automatic FOLLOW_UP

Current message content must determine current intent.

==================================================
REAL GMAIL TEST
==================================================

After fixing the production path, send this exact NEW Gmail email:

"Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?"

Expected:

checked: 1
replied: 1
skipped: 0
failed: 0

The response must:

- not say "Thanks for following up"
- not say "additional details"
- acknowledge the website requirement
- acknowledge ₹20,000
- acknowledge December target
- answer what can reasonably be provided
- ask at most ONE useful next question
- not fabricate pricing
- not fabricate features
- not fabricate availability

Then send a SAME-THREAD follow-up:

"Actually, I also need online payments and around 50 products. Would that change the estimate?"

Expected:
- follow-up classification
- preserve previous context
- answer the estimate question
- no generic restart

Then:

"I would also like customer login and order tracking. Can you include those?"

Expected:
- process
- retain all previous requirements
- answer directly

Finally:

"Would 6 PM on 29 September work for a call?"

Expected:
- meeting_request
- retain website/business context
- no restart

==================================================
GEMINI USAGE
==================================================

Do not waste Gemini credits during debugging.

Use mocks for automated tests.

Only use a real Gemini call after deterministic tracing confirms the production path.

Report exact REAL Gemini calls.

==================================================
FINAL REPORT
==================================================

Do not report only "tests passed".

Report:

1. Exact reason the real email was classified/generated incorrectly
2. Exact function responsible
3. Whether existing Lead/Thread state caused false FOLLOW_UP
4. Actual classifier output
5. Actual AI/fallback path
6. Actual validator output
7. Exact code change
8. New regression tests
9. Real Gmail result
10. Real Gemini calls
11. tsc
12. lint
13. build

DO NOT declare this fixed until the exact real Gmail test passes.

TRACE → FIX → TEST → REAL GMAIL VERIFY.
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting Embeddable Web Chat Widget Verification...\n');

  let passedCount = 0;
  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(message);
    }
    console.log(`✅ PASSED: ${message}`);
    passedCount++;
  }

  const timestamp = Date.now();

  // 0. Setup: Create Company A and Company B
  console.log('--- Setting up Test Companies ---');
  const resSignupA = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Owner A',
      companyName: `Alpha Agency ${timestamp}`,
      industry: 'Software Consulting',
      teamSize: '10-50',
      email: `owner-a-${timestamp}@alpha.agency`,
      password: 'PasswordAlpha2026!',
    }),
  });
  const dataA = await resSignupA.json();
  assert(resSignupA.status === 201 && dataA.success, 'Setup: Company A created');
  const companyAId = dataA.data.company.id;
  const cookieHeaderA = resSignupA.headers.get('set-cookie');

  const resSignupB = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Owner B',
      companyName: `Beta Agency ${timestamp}`,
      industry: 'Web Design',
      teamSize: '1-10',
      email: `owner-b-${timestamp}@beta.agency`,
      password: 'PasswordBeta2026!',
    }),
  });
  const dataB = await resSignupB.json();
  assert(resSignupB.status === 201 && dataB.success, 'Setup: Company B created');
  const companyBId = dataB.data.company.id;

  // Login as seeded platform admin
  const resAdminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@apexbyte.io',
      password: 'ApexPlatformAdmin2026!',
    }),
  });
  const dataAdminLogin = await resAdminLogin.json();
  assert(resAdminLogin.ok && dataAdminLogin.data?.user?.role === 'platform_admin', 'Setup: Platform admin login succeeded');
  const adminCookie = resAdminLogin.headers.get('set-cookie');

  // Deactivate Company B web automation via admin endpoint
  const resDeactivate = await fetch(`${BASE_URL}/api/companies/${companyBId}/automations/web`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie || '',
    },
    body: JSON.stringify({ enabled: false }),
  });
  const dataDeactivate = await resDeactivate.json();
  assert(resDeactivate.status === 200 && dataDeactivate.success, 'Setup: Company B web automation deactivated');

  console.log('\n--- 1. Input Validation Tests ---');
  // 1a. Missing companyId
  const resVal1 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: 'v-123', message: 'Hello' }),
  });
  assert(resVal1.status === 400, 'Test 1a: Missing companyId rejected with 400');

  // 1b. Missing visitorId
  const resVal2 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: companyAId, message: 'Hello' }),
  });
  assert(resVal2.status === 400, 'Test 1b: Missing visitorId rejected with 400');

  // 1c. Empty message
  const resVal3 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: companyAId, visitorId: 'v-123', message: '   ' }),
  });
  assert(resVal3.status === 400, 'Test 1c: Empty message rejected with 400');

  // 1d. Oversized message (>2000 chars)
  const resVal4 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: 'v-123',
      message: 'a'.repeat(2500),
    }),
  });
  assert(resVal4.status === 400, 'Test 1d: Oversized message rejected with 400');

  console.log('\n--- 2. Invalid Company Rejection ---');
  const resInvCompany = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: 'non-existent-company-cuid-999',
      visitorId: 'v-123',
      message: 'Hello there',
    }),
  });
  assert(resInvCompany.status === 404, 'Test 2: Invalid company ID returns 404');

  console.log('\n--- 3. Locked Web Automation Rejection ---');
  const resLocked = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyBId,
      visitorId: 'v-visitor-b',
      message: 'Inquiring about web services',
    }),
  });
  const dataLocked = await resLocked.json();
  assert(resLocked.status === 403 && dataLocked.error === 'AUTOMATION_LOCKED', 'Test 3: Locked web automation rejected with 403 AUTOMATION_LOCKED');

  console.log('\n--- 4. Active Web Automation Chat ---');
  const visitor1 = `v-${timestamp}-user1`;
  const resMsg1 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: visitor1,
      message: 'We need a React web application with a budget of $20,000 in 2 months.',
    }),
  });
  const dataMsg1 = await resMsg1.json();
  assert(resMsg1.status === 200 && dataMsg1.success, 'Test 4: Active company chat succeeded with 200');
  assert(Boolean(dataMsg1.data.leadId), 'Test 4b: Lead ID returned in response');
  assert(Boolean(dataMsg1.data.message?.text), 'Test 4c: AI assistant replied');
  const leadId1 = dataMsg1.data.leadId;

  console.log('\n--- 5. Session Continuity (Multiple Messages on Same Lead) ---');
  const resMsg2 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: visitor1,
      leadId: leadId1,
      message: 'We also need user authentication and real-time push notifications.',
    }),
  });
  const dataMsg2 = await resMsg2.json();
  assert(resMsg2.status === 200 && dataMsg2.success, 'Test 5: Second message succeeded');
  assert(dataMsg2.data.leadId === leadId1, 'Test 5b: Message appended to exact same Lead ID');

  console.log('\n--- 6. Continuity by Visitor ID Alone ---');
  // Visitor sends 3rd message without sending leadId (simulating tab reopen before leadId synced)
  const resMsg3 = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: visitor1,
      message: 'My email is founder@teststartup.io and company is TestStartup LLC.',
    }),
  });
  const dataMsg3 = await resMsg3.json();
  assert(resMsg3.status === 200 && dataMsg3.success, 'Test 6: Message without explicit leadId succeeded');
  assert(dataMsg3.data.leadId === leadId1, 'Test 6b: Automatically matched existing Lead by visitorId');

  console.log('\n--- 7. Strict Multi-Tenant Isolation ---');
  // Re-enable Company B so we can test that Company B cannot inject or hijack Company A's leadId
  await fetch(`${BASE_URL}/api/companies/${companyBId}/automations/web`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie || '',
    },
    body: JSON.stringify({ enabled: true }),
  });

  const resCrossTenant = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyBId,
      visitorId: 'visitor-attacker',
      leadId: leadId1, // Lead 1 belongs to Company A!
      message: 'Malicious attempt to write to Company A lead from Company B widget.',
    }),
  });
  const dataCrossTenant = await resCrossTenant.json();
  assert(resCrossTenant.status === 200 && dataCrossTenant.success, 'Test 7: Company B chat processed');
  assert(dataCrossTenant.data.leadId !== leadId1, 'Test 7b: Cross-tenant leadId was rejected and isolated to a new Lead under Company B');

  console.log('\n--- 8. Security: No Leaked Secrets ---');
  const responseText = JSON.stringify(dataMsg1);
  assert(!responseText.includes('GEMINI_API_KEY'), 'Test 8a: Response does not expose GEMINI_API_KEY');
  assert(!responseText.includes('JWT_SECRET'), 'Test 8b: Response does not expose JWT_SECRET');
  assert(!responseText.includes('DATABASE_URL'), 'Test 8c: Response does not expose DATABASE_URL');
  assert(!responseText.includes('passwordHash'), 'Test 8d: Response does not expose passwordHash');

  console.log('\n--- 9. Rate Limiting Protection ---');
  // Rapid fire burst of requests to verify rate limiter responds with 429
  const burstVisitor = `burst-test-${timestamp}`;
  const burstPromises = [];
  for (let i = 0; i < 35; i++) {
    burstPromises.push(
      fetch(`${BASE_URL}/api/widget/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.100.99', // distinct simulated IP
        },
        body: JSON.stringify({
          companyId: companyAId,
          visitorId: burstVisitor,
          message: `Burst ping ${i}`,
        }),
      })
    );
  }
  const burstResponses = await Promise.all(burstPromises);
  const hitRateLimit = burstResponses.some((res) => res.status === 429);
  assert(hitRateLimit, 'Test 9: Rate limiter successfully throttled burst with HTTP 429');

  console.log('\n--- 10. Domain Authorization Enforcement ---');
  // Configure allowedDomain on Company A: 'https://authorized-client.com'
  const resSetDomain = await fetch(`${BASE_URL}/api/companies/${companyAId}/automations/web/connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeaderA || '',
    },
    body: JSON.stringify({
      status: 'connected',
      provider: 'web_widget',
      displayName: 'https://authorized-client.com',
      metadata: {
        allowedDomain: 'https://authorized-client.com',
        assistantName: 'Custom Alpha Bot',
        welcomeMessage: 'Welcome to Alpha Agency! What are you building?',
      },
    }),
  });
  assert(resSetDomain.status === 200, 'Test 10a: Configured allowedDomain on Company A');

  // Unauthorized origin should be rejected with 403
  const resBadOrigin = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://malicious-scammer.com',
    },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: 'v-unauthorized',
      message: 'Hello from unauthorized domain',
    }),
  });
  const dataBadOrigin = await resBadOrigin.json();
  assert(resBadOrigin.status === 403 && dataBadOrigin.error === 'DOMAIN_NOT_AUTHORIZED', 'Test 10b: Unauthorized domain rejected with 403 DOMAIN_NOT_AUTHORIZED');

  // Authorized origin should succeed
  const resGoodOrigin = await fetch(`${BASE_URL}/api/widget/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://authorized-client.com',
    },
    body: JSON.stringify({
      companyId: companyAId,
      visitorId: 'v-authorized',
      message: 'Hello from authorized partner site',
    }),
  });
  assert(resGoodOrigin.status === 200, 'Test 10c: Authorized domain succeeded with 200');

  console.log('\n--- 11. Widget Config & History Retrieval ---');
  const resConfig = await fetch(
    `${BASE_URL}/api/widget/config?companyId=${companyAId}&visitorId=${visitor1}`,
    {
      headers: { Origin: 'https://authorized-client.com' },
    }
  );
  const dataConfig = await resConfig.json();
  assert(resConfig.status === 200 && dataConfig.success, 'Test 11a: Widget config endpoint returned 200');
  assert(dataConfig.data.settings.assistantName === 'Custom Alpha Bot', 'Test 11b: Custom assistant name returned');
  assert(dataConfig.data.settings.welcomeMessage.includes('Alpha Agency'), 'Test 11c: Custom welcome message returned');
  assert(Array.isArray(dataConfig.data.messages) && dataConfig.data.messages.length >= 2, 'Test 11d: Past conversation messages returned for session reload');

  // Reset allowed domain so localhost tests continue smoothly
  await fetch(`${BASE_URL}/api/companies/${companyAId}/automations/web/connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeaderA || '',
    },
    body: JSON.stringify({
      status: 'connected',
      displayName: 'localhost',
      metadata: { allowedDomain: '*' },
    }),
  });

  console.log('\n--- 12. Regression: Authenticated Dashboard Chat ---');
  const resDashChat = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeaderA || '',
    },
    body: JSON.stringify({
      message: 'Internal agency team testing discovery chat.',
    }),
  });
  const dataDashChat = await resDashChat.json();
  assert(resDashChat.status === 200 && dataDashChat.success, 'Test 12: Authenticated dashboard chat still works');

  console.log('\n--- 13. Regression: WhatsApp Webhook Intact ---');
  const resWaWebhook = await fetch(`${BASE_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=CHALLENGE_ACCEPTED_12345`);
  // Note: if token doesn't match default it returns 403, but the route exists and responds
  assert(resWaWebhook.status === 200 || resWaWebhook.status === 403, 'Test 13: WhatsApp webhook endpoint is intact and functional');

  console.log(`\n🎉 ALL ${passedCount} TESTS COMPLETED AND PASSED SUCCESSFULLY!`);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});

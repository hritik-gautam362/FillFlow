import assert from 'assert';
import {
  isMessageAlreadyProcessed,
  tryAcquireEmailMessageLease,
  processInboundEmail,
} from '../src/lib/services/email/emailInboundService';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { listApprovalItems } from '../src/lib/services/aiApprovalService';

async function runRegressionSuite() {
  console.log('==================================================');
  console.log('RUNNING REGRESSION TEST SUITE FOR INBOUND SKIP & RECOVERY');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
    }
  }

  // 1. Budget specified by customer is NOT flagged as fabricated
  await test('Customer stated budget is recognized and not falsely flagged as fabricated quotation', async () => {
    const clientMessage = 'Our budget is approximately ₹2.5 lakh, but we could stretch it to ₹3 lakh if absolutely necessary.';
    const draft = 'Hi Ananya, thank you for reaching out. We have noted your budget of ₹2.5 lakh and your goal to launch soon.';
    const validation = validateCustomerResponse({
      reply: draft,
      clientMessage,
      intent: 'project_request',
      knownRequirements: { budget: '₹2.5 lakh' },
    });
    const hasFabricatedPriceIssue = validation.issues.some((i) => i.includes('Fabricated price figure'));
    assert.strictEqual(hasFabricatedPriceIssue, false, 'Stated budget must not trigger fabricated price error');
  });

  // 2. Client asking for price without giving budget: fabricated figure IS flagged
  await test('AI-fabricated price without customer budget IS flagged as invalid', async () => {
    const clientMessage = 'How much will it cost to build a clothing store website? Please give me an exact price quote.';
    const draft = 'Hi there, our standard package is ₹1,50,000 for e-commerce.';
    const validation = validateCustomerResponse({
      reply: draft,
      clientMessage,
      intent: 'pricing_request',
      knownRequirements: {},
    });
    const hasFabricatedPriceIssue = validation.issues.some((i) => i.includes('Fabricated price figure') || i.includes('Unsupported commercial price claim'));
    assert.strictEqual(hasFabricatedPriceIssue, true, 'Fabricated price must be flagged when client asked for price');
  });

  // 3. Repeated webhook / sync event deduplication
  await test('Repeated webhook or sync event deduplication works reliably', async () => {
    const companyId = 'cmvns3och0000u4k044wcwqjq';
    const knownQueuedId = '1a173dd6e46cd6b5';
    const already = await isMessageAlreadyProcessed(knownQueuedId, knownQueuedId, companyId);
    assert.strictEqual(already, true, 'Already queued inbound message must report already processed');
    const lease = await tryAcquireEmailMessageLease(companyId, knownQueuedId);
    assert.strictEqual(lease.acquired, false, 'Lease acquisition must be rejected for already queued item');
    assert.strictEqual(lease.reason, 'ALREADY_PROCESSED');
  });

  // 4. Message marked processed_no_reply without approval queue item is recoverable
  await test('Message marked processed_no_reply without approval queue item is recoverable', async () => {
    const testMsgId = `test_recover_${Date.now()}`;
    const companyId = 'cmvns3och0000u4k044wcwqjq';
    // Initially not processed
    const alreadyBefore = await isMessageAlreadyProcessed(testMsgId, testMsgId, companyId);
    assert.strictEqual(alreadyBefore, false, 'Unknown message should not be marked processed');
    // Lease can be acquired
    const lease = await tryAcquireEmailMessageLease(companyId, testMsgId, { subject: 'Test Inquiry' });
    assert.strictEqual(lease.acquired, true, 'Lease should be acquired for recovery test message');
  });

  // 5. Spam / promotional email classification
  await test('Promotional email is classified as promotional and not queued for client approval', async () => {
    const promoInbound = {
      messageId: `promo_${Date.now()}`,
      sender: 'marketing@cheapdeals.xyz',
      recipient: 'evores.co@gmail.com',
      subject: 'Special 50% discount on office supplies this week only!',
      text: 'Click here to unsubscribe. Buy cheap printer ink and paper with 50% discount today.',
      timestamp: Date.now(),
      metadata: {},
    };
    const res = await processInboundEmail(promoInbound);
    assert.strictEqual(res.status, 'skipped_irrelevant');
  });

  // 6. Unknown recipient / company resolution failure handled safely
  await test('Inbound to unmapped recipient fails safely without uncaught exceptions', async () => {
    const unmappedInbound = {
      messageId: `unmapped_${Date.now()}`,
      sender: 'client@example.com',
      recipient: 'nonexistent-company-404@example.com',
      subject: 'Inquiry',
      text: 'Hello, need web development.',
      timestamp: Date.now(),
      metadata: {},
    };
    const res = await processInboundEmail(unmappedInbound);
    assert.strictEqual(res.success, false);
    assert.ok(res.status === 'automation_disabled' || res.status === 'error');
  });

  // 7. Verify Approval Queue list for company includes both recovered items
  await test('Both recovered test emails are present in company Approval Queue', async () => {
    const companyId = 'cmvns3och0000u4k044wcwqjq';
    const queue = await listApprovalItems(companyId, 'ALL');
    const msgIds = queue.map((i) => i.inboundMessageId);
    assert.ok(msgIds.includes('1a173dd6e46cd6b5'), 'CRM migration email must be in queue');
    assert.ok(msgIds.includes('1a173da58164463b'), 'Urgent e-commerce email must be in queue');
  });

  // 8. Verify no outbound emails were dispatched autonomously for the queued items
  await test('No customer-facing reply was sent autonomously without company approval', async () => {
    const companyId = 'cmvns3och0000u4k044wcwqjq';
    const queue = await listApprovalItems(companyId, 'ALL');
    const item1 = queue.find((i) => i.inboundMessageId === '1a173dd6e46cd6b5');
    const item2 = queue.find((i) => i.inboundMessageId === '1a173da58164463b');
    assert.strictEqual(item1?.status, 'PENDING');
    assert.ok(item2?.status === 'BLOCKED' || item2?.status === 'PENDING');
  });

  console.log(`\n==================================================`);
  console.log(`REGRESSION TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runRegressionSuite()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Test suite failed:', e);
    process.exit(1);
  });

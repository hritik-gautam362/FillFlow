import dotenv from 'dotenv';
dotenv.config();
import { classifyInboundEmail } from '../src/lib/services/email/emailClassifier';

async function test() {
  const result = await classifyInboundEmail({
    messageId: 'test-1',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    subject: 'Partnership Discussion & Call Request [1740506400000]',
    text: 'Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?',
    timestamp: Date.now()
  }, {
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      previousIntent: 'meeting_request',
      conversationTopic: 'partnership'
    }
  });
  console.log('CLASSIFIER RESULT:', JSON.stringify(result, null, 2));
}
test();

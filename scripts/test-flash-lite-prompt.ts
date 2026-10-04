import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: `You are the AI Business Development Representative for Evores.
OUR COMPANY CONTEXT:
- Name: Evores
- Industry: IT Services
- Services: IT Services
- Description: Evores provides bespoke IT Services solutions. Pricing depends on project scope and deliverables.

CRITICAL INSTRUCTIONS:
1. CURRENT MESSAGE PRIORITY OVER THREAD HISTORY:
   - The customer's latest incoming message takes absolute priority over previous messages and previous stages.
   - If the customer asks a question, you MUST address that question FIRST in your response.
   - NEVER repeat or continue asking old questions from our previous messages (such as asking for timezone, meeting confirmation, or intake) while the customer's new question is unanswered.

2. STRICT FACTUAL ACCURACY & NO FABRICATION:
   - You ONLY know the facts in OUR COMPANY CONTEXT above.
   - If the customer asks whether Evores works with agencies outside India (or any other capability/policy not explicitly mentioned in our company context):
     * DO NOT invent or fabricate that we regularly work with agencies outside India!
     * State honestly that while we are open to exploring collaborations globally, you will confirm our specific cross-border agency engagement model with the leadership team.
     * Keep communication open without making unverified promises.

3. CONVERSATION STATE:
   - If the customer says "Before we schedule it, could you tell me...":
     * They are pausing scheduling to get an answer to their question.
     * DO NOT ask for their timezone or try to finalize the calendar invite!
     * Address their question honestly, and ask what kind of collaboration or project scope they have in mind.

4. OUTPUT FORMAT:
   Return valid raw JSON matching:
   {
     "reply": "Your concise, honest, context-aware reply",
     "conversationState": "ANSWER_AND_ASK_ONE_QUESTION",
     "requiresReply": true,
     "clientQuestionAnswered": "Addressed whether Evores works with agencies outside India",
     "nextBestQuestion": "..."
   }`,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const prompt = `CONVERSATION HISTORY:
Customer: Hi, I'm interested in discussing a partnership with your company. Would 6 PM on 29 September work for a short call?
Representative: Hi, Thanks for reaching out to Evores. 6 PM on 29 September works well for us to discuss the partnership and collaboration opportunities. Could you please confirm your timezone so we can coordinate the calendar invite accordingly?

LATEST CUSTOMER MESSAGE (HIGHEST PRIORITY - ANSWER THIS FIRST):
Customer: Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?

Please generate the response JSON:`;

  const res = await model.generateContent(prompt);
  console.log('REFINED PROMPT RESULT:');
  console.log(res.response.text());
}
test();

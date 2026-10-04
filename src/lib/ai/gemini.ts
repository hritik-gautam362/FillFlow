import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemInstruction, SYSTEM_INSTRUCTION, formatConversationPrompt } from './prompts';
import { parseModelJson, validateAndNormalizeModelOutput } from './validator';
import { ExtractedRequirements, AiModelOutput, CompanyContext } from './types';

const g = globalThis as unknown as {
  __geminiMockHandler?: ((params: CallGeminiParams) => Promise<AiModelOutput | null> | AiModelOutput | null) | null;
  __realGeminiCallCount?: number;
};

let genAIInstance: GoogleGenerativeAI | null = null;

export function getRealGeminiCallCount(): number {
  return g.__realGeminiCallCount || 0;
}

export function resetRealGeminiCallCount(): void {
  g.__realGeminiCallCount = 0;
}

// Test mode mock injection hook to prevent burning live API credits in tests
export type GeminiMockHandler = (params: CallGeminiParams) => Promise<AiModelOutput | null> | AiModelOutput | null;

export function setGeminiMockHandler(handler: GeminiMockHandler | null): void {
  g.__geminiMockHandler = handler;
}

export function clearGeminiMockHandler(): void {
  g.__geminiMockHandler = null;
}


export const DEFAULT_AI_MODEL = 'gemini-flash-lite-latest';

export function getAiModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    throw new Error('AI_API_KEY is not configured in server environment.');
  }

  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey.trim());
  }

  return genAIInstance;
}

export interface CallGeminiParams {
  history: Array<{ sender: 'client' | 'agent' | 'system'; text: string }>;
  latestMessage: string;
  previousRequirements?: Partial<ExtractedRequirements>;
  companyContext?: CompanyContext;
  intent?: string;
  subject?: string;
  sender?: string;
}

/**
 * Invokes the Gemini API on the server side to process customer messages,
 * maintain general business discovery, and extract structured interaction details.
 */
export async function callGeminiRequirementAgent(
  params: CallGeminiParams
): Promise<AiModelOutput> {
  // Check if mock handler is active (e.g. during automated unit/integration tests)
  if (g.__geminiMockHandler) {
    const mockOutput = await g.__geminiMockHandler(params);
    if (mockOutput) {
      return mockOutput;
    }
  }

  // If AI_TEST_MODE is enabled in environment, do not call live Gemini unless explicitly allowed
  if (process.env.AI_TEST_MODE === 'mock') {
    return validateAndNormalizeModelOutput(
      null,
      params.previousRequirements,
      params.companyContext,
      params.latestMessage,
      params.intent,
      params.subject,
      params.history
    );
  }

  const genAI = getGeminiClient();
  const modelName = getAiModel();

  const systemInstruction = params.companyContext
    ? getSystemInstruction(params.companyContext)
    : SYSTEM_INSTRUCTION;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const prompt = formatConversationPrompt(
    params.history,
    params.latestMessage,
    params.previousRequirements,
    params.companyContext,
    params.intent,
    params.subject
  );

  try {
    g.__realGeminiCallCount = (g.__realGeminiCallCount || 0) + 1;
    console.log(`[REAL_GEMINI_CALL] requirementAgent count=${g.__realGeminiCallCount} model=${modelName}`);
    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (apiErr: unknown) {
      const msg = (apiErr as Error)?.message || '';
      if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
        console.warn('[Gemini Service] 503 high demand encountered, retrying once after 1500ms...');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          result = await model.generateContent(prompt);
        } catch {
          const fallbackModelName = modelName === 'gemini-flash-lite-latest' ? 'gemini-3.1-flash-lite' : 'gemini-flash-lite-latest';
          console.warn(`[Gemini Service] Primary model 503 retry failed, trying ${fallbackModelName}...`);
          const fallbackModel = genAI.getGenerativeModel({
            model: fallbackModelName,
            systemInstruction,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          result = await fallbackModel.generateContent(prompt);
        }
      } else if (msg.includes('429') || msg.includes('quota') || msg.includes('Quota exceeded') || msg.includes('404')) {
        const fallbackModelName = modelName === 'gemini-flash-lite-latest' ? 'gemini-3.1-flash-lite' : 'gemini-flash-lite-latest';
        console.warn(`[Gemini Service] Model ${modelName} encountered error, falling back to ${fallbackModelName}...`);
        const fallbackModel = genAI.getGenerativeModel({
          model: fallbackModelName,
          systemInstruction,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        result = await fallbackModel.generateContent(prompt);
      } else {
        throw apiErr;
      }
    }
    const responseText = result.response.text();

    const parsedJson = parseModelJson(responseText);
    return validateAndNormalizeModelOutput(
      parsedJson,
      params.previousRequirements,
      params.companyContext,
      params.latestMessage,
      params.intent,
      params.subject,
      params.history
    );
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error occurred in Gemini invocation';
    console.error('[Gemini Service Error]:', errMsg);

    return validateAndNormalizeModelOutput(
      null,
      params.previousRequirements,
      params.companyContext,
      params.latestMessage,
      params.intent,
      params.subject,
      params.history
    );
  }
}

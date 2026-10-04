import { NextRequest } from 'next/server';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';
import { runAiSimulation } from '@/lib/services/aiPlaygroundService';
import { getCompanyById } from '@/lib/services/companyService';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/companies/[id]/ai/playground
 *
 * Runs an ephemeral, read-only AI simulation of customer communication.
 * Validates tenant authorization via requireCompanyAuth.
 * Never modifies production leads, messages, quota, or sends real emails.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!isNonEmptyString(companyId)) {
      return errorResponse('Company ID parameter is required.', 400);
    }

    // 1. Authenticate and enforce tenant isolation
    await requireCompanyAuth(companyId, request);

    // 2. Ensure company exists
    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    // 3. Parse and validate input payload
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body.', 400);
    }

    const rawMessage = body.customerMessage;
    if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
      return errorResponse('Customer message is required.', 400);
    }

    if (rawMessage.length > 10000) {
      return errorResponse('Customer message exceeds maximum length limit of 10,000 characters.', 400);
    }

    const rawInstruction = typeof body.companyInstruction === 'string'
      ? body.companyInstruction.trim()
      : undefined;

    if (rawInstruction && rawInstruction.length > 5000) {
      return errorResponse('Company instruction exceeds maximum length limit of 5,000 characters.', 400);
    }

    const previousContext = body.previousContext as string | Array<{ sender: 'client' | 'agent' | 'system'; text: string }> | undefined;
    if (typeof previousContext === 'string' && previousContext.length > 10000) {
      return errorResponse('Previous context exceeds maximum length limit of 10,000 characters.', 400);
    }
    if (Array.isArray(previousContext)) {
      const totalLen = previousContext.reduce((acc, curr) => acc + (curr?.text?.length || 0), 0);
      if (totalLen > 10000) {
        return errorResponse('Previous context turns exceed maximum total length of 10,000 characters.', 400);
      }
    }

    // 4. Run pure safe simulation
    const simulationResult = await runAiSimulation({
      companyId,
      customerMessage: rawMessage.trim(),
      companyInstruction: rawInstruction,
      previousContext,
    });

    return successResponse(simulationResult, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

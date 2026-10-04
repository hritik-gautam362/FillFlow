import { NextRequest } from 'next/server';
import { createChatMessage, getConversationHistory } from '@/lib/services/chatService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidMessageSender } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const body = await request.json();
    const { sender, text, options, extractedDataSnapshot } = body;

    if (!isValidMessageSender(sender)) {
      return errorResponse(`Invalid sender "${sender}". Allowed values: client, agent, system.`, 400);
    }

    if (!isNonEmptyString(text)) {
      return errorResponse('Message text is required and must be a non-empty string.', 400);
    }

    const message = await createChatMessage(
      {
        leadId,
        sender,
        text,
        options,
        extractedDataSnapshot,
      },
      companyId
    );

    return successResponse(message, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const messages = await getConversationHistory(leadId, companyId);
    return successResponse(messages, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

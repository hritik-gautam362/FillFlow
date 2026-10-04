import { prisma } from '@/lib/prisma';
import { ChatMessage, MessageSender, Prisma } from '@prisma/client';
import { getLeadById } from './leadService';

export type CreateChatMessageInput = {
  leadId: string;
  sender: MessageSender;
  text: string;
  options?: string[];
  extractedDataSnapshot?: Prisma.InputJsonValue;
};

export async function createChatMessage(
  data: CreateChatMessageInput,
  companyId?: string
): Promise<ChatMessage> {
  // Validate lead existence and company scope
  await getLeadById(data.leadId, companyId);

  // Update lead's lastActive timestamp
  await prisma.lead.update({
    where: { id: data.leadId },
    data: { lastActive: new Date() },
  });

  return prisma.chatMessage.create({
    data: {
      leadId: data.leadId,
      sender: data.sender,
      text: data.text.trim(),
      options: data.options || [],
      extractedDataSnapshot: data.extractedDataSnapshot || Prisma.JsonNull,
    },
  });
}

export async function getConversationHistory(
  leadId: string,
  companyId?: string
): Promise<ChatMessage[]> {
  // Validate lead existence and company scope
  await getLeadById(leadId, companyId);

  return prisma.chatMessage.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' },
  });
}

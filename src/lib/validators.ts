import { ChannelSource, LeadStatus, Complexity, MessageSender } from '@prisma/client';

export function isValidChannelSource(val: unknown): val is ChannelSource {
  return typeof val === 'string' && Object.values(ChannelSource).includes(val as ChannelSource);
}

export function isValidLeadStatus(val: unknown): val is LeadStatus {
  return typeof val === 'string' && Object.values(LeadStatus).includes(val as LeadStatus);
}

export function isValidComplexity(val: unknown): val is Complexity {
  return typeof val === 'string' && Object.values(Complexity).includes(val as Complexity);
}

export function isValidMessageSender(val: unknown): val is MessageSender {
  return typeof val === 'string' && Object.values(MessageSender).includes(val as MessageSender);
}

export function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

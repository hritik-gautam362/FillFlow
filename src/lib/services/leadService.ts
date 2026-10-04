import { prisma } from '@/lib/prisma';
import { Lead, ChannelSource, LeadStatus } from '@prisma/client';

export type CreateLeadInput = {
  companyId: string;
  clientName: string;
  companyName: string;
  email: string;
  phone: string;
  channel?: ChannelSource;
  status?: LeadStatus;
  qualificationScore?: number;
  estimatedBudget?: string;
  requestedTimeline?: string;
  projectType?: string;
  assignedManager?: string;
  notes?: string;
};

export type UpdateLeadInput = Partial<Omit<CreateLeadInput, 'companyId'>>;

export async function createLead(data: CreateLeadInput): Promise<Lead> {
  // Ensure target company exists
  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
  });

  if (!company) {
    throw new Error(`Company with id "${data.companyId}" not found.`);
  }

  return prisma.lead.create({
    data: {
      companyId: data.companyId,
      clientName: data.clientName.trim(),
      companyName: data.companyName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      channel: data.channel || ChannelSource.web_chat,
      status: data.status || LeadStatus.new,
      qualificationScore: data.qualificationScore ?? 0,
      estimatedBudget: data.estimatedBudget?.trim() || null,
      requestedTimeline: data.requestedTimeline?.trim() || null,
      projectType: data.projectType?.trim() || null,
      assignedManager: data.assignedManager?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export async function getLeadsByCompanyId(companyId: string) {
  return prisma.lead.findMany({
    where: { companyId },
    include: {
      projectBrief: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLeadById(id: string, companyId?: string): Promise<Lead | null> {
  const lead = await prisma.lead.findUnique({
    where: { id },
  });

  if (!lead) return null;

  if (companyId && lead.companyId !== companyId) {
    const error = new Error('Access denied: Lead does not belong to the specified company.');
    (error as unknown as { name: string; statusCode: number }).name = 'AuthError';
    (error as unknown as { name: string; statusCode: number }).statusCode = 403;
    throw error;
  }

  return lead;
}

export async function updateLead(id: string, data: UpdateLeadInput, companyId?: string): Promise<Lead> {
  await getLeadById(id, companyId); // Validates existence and company scope

  return prisma.lead.update({
    where: { id },
    data: {
      ...(data.clientName !== undefined && { clientName: data.clientName.trim() }),
      ...(data.companyName !== undefined && { companyName: data.companyName.trim() }),
      ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
      ...(data.phone !== undefined && { phone: data.phone.trim() }),
      ...(data.channel !== undefined && { channel: data.channel }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.qualificationScore !== undefined && { qualificationScore: data.qualificationScore }),
      ...(data.estimatedBudget !== undefined && { estimatedBudget: data.estimatedBudget.trim() || null }),
      ...(data.requestedTimeline !== undefined && { requestedTimeline: data.requestedTimeline.trim() || null }),
      ...(data.projectType !== undefined && { projectType: data.projectType.trim() || null }),
      ...(data.assignedManager !== undefined && { assignedManager: data.assignedManager.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes.trim() || null }),
      lastActive: new Date(),
    },
  });
}

export async function updateLeadStatus(id: string, status: LeadStatus, companyId?: string): Promise<Lead> {
  await getLeadById(id, companyId); // Validates existence and company scope

  return prisma.lead.update({
    where: { id },
    data: {
      status,
      lastActive: new Date(),
    },
  });
}

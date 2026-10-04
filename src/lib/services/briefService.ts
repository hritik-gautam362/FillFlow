import { prisma } from '@/lib/prisma';
import { ProjectBrief, Prisma, Complexity } from '@prisma/client';
import { getLeadById } from './leadService';

export type CreateFeaturePayload = {
  name: string;
  description: string;
  complexity?: Complexity;
};

export type CreateProjectBriefInput = {
  leadId: string;
  title: string;
  summary: string;
  projectType: string;
  targetAudience: string;
  requiredTechStack: string[];
  budgetRange: string;
  estimatedDuration: string;
  keyRisks?: string[];
  rawConversationLength?: number;
  structuredJson: Prisma.InputJsonValue;
  features?: CreateFeaturePayload[];
};

export type UpdateProjectBriefInput = Partial<Omit<CreateProjectBriefInput, 'leadId' | 'features'>>;

export async function createProjectBrief(
  data: CreateProjectBriefInput,
  companyId?: string
): Promise<ProjectBrief> {
  // Validate lead existence and company scope
  await getLeadById(data.leadId, companyId);

  // Check if brief already exists for lead
  const existingBrief = await prisma.projectBrief.findUnique({
    where: { leadId: data.leadId },
  });

  if (existingBrief) {
    throw new Error(`Project brief for lead "${data.leadId}" already exists.`);
  }

  // Create brief and optional features in a transaction
  return prisma.projectBrief.create({
    data: {
      leadId: data.leadId,
      title: data.title.trim(),
      summary: data.summary.trim(),
      projectType: data.projectType.trim(),
      targetAudience: data.targetAudience.trim(),
      requiredTechStack: data.requiredTechStack || [],
      budgetRange: data.budgetRange.trim(),
      estimatedDuration: data.estimatedDuration.trim(),
      keyRisks: data.keyRisks || [],
      rawConversationLength: data.rawConversationLength ?? 0,
      structuredJson: data.structuredJson,
      features: data.features && data.features.length > 0 ? {
        create: data.features.map((f) => ({
          name: f.name.trim(),
          description: f.description.trim(),
          complexity: f.complexity || Complexity.Medium,
        })),
      } : undefined,
    },
    include: {
      features: true,
    },
  });
}

export async function getProjectBriefByLeadId(
  leadId: string,
  companyId?: string
): Promise<ProjectBrief | null> {
  // Validate lead existence and company scope
  await getLeadById(leadId, companyId);

  return prisma.projectBrief.findUnique({
    where: { leadId },
    include: {
      features: true,
    },
  });
}

export async function getProjectBriefById(
  briefId: string,
  companyId?: string
): Promise<ProjectBrief | null> {
  const brief = await prisma.projectBrief.findUnique({
    where: { id: briefId },
    include: {
      features: true,
      lead: true,
    },
  });

  if (!brief) return null;

  if (companyId && brief.lead.companyId !== companyId) {
    const error = new Error('Access denied: Brief does not belong to the specified company.');
    (error as unknown as { name: string; statusCode: number }).name = 'AuthError';
    (error as unknown as { name: string; statusCode: number }).statusCode = 403;
    throw error;
  }

  return brief;
}

export async function updateProjectBrief(
  briefId: string,
  data: UpdateProjectBriefInput,
  companyId?: string
): Promise<ProjectBrief> {
  const brief = await getProjectBriefById(briefId, companyId);
  if (!brief) {
    throw new Error(`Project brief with id "${briefId}" not found.`);
  }

  return prisma.projectBrief.update({
    where: { id: briefId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.summary !== undefined && { summary: data.summary.trim() }),
      ...(data.projectType !== undefined && { projectType: data.projectType.trim() }),
      ...(data.targetAudience !== undefined && { targetAudience: data.targetAudience.trim() }),
      ...(data.requiredTechStack !== undefined && { requiredTechStack: data.requiredTechStack }),
      ...(data.budgetRange !== undefined && { budgetRange: data.budgetRange.trim() }),
      ...(data.estimatedDuration !== undefined && { estimatedDuration: data.estimatedDuration.trim() }),
      ...(data.keyRisks !== undefined && { keyRisks: data.keyRisks }),
      ...(data.rawConversationLength !== undefined && { rawConversationLength: data.rawConversationLength }),
      ...(data.structuredJson !== undefined && { structuredJson: data.structuredJson }),
    },
    include: {
      features: true,
    },
  });
}

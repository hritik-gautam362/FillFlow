import { prisma } from '@/lib/prisma';
import { ProjectFeature, Complexity } from '@prisma/client';
import { getProjectBriefById } from './briefService';

export type CreateFeatureInput = {
  briefId: string;
  name: string;
  description: string;
  complexity?: Complexity;
};

export type UpdateFeatureInput = Partial<Omit<CreateFeatureInput, 'briefId'>>;

export async function createProjectFeature(
  data: CreateFeatureInput,
  companyId?: string
): Promise<ProjectFeature> {
  // Validate brief existence & company access
  const brief = await getProjectBriefById(data.briefId, companyId);
  if (!brief) {
    throw new Error(`Project brief with id "${data.briefId}" not found.`);
  }

  return prisma.projectFeature.create({
    data: {
      briefId: data.briefId,
      name: data.name.trim(),
      description: data.description.trim(),
      complexity: data.complexity || Complexity.Medium,
    },
  });
}

export async function updateProjectFeature(
  featureId: string,
  data: UpdateFeatureInput,
  companyId?: string
): Promise<ProjectFeature> {
  const feature = await prisma.projectFeature.findUnique({
    where: { id: featureId },
    include: { brief: { include: { lead: true } } },
  });

  if (!feature) {
    throw new Error(`Project feature with id "${featureId}" not found.`);
  }

  if (companyId && feature.brief.lead.companyId !== companyId) {
    throw new Error('Access denied: Feature does not belong to the specified company.');
  }

  return prisma.projectFeature.update({
    where: { id: featureId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.complexity !== undefined && { complexity: data.complexity }),
    },
  });
}

export async function deleteProjectFeature(
  featureId: string,
  companyId?: string
): Promise<ProjectFeature> {
  const feature = await prisma.projectFeature.findUnique({
    where: { id: featureId },
    include: { brief: { include: { lead: true } } },
  });

  if (!feature) {
    throw new Error(`Project feature with id "${featureId}" not found.`);
  }

  if (companyId && feature.brief.lead.companyId !== companyId) {
    throw new Error('Access denied: Feature does not belong to the specified company.');
  }

  return prisma.projectFeature.delete({
    where: { id: featureId },
  });
}

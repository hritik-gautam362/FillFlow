import { prisma } from '@/lib/prisma';
import { Company, Prisma } from '@prisma/client';
import { ensureDefaultCompanyPermissionConfig } from '@/lib/services/companyPermissionService';

export type DaySchedule = {
  open: boolean;
  openTime: string; // "09:00"
  closeTime: string; // "17:00"
};

export type WeeklyBusinessHours = {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
};

export type BusinessHoursInput = {
  timezone?: string | null;
  schedule?: WeeklyBusinessHours | null;
};

export type CommunicationSettingsInput = {
  tone?: string;
  responseDelay?: string;
  signature?: string | null;
  signatureEnabled?: boolean;
};

export type CreateCompanyInput = {
  name: string;
  logo?: string;
  industry?: string;
  teamSize?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  onboardingCompletedAt?: Date | null;
  businessHours?: BusinessHoursInput;
  communicationSettings?: CommunicationSettingsInput;
};

export type UpdateCompanyInput = {
  name?: string;
  logo?: string | null;
  industry?: string | null;
  teamSize?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  onboardingCompletedAt?: Date | string | null;
  businessHours?: BusinessHoursInput | null;
  communicationSettings?: CommunicationSettingsInput | null;
  tone?: string;
  responseDelay?: string;
  signature?: string | null;
  signatureEnabled?: boolean;
};

// In-memory simulation cache for server restart simulation testing
const inMemoryCompanyProfileCache = new Map<string, unknown>();

export function resetMemoryCompanyProfileCache(): void {
  inMemoryCompanyProfileCache.clear();
}

export function formatBusinessHoursSummary(
  schedule?: WeeklyBusinessHours | null,
  timezone?: string | null
): string | null {
  if (!schedule || typeof schedule !== 'object') return null;

  const days: (keyof WeeklyBusinessHours)[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const formattedDays: string[] = [];

  for (const day of days) {
    const config = schedule[day];
    if (config && config.open) {
      const dayName = day.charAt(0).toUpperCase() + day.slice(1);
      const openTime = config.openTime || '09:00';
      const closeTime = config.closeTime || '17:00';
      formattedDays.push(`${dayName}: ${openTime}-${closeTime}`);
    }
  }

  if (formattedDays.length === 0) return null;

  const tzSuffix = timezone ? ` (${timezone})` : '';
  return `${formattedDays.join(', ')}${tzSuffix}`;
}

export async function createCompany(data: CreateCompanyInput): Promise<Company> {
  const company = await prisma.company.create({
    data: {
      name: data.name.trim(),
      logo: data.logo?.trim() || null,
      industry: data.industry?.trim() || null,
      teamSize: data.teamSize?.trim() || null,
      website: data.website?.trim() || null,
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      country: data.country?.trim() || null,
      timezone: data.timezone?.trim() || null,
      onboardingCompleted: data.onboardingCompleted ?? false,
      onboardingStep: data.onboardingStep ?? 1,
      onboardingCompletedAt: data.onboardingCompletedAt || null,
    },
  });

  if (data.businessHours) {
    await prisma.businessHours.create({
      data: {
        companyId: company.id,
        timezone: data.businessHours.timezone || data.timezone || null,
        schedule: data.businessHours.schedule as unknown as Prisma.InputJsonValue,
      },
    }).catch((err) =>
      console.warn('[CompanyService] Non-critical error initializing business hours:', err)
    );
  }

  if (data.communicationSettings) {
    await prisma.companyCommunicationSettings.create({
      data: {
        companyId: company.id,
        tone: data.communicationSettings.tone || 'professional',
        responseDelay: data.communicationSettings.responseDelay || 'immediate',
        signature: data.communicationSettings.signature || null,
        signatureEnabled: data.communicationSettings.signatureEnabled ?? false,
      },
    }).catch((err) =>
      console.warn('[CompanyService] Non-critical error initializing communication settings:', err)
    );
  }

  await ensureDefaultCompanyPermissionConfig(company.id).catch((err) =>
    console.warn('[CompanyService] Non-critical error initializing default AI permissions:', err)
  );

  return company;
}

export async function getCompanyById(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      businessHours: true,
      communicationSettings: true,
    },
  });
}

export async function updateCompany(id: string, data: UpdateCompanyInput) {
  // 1. Update Company table fields
  const companyUpdateData: Prisma.CompanyUpdateInput = {};
  if (data.name !== undefined) companyUpdateData.name = data.name.trim();
  if (data.logo !== undefined) companyUpdateData.logo = data.logo?.trim() || null;
  if (data.industry !== undefined) companyUpdateData.industry = data.industry?.trim() || null;
  if (data.teamSize !== undefined) companyUpdateData.teamSize = data.teamSize?.trim() || null;
  if (data.website !== undefined) companyUpdateData.website = data.website?.trim() || null;
  if (data.phone !== undefined) companyUpdateData.phone = data.phone?.trim() || null;
  if (data.address !== undefined) companyUpdateData.address = data.address?.trim() || null;
  if (data.city !== undefined) companyUpdateData.city = data.city?.trim() || null;
  if (data.state !== undefined) companyUpdateData.state = data.state?.trim() || null;
  if (data.country !== undefined) companyUpdateData.country = data.country?.trim() || null;
  if (data.timezone !== undefined) companyUpdateData.timezone = data.timezone?.trim() || null;
  if (data.onboardingCompleted !== undefined) companyUpdateData.onboardingCompleted = Boolean(data.onboardingCompleted);
  if (data.onboardingStep !== undefined) companyUpdateData.onboardingStep = Math.max(1, Math.min(7, Math.floor(data.onboardingStep)));
  if (data.onboardingCompletedAt !== undefined) {
    companyUpdateData.onboardingCompletedAt = data.onboardingCompletedAt ? new Date(data.onboardingCompletedAt) : null;
  }

  if (Object.keys(companyUpdateData).length > 0) {
    await prisma.company.update({
      where: { id },
      data: companyUpdateData,
    });
  }

  // 2. Update/upsert BusinessHours if provided
  if (data.businessHours !== undefined) {
    if (data.businessHours === null) {
      await prisma.businessHours.deleteMany({ where: { companyId: id } });
    } else {
      await prisma.businessHours.upsert({
        where: { companyId: id },
        create: {
          companyId: id,
          timezone: data.businessHours.timezone !== undefined ? data.businessHours.timezone : (data.timezone || null),
          schedule: (data.businessHours.schedule || null) as unknown as Prisma.InputJsonValue,
        },
        update: {
          ...(data.businessHours.timezone !== undefined && { timezone: data.businessHours.timezone }),
          ...(data.businessHours.schedule !== undefined && { schedule: (data.businessHours.schedule || null) as unknown as Prisma.InputJsonValue }),
        },
      });
    }
  }

  // 3. Update/upsert CommunicationSettings if provided
  const hasCommObject = data.communicationSettings !== undefined;
  const hasFlatComm =
    data.tone !== undefined ||
    data.responseDelay !== undefined ||
    data.signature !== undefined ||
    data.signatureEnabled !== undefined;

  if (hasCommObject || hasFlatComm) {
    const tone = data.communicationSettings?.tone ?? data.tone;
    const responseDelay = data.communicationSettings?.responseDelay ?? data.responseDelay;
    const signature = data.communicationSettings?.signature ?? data.signature;
    const signatureEnabled = data.communicationSettings?.signatureEnabled ?? data.signatureEnabled;

    await prisma.companyCommunicationSettings.upsert({
      where: { companyId: id },
      create: {
        companyId: id,
        tone: tone || 'professional',
        responseDelay: responseDelay || 'immediate',
        signature: signature !== undefined ? (signature ? signature.trim() : null) : null,
        signatureEnabled: signatureEnabled ?? false,
      },
      update: {
        ...(tone !== undefined && { tone }),
        ...(responseDelay !== undefined && { responseDelay }),
        ...(signature !== undefined && { signature: signature ? signature.trim() : null }),
        ...(signatureEnabled !== undefined && { signatureEnabled }),
      },
    });
  }

  // Return fresh full company with relations
  return prisma.company.findUnique({
    where: { id },
    include: {
      businessHours: true,
      communicationSettings: true,
    },
  });
}

export const DEFAULT_COMPANY_NAME = 'ApexByte Demo Workspace';

export async function getOrCreateDefaultCompany(): Promise<Company> {
  let company = await prisma.company.findFirst({
    where: { name: DEFAULT_COMPANY_NAME },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEFAULT_COMPANY_NAME,
        industry: 'Software Consulting',
        teamSize: '10-50',
      },
    });
  }

  return company;
}

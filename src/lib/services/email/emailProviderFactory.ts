import { EmailProvider } from './EmailProvider';
import { MailgunProvider, MailgunConfig } from './MailgunProvider';
import { GoogleProvider, GoogleProviderConfig } from './GoogleProvider';
import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import { decryptToken, encryptToken } from '@/lib/security/encryption';

let cachedDefaultProvider: EmailProvider | null = null;

export interface ProviderFactoryOptions {
  providerType?: 'mailgun' | 'google' | string;
  config?: MailgunConfig | GoogleProviderConfig;
  forceNew?: boolean;
}

/**
 * Factory to get or instantiate an EmailProvider.
 * Defaults to MailgunProvider configured from server-side environment variables.
 */
export function getEmailProvider(options?: ProviderFactoryOptions): EmailProvider {
  const providerType = options?.providerType || 'mailgun';

  if (options?.forceNew || options?.config) {
    if (providerType === 'mailgun') {
      return new MailgunProvider(options.config as MailgunConfig);
    }
    if (providerType === 'google') {
      return new GoogleProvider(options.config as GoogleProviderConfig);
    }
    throw new Error(`Unsupported email provider type: "${providerType}"`);
  }

  if (!cachedDefaultProvider) {
    if (providerType === 'mailgun') {
      cachedDefaultProvider = new MailgunProvider();
    } else if (providerType === 'google') {
      cachedDefaultProvider = new GoogleProvider();
    } else {
      throw new Error(`Unsupported email provider type: "${providerType}"`);
    }
  }

  return cachedDefaultProvider;
}

/**
 * Resolves a company's specific GoogleProvider instance with decrypted tokens
 * and automatic token-refresh database persistence.
 */
export async function getGoogleProviderForCompany(companyId: string): Promise<GoogleProvider> {
  const connection = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  if (!connection || connection.provider !== 'google' || connection.status !== ConnectionStatus.connected) {
    throw new Error(`Company ${companyId} does not have an active Google email connection.`);
  }

  const metadata = (connection.metadata as Record<string, unknown>) || {};
  const encryptedAccessToken = (metadata.encryptedAccessToken as string) || '';
  const encryptedRefreshToken = (metadata.encryptedRefreshToken as string) || '';
  const tokenExpiry = (metadata.tokenExpiry as number) || 0;
  const connectedEmail = connection.displayName || (metadata.googleEmail as string) || '';

  let accessToken = '';
  let refreshToken = '';

  try {
    if (encryptedAccessToken) accessToken = decryptToken(encryptedAccessToken);
    if (encryptedRefreshToken) refreshToken = decryptToken(encryptedRefreshToken);
  } catch (err) {
    console.error(`[Google Factory] Failed to decrypt tokens for company ${companyId}:`, (err as Error).message);
    throw new Error('Failed to decrypt Google connection credentials.');
  }

  if (!accessToken && !refreshToken) {
    throw new Error('Google OAuth credentials are missing or empty.');
  }

  return new GoogleProvider({
    companyId,
    accessToken,
    refreshToken,
    tokenExpiry,
    connectedEmail,
    scope: (metadata.scope as string) || '',
    onTokenRefreshed: async ({ accessToken: newAccessToken, tokenExpiry: newExpiry }) => {
      try {
        const encryptedNewAccess = encryptToken(newAccessToken);
        const currentMeta = ((await prisma.automationConnection.findUnique({
          where: {
            companyId_automationType: {
              companyId,
              automationType: AutomationType.email,
            },
          },
          select: { metadata: true },
        }))?.metadata as Record<string, unknown>) || {};

        await prisma.automationConnection.update({
          where: {
            companyId_automationType: {
              companyId,
              automationType: AutomationType.email,
            },
          },
          data: {
            metadata: {
              ...currentMeta,
              encryptedAccessToken: encryptedNewAccess,
              tokenExpiry: newExpiry,
              lastRefreshedAt: new Date().toISOString(),
            },
          },
        });
      } catch (saveErr) {
        console.error(`[Google Factory] Failed to persist refreshed token for company ${companyId}:`, saveErr);
      }
    },
  });
}

/**
 * Dynamically resolves the active EmailProvider for a given company.
 * If company is connected via Google, returns GoogleProvider; otherwise Mailgun.
 */
export async function getEmailProviderForCompany(companyId: string): Promise<EmailProvider> {
  const connection = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  if (connection?.provider === 'google' && connection.status === ConnectionStatus.connected) {
    return getGoogleProviderForCompany(companyId);
  }

  return getEmailProvider({ providerType: 'mailgun' });
}

/**
 * Helper to reset the singleton provider (primarily for test harness isolation).
 */
export function resetEmailProviderCache(): void {
  cachedDefaultProvider = null;
}

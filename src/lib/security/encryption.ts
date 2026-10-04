import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard recommended IV length for GCM (96 bits)
const TAG_LENGTH = 16; // 128 bits auth tag

/**
 * Derives a consistent 32-byte (256-bit) encryption key from the environment secret.
 * Falls back to JWT_SECRET or a default dev secret in non-production.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: ENCRYPTION_SECRET (or JWT_SECRET) environment variable is missing in production.');
  }

  const effectiveSecret = secret || 'apexbyte-default-encryption-secret-change-in-prod-2026';

  // Use SHA-256 to ensure exact 32-byte key
  return crypto.createHash('sha256').update(effectiveSecret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: `<iv_hex>:<authTag_hex>:<cipherText_hex>`
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Expects format: `<iv_hex>:<authTag_hex>:<cipherText_hex>`
 * Throws an error if tampering is detected or format is invalid.
 */
export function decryptToken(cipherString: string): string {
  if (!cipherString) return '';

  const parts = cipherString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format. Expected iv:authTag:encrypted');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

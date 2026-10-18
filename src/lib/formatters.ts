/**
 * FillFlow — Centralized Localization & Formatting Helper for India (en-IN)
 */

export const DEFAULT_LOCALE = 'en-IN';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Format a numeric amount or budget string into INR currency format.
 * Examples:
 *   120000 -> "₹1,20,000"
 *   "120000" -> "₹1,20,000"
 *   "₹1,20,000" -> "₹1,20,000"
 *   "₹4,00,000 - ₹6,00,000" -> "₹4,00,000 - ₹6,00,000"
 */
export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number') {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  const str = String(value).trim();
  // If already contains currency symbol or range, preserve it cleanly
  if (str.startsWith('₹') || str.includes('₹') || str.includes('-')) {
    return str;
  }

  // If pure number string
  const num = Number(str.replace(/[^0-9.-]+/g, ''));
  if (!isNaN(num) && str.length > 0) {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num);
  }

  return str;
}

/**
 * Format a number using the Indian numbering system (e.g. 1,50,000)
 */
export function formatIndianNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? Number(value.replace(/[^0-9.-]+/g, '')) : value;
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat(DEFAULT_LOCALE).format(num);
}

/**
 * Format a date in Indian format (e.g. 17 Oct 2026 or 17/10/2026)
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(DEFAULT_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE,
    ...options,
  });
}

/**
 * Format a time in Indian standard time (e.g. 03:30 PM)
 */
export function formatTime(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: DEFAULT_TIMEZONE,
    ...options,
  });
}

/**
 * Format date and time together (e.g. 17 Oct 2026, 03:30 PM)
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(DEFAULT_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: DEFAULT_TIMEZONE,
    ...options,
  });
}

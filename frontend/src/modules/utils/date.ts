import { MS_PER_DAY } from '../shared/constants';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const EM_DASH = "—";

function toLocalDate(value: string): Date | undefined {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Date rolls impossible days over, so 2026-02-30 would read as 2026-03-02.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function toDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  if (DATE_ONLY.test(value)) {
    return toLocalDate(value);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDate(value?: string): string | undefined {
  return toDate(value)?.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatDateOnly(value?: string | null): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysUntil(value?: string, from: Date = new Date()): number | undefined {
  const date = toDate(value);
  if (!date) {
    return undefined;
  }
  return Math.round((startOfDay(date) - startOfDay(from)) / MS_PER_DAY);
}

export function formatTime(value?: string): string | undefined {
  return toDate(value)?.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `2026-06-01T00:00:00Z` becomes `01 JUN 2026`, matching the design. */
export function formatReviewDate(value: string): string {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  return `${day} ${month} ${date.getUTCFullYear()}`;
}


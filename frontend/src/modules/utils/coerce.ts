export function toStringOrNull(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

export function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toIntOrNull(raw: string): number | null {
  if (!raw || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

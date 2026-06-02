import { toIntOrNull, toNumberOrNull, toStringOrNull } from './coerce';

describe('toStringOrNull', () => {
  it('returns null for null, undefined, and empty string', () => {
    expect(toStringOrNull(null)).toBeNull();
    expect(toStringOrNull(undefined)).toBeNull();
    expect(toStringOrNull('')).toBeNull();
  });

  it('stringifies non-empty values', () => {
    expect(toStringOrNull('COMMITTED')).toBe('COMMITTED');
    expect(toStringOrNull(42)).toBe('42');
    expect(toStringOrNull(0)).toBe('0');
    expect(toStringOrNull(false)).toBe('false');
  });
});

describe('toNumberOrNull', () => {
  it('returns null for null, undefined, and empty string', () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull('')).toBeNull();
  });

  it('returns null for non-numeric values', () => {
    expect(toNumberOrNull('abc')).toBeNull();
    expect(toNumberOrNull({})).toBeNull();
  });

  it('coerces numeric values and numeric strings', () => {
    expect(toNumberOrNull(10)).toBe(10);
    expect(toNumberOrNull('1000')).toBe(1000);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull(-5)).toBe(-5);
  });
});

describe('toIntOrNull', () => {
  it('returns null for empty input', () => {
    expect(toIntOrNull('')).toBeNull();
  });

  it('returns null for non-numeric and negative input', () => {
    expect(toIntOrNull('abc')).toBeNull();
    expect(toIntOrNull('-1')).toBeNull();
  });

  it('returns null for non-integer numeric strings', () => {
    expect(toIntOrNull('10.9')).toBeNull();
    expect(toIntOrNull('10abc')).toBeNull();
  });

  it('parses non-negative integers', () => {
    expect(toIntOrNull('0')).toBe(0);
    expect(toIntOrNull('250')).toBe(250);
  });
});

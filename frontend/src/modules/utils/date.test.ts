import { daysUntil, formatDate, formatTime } from './date';

describe('formatDate', () => {
  it('formats an ISO timestamp as a localized date', () => {
    expect(formatDate('2026-06-02T13:06:04.124Z')).toEqual(expect.stringContaining('2026'));
  });

  it('keeps the calendar day of a date without a time', () => {
    expect(formatDate('2027-06-02')).toBe('6/2/2027');
  });

  it('returns undefined for missing or invalid values', () => {
    expect(formatDate(undefined)).toBeUndefined();
    expect(formatDate('')).toBeUndefined();
    expect(formatDate('not-a-date')).toBeUndefined();
  });

  it('returns undefined for a day the month does not have', () => {
    expect(formatDate('2026-02-30')).toBeUndefined();
    expect(daysUntil('2026-02-30')).toBeUndefined();
  });
});

describe('daysUntil', () => {
  it('counts the whole days left until the date', () => {
    expect(daysUntil('2026-04-07', new Date(2026, 3, 1))).toBe(6);
  });

  it('counts the day of the date itself as zero', () => {
    expect(daysUntil('2026-04-07', new Date(2026, 3, 7))).toBe(0);
  });

  it('returns a negative count once the date has passed', () => {
    expect(daysUntil('2026-04-07', new Date(2026, 3, 10))).toBe(-3);
  });

  it('returns undefined for missing or invalid values', () => {
    expect(daysUntil(undefined)).toBeUndefined();
    expect(daysUntil('not-a-date')).toBeUndefined();
  });
});

describe('formatTime', () => {
  it('formats an ISO timestamp as a localized time', () => {
    expect(formatTime('2026-06-02T13:06:04.124Z')).toMatch(/\d{2}:\d{2}/);
  });

  it('returns undefined for missing or invalid values', () => {
    expect(formatTime(undefined)).toBeUndefined();
    expect(formatTime('')).toBeUndefined();
    expect(formatTime('not-a-date')).toBeUndefined();
  });
});

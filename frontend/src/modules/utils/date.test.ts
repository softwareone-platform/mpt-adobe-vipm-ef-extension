import { formatDate, formatTime } from './date';

describe('formatDate', () => {
  it('formats an ISO timestamp as a localized date', () => {
    expect(formatDate('2026-06-02T13:06:04.124Z')).toEqual(expect.stringContaining('2026'));
  });

  it('returns undefined for missing or invalid values', () => {
    expect(formatDate(undefined)).toBeUndefined();
    expect(formatDate('')).toBeUndefined();
    expect(formatDate('not-a-date')).toBeUndefined();
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

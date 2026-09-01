import { formatQuantityDelta } from './quantity';

describe('formatQuantityDelta', () => {
  it('signs an increase', () => {
    expect(formatQuantityDelta(6)).toBe('+6');
  });

  it('keeps the sign of a reduction', () => {
    expect(formatQuantityDelta(-69)).toBe('-69');
  });

  it('leaves an unchanged line unsigned', () => {
    expect(formatQuantityDelta(0)).toBe('0');
  });

  it('shows an em dash when there is no change to report', () => {
    expect(formatQuantityDelta(null)).toBe('—');
    expect(formatQuantityDelta(undefined)).toBe('—');
  });
});

import { parsePrice, formatPrice } from './price';

describe('parsePrice', () => {
  it('parses a plain numeric string', () => {
    expect(parsePrice('179.88')).toBe(179.88);
  });

  it('strips thousands separators', () => {
    expect(parsePrice('1,259.16')).toBe(1259.16);
  });

  it('returns 0 for non-numeric or empty input', () => {
    expect(parsePrice('')).toBe(0);
    expect(parsePrice('—')).toBe(0);
  });
});

describe('formatPrice', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatPrice(1259.16)).toBe('1,259.16');
  });

  it('pads to two decimals', () => {
    expect(formatPrice(31.5)).toBe('31.50');
  });
});

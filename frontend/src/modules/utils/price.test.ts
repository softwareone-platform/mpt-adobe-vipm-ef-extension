import {
  applyMarkup,
  parsePrice,
  formatCurrency,
  formatPrice,
  parseUnitPrice,
  getYearlyPrice,
  getMonthlyPrice,
  sumPrices,
} from './price';

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

describe('parseUnitPrice', () => {
  it('parses a formatted unit price', () => {
    expect(parseUnitPrice('1,200.00')).toBe(1200);
  });

  it('returns null for an unpriced item', () => {
    expect(parseUnitPrice('')).toBeNull();
  });
});

describe('getYearlyPrice', () => {
  it('multiplies the unit price by the quantity', () => {
    expect(getYearlyPrice(120, 10)).toBe('1,200.00');
  });

  it('keeps the sign of a negative quantity', () => {
    expect(getYearlyPrice(120, -10)).toBe('-1,200.00');
  });

  it('returns an empty string when there is no unit price', () => {
    expect(getYearlyPrice(null, 10)).toBe('');
    expect(getYearlyPrice(undefined, 10)).toBe('');
  });
});

describe('getMonthlyPrice', () => {
  it('spreads the yearly price across the year', () => {
    expect(getMonthlyPrice(120, 10)).toBe('100.00');
  });

  it('returns an empty string when there is no unit price', () => {
    expect(getMonthlyPrice(null, 10)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats an amount in its currency', () => {
    expect(formatCurrency(20, 'USD')).toBe('$20.00');
  });

  it('returns the plain amount when no currency is given', () => {
    expect(formatCurrency(5)).toBe('5');
  });

  it('falls back to the amount and the code for an unknown currency', () => {
    expect(formatCurrency(5, 'XXXX')).toBe('5 XXXX');
  });
});

describe('applyMarkup', () => {
  it('turns a purchase price into the selling price the price list carries', () => {
    expect(applyMarkup(273.48, 12.3595505618)).toBe(307.28);
    expect(applyMarkup(644.16, 11.1111111111)).toBe(715.73);
  });

  it('returns the price unchanged when nothing is added to it', () => {
    expect(applyMarkup(100, 0)).toBe(100);
  });
});

describe('sumPrices', () => {
  it('totals formatted prices', () => {
    expect(sumPrices(['1,200.00', '300.00'])).toBe('1,500.00');
  });

  it('ignores missing values', () => {
    expect(sumPrices(['300.00', undefined, ''])).toBe('300.00');
  });
});

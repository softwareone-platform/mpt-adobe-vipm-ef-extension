import { EM_DASH, formatDate, formatOrderTypes, formatValue } from './format';

import type { Discount } from '../../shared/model';

describe('formatDate', () => {
  it('truncates an ISO timestamp to its date part', () => {
    expect(formatDate('2026-02-01T00:00:00+00:00')).toBe('2026-02-01');
  });

  it('falls back to the em dash when no value is given', () => {
    expect(formatDate(null)).toBe(EM_DASH);
    expect(formatDate(undefined)).toBe(EM_DASH);
  });
});

describe('formatValue', () => {
  const base: Discount = {
    id: 'rec1',
    code: 'DISCOUNT-CODE-1',
    discountType: 'PERCENTAGE',
  };

  it('falls back to the em dash when there is no value entry', () => {
    expect(formatValue(base)).toBe(EM_DASH);
    expect(formatValue({ ...base, values: [] })).toBe(EM_DASH);
  });

  it('formats a percentage discount', () => {
    expect(
      formatValue({ ...base, values: [{ country: 'US', currency: 'USD', value: 15 }] }),
    ).toBe('15% off');
  });

  it('formats a fixed discount as currency', () => {
    expect(
      formatValue({
        ...base,
        discountType: 'FIXED_DISCOUNT',
        values: [{ country: 'US', currency: 'USD', value: 20 }],
      }),
    ).toBe('$20.00 off');
  });

  it('falls back to a raw value when no currency is given', () => {
    expect(
      formatValue({
        ...base,
        discountType: 'FIXED_PRICE',
        values: [{ country: 'US', value: 5 }],
      }),
    ).toBe('5');
  });
});

describe('formatOrderTypes', () => {
  it('returns Any when no order types are given', () => {
    expect(formatOrderTypes()).toBe('Any');
    expect(formatOrderTypes([])).toBe('Any');
  });

  it('joins the translated labels for the given order types', () => {
    expect(formatOrderTypes(['NEW', 'RENEWAL'])).toBe('Add seats, Renewal');
  });
});

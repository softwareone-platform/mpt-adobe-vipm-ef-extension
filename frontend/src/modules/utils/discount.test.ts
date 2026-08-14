import { formatDiscountValue, getDiscountedUnitPrice } from './discount';

import type { Discount } from '../shared/model';

describe('formatDiscountValue', () => {
  const base: Discount = {
    id: 'rec1',
    code: 'DISCOUNT-CODE-1',
    discountType: 'PERCENTAGE',
  };

  it('falls back to the em dash when there is no value entry', () => {
    expect(formatDiscountValue(base)).toBe('—');
    expect(formatDiscountValue({ ...base, values: [] })).toBe('—');
  });

  it('formats a percentage discount', () => {
    expect(
      formatDiscountValue({ ...base, values: [{ country: 'US', currency: 'USD', value: 15 }] }),
    ).toBe('15% off');
  });

  it('formats a fixed discount as currency', () => {
    expect(
      formatDiscountValue({
        ...base,
        discountType: 'FIXED_DISCOUNT',
        values: [{ country: 'US', currency: 'USD', value: 20 }],
      }),
    ).toBe('$20.00 off');
  });

  it('never turns a discount above 100 percent into a negative price', () => {
    expect(
      getDiscountedUnitPrice(100, {
        id: 'DSC-1',
        code: 'CODE-ONE',
        discountType: 'PERCENTAGE',
        values: [{ country: 'US', currency: 'USD', value: 150 }],
      }),
    ).toBe(0);
  });

  it('ignores a negative percentage rather than raising the price', () => {
    expect(
      getDiscountedUnitPrice(100, {
        id: 'DSC-1',
        code: 'CODE-ONE',
        discountType: 'PERCENTAGE',
        values: [{ country: 'US', currency: 'USD', value: -25 }],
      }),
    ).toBe(100);
  });

  it('falls back to a raw value when no currency is given', () => {
    expect(
      formatDiscountValue({
        ...base,
        discountType: 'FIXED_PRICE',
        values: [{ country: 'US', value: 5 }],
      }),
    ).toBe('5');
  });
});

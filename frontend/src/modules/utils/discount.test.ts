import {
  appliesToOrderType,
  formatDiscountValue,
  getDiscountedUnitPrice,
  getQuotedPrice,
} from './discount';

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

describe('appliesToOrderType', () => {
  const discount: Discount = { id: 'DSC-1', code: 'CODE-ONE' };

  it('applies a code with no order types to a renewal', () => {
    expect(appliesToOrderType(discount, 'RENEWAL')).toBe(true);
    expect(appliesToOrderType({ ...discount, applicableOrderTypes: [] }, 'RENEWAL')).toBe(true);
  });

  it('leaves a code with no order types out of a switch', () => {
    expect(appliesToOrderType(discount, 'SWITCH')).toBe(false);
    expect(appliesToOrderType({ ...discount, applicableOrderTypes: [] }, 'SWITCH')).toBe(false);
  });

  it('applies a code listing the order type', () => {
    expect(appliesToOrderType({ ...discount, applicableOrderTypes: ['NEW', 'SWITCH'] }, 'SWITCH')).toBe(true);
  });

  it('leaves out a code restricted to other order types', () => {
    expect(appliesToOrderType({ ...discount, applicableOrderTypes: ['RENEWAL'] }, 'SWITCH')).toBe(false);
  });
});

describe('getQuotedPrice', () => {
  it('carries the quoted discount onto the list selling price', () => {
    const quoted = getQuotedPrice(1266.53, { discountedPriceRatio: 0.9 });

    expect(quoted?.unitSP).toBeCloseTo(1139.88, 2);
    expect(quoted?.discounted).toBe(true);
  });

  it('keeps the list price, undiscounted, when Adobe applied nothing', () => {
    expect(getQuotedPrice(1266.53, { discountedPriceRatio: 1 })).toEqual({
      unitSP: 1266.53,
      discounted: false,
    });
  });

  it('takes the quoted unit SP the backend priced a price-list line at', () => {
    const pricing = { discountedPriceRatio: 1, quotedUnitSP: 412.95 };

    const quoted = getQuotedPrice(533.05, pricing);

    expect(quoted).toEqual({ unitSP: 412.95, discounted: false });
  });

  it('tells a quoted unit SP a discount code priced below Adobe price', () => {
    const pricing = { discountedPriceRatio: 0.9, quotedUnitSP: 371.65 };

    const quoted = getQuotedPrice(533.05, pricing);

    expect(quoted).toEqual({ unitSP: 371.65, discounted: true });
  });

  it('answers null for a line it cannot price', () => {
    expect(getQuotedPrice(null, { discountedPriceRatio: 0.9 })).toBeNull();
    expect(getQuotedPrice(100, undefined)).toBeNull();
    expect(getQuotedPrice(100, {})).toBeNull();
    expect(getQuotedPrice(100, { quotedUnitSP: 95 })).toBeNull();
  });
});

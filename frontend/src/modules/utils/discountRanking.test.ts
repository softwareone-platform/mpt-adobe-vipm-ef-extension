import type { Discount } from '../shared/model';
import { rankDiscounts } from './discountRanking';

const discount = (code: string, overrides: Partial<Discount> = {}): Discount => ({
  id: `DSC-${code}`,
  code,
  discountType: 'PERCENTAGE',
  values: [{ value: 10 }],
  ...overrides,
});

const codes = (discounts: Discount[]) => discounts.map((entry) => entry.code);

describe('rankDiscounts', () => {
  it('ranks by the net unit price, lowest first', () => {
    const result = rankDiscounts(
      [
        discount('PCT10'),
        discount('FIXED30', { discountType: 'FIXED_DISCOUNT', values: [{ value: 30 }] }),
        discount('PRICE60', { discountType: 'FIXED_PRICE', values: [{ value: 60 }] }),
      ],
      100,
    );

    expect(codes(result)).toEqual(['PRICE60', 'FIXED30', 'PCT10']);
  });

  it('breaks ties on reusable, then closed, then the Adobe discount id', () => {
    const result = rankDiscounts(
      [
        discount('OPEN-B', { source: 'Open', adobeDiscountId: 'B' }),
        discount('OPEN-A', { source: 'Open', adobeDiscountId: 'A' }),
        discount('CLOSED', { source: 'Closed', adobeDiscountId: 'Z' }),
        discount('REUSABLE', { source: 'Open', reusable: true, adobeDiscountId: 'Z' }),
      ],
      100,
    );

    expect(codes(result)).toEqual(['REUSABLE', 'CLOSED', 'OPEN-A', 'OPEN-B']);
  });

  it('ranks a code it cannot price last', () => {
    const result = rankDiscounts([discount('UNPRICED', { values: [] }), discount('PCT10')], 100);

    expect(codes(result)).toEqual(['PCT10', 'UNPRICED']);
  });

  it('drops a single-use code the customer already redeemed', () => {
    const result = rankDiscounts(
      [discount('USED', { values: [{ value: 90 }], redeemedAt: '2026-01-01' }), discount('PCT10')],
      100,
    );

    expect(codes(result)).toEqual(['PCT10']);
  });

  it('falls back to the tie-break when the line has no price', () => {
    const result = rankDiscounts(
      [discount('B', { adobeDiscountId: 'B' }), discount('A', { adobeDiscountId: 'A' })],
      null,
    );

    expect(codes(result)).toEqual(['A', 'B']);
  });
});

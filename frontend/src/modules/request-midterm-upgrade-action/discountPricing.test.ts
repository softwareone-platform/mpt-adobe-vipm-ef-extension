import type { Discount } from '../shared/model';
import {
  findDiscount,
  getBestDiscountCode,
  getLocalUnitPrice,
  getQuotedUnitPrice,
  withDiscount,
} from './discountPricing';
import type { TargetSubscription } from './model';

const TARGET: TargetSubscription = {
  id: null,
  name: null,
  status: '',
  item: { id: 'ITM-1', name: 'Target', externalId: '65322651CA' },
  targetBaseOfferId: '65322651CA02A12',
  recommended: false,
  currentQuantity: 0,
  newQuantity: 4,
  delta: 4,
  unitSP: '120.00',
  spxM: '40.00',
  spxY: '480.00',
  terms: '',
  commitment: '',
};

const discount = (code: string, value: number, overrides: Partial<Discount> = {}): Discount => ({
  id: `DSC-${code}`,
  code,
  discountType: 'PERCENTAGE',
  values: [{ value }],
  ...overrides,
});

describe('discountPricing', () => {
  it('finds a shortlisted code case-insensitively', () => {
    const discounts = [discount('SAVE10', 10)];

    expect(findDiscount(discounts, ' save10 ')?.id).toBe('DSC-SAVE10');
    expect(findDiscount(discounts, '')).toBeUndefined();
    expect(findDiscount(discounts, null)).toBeUndefined();
  });

  it('picks the best-value code for the target, or none', () => {
    expect(getBestDiscountCode([discount('save10', 10), discount('save25', 25)], TARGET)).toBe(
      'SAVE25',
    );
    expect(getBestDiscountCode([], TARGET)).toBe('');
  });

  it('estimates the discounted unit price, keeping the list price without a known code', () => {
    expect(getLocalUnitPrice(TARGET, discount('SAVE25', 25))).toBe(90);
    expect(getLocalUnitPrice(TARGET, undefined)).toBe(120);
    expect(getLocalUnitPrice(TARGET, discount('UNPRICED', 0, { values: [] }))).toBe(120);
    expect(getLocalUnitPrice({ ...TARGET, unitSP: '' }, discount('SAVE25', 25))).toBeNull();
  });

  it('carries the quoted discount onto the selling price', () => {
    const preview = {
      lineItems: [
        { offerId: 'OTHER', pricing: { partnerPrice: 10, discountedPartnerPrice: 1 } },
        { offerId: '65322651CA02A12', pricing: { partnerPrice: 80, discountedPartnerPrice: 60 } },
      ],
    };

    expect(getQuotedUnitPrice(TARGET, preview)).toBe(90);
  });

  it('answers no quoted price without a priced quote for the target', () => {
    expect(getQuotedUnitPrice(TARGET, null)).toBeNull();
    expect(getQuotedUnitPrice(TARGET, { lineItems: [{ offerId: '65322651CA02A12' }] })).toBeNull();
    expect(
      getQuotedUnitPrice(TARGET, {
        lineItems: [{ offerId: '65322651CA02A12', pricing: { partnerPrice: 0, discountedPartnerPrice: 0 } }],
      }),
    ).toBeNull();
  });

  it('re-prices the switched seats and records the code', () => {
    expect(withDiscount(TARGET, 90, 'SAVE25')).toMatchObject({
      discountCode: 'SAVE25',
      unitSP: '90.00',
      spxM: '30.00',
      spxY: '360.00',
    });
    expect(withDiscount(TARGET, null, '')).toMatchObject({ unitSP: '120.00', spxY: '480.00' });
  });
});

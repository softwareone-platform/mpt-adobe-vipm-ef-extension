import { ProductSegment } from '../shared/hooks/useSettings';
import {
  canRequestGlobalCustomer,
  canRequestLinkedMembership,
  canRequestMidtermUpgradeAction,
  canRequestRenewalAction,
  canRequestThreeYearCommitment,
} from './security';

const products: ProductSegment[] = [
  { id: 'PRD-1111-1111', segment: 'COM' },
  { id: 'PRD-2222-2222', segment: 'LGA' },
];

describe('canRequestRenewalAction', () => {
  it('returns true for a client account with a matching product', () => {
    expect(canRequestRenewalAction('Client', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns false for an operations account', () => {
    expect(canRequestRenewalAction('Operations', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product is not in settings', () => {
    expect(canRequestRenewalAction('Client', products, 'PRD-9999-9999')).toBe(false);
  });
});

describe('canRequestMidtermUpgradeAction', () => {
  it('returns true for a client account with a matching product', () => {
    expect(canRequestMidtermUpgradeAction('Client', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true for a client account when the product segment is LGA', () => {
    expect(canRequestMidtermUpgradeAction('Client', products, 'PRD-2222-2222')).toBe(true);
  });

  it('returns false for an operations account', () => {
    expect(canRequestMidtermUpgradeAction('Operations', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false for a vendor account', () => {
    expect(canRequestMidtermUpgradeAction('Vendor', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the account type is undefined', () => {
    expect(canRequestMidtermUpgradeAction(undefined, products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product is not in settings', () => {
    expect(canRequestMidtermUpgradeAction('Client', products, 'PRD-9999-9999')).toBe(false);
  });

  it('returns false when products are not provided', () => {
    expect(canRequestMidtermUpgradeAction('Client', undefined, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product id is undefined', () => {
    expect(canRequestMidtermUpgradeAction('Client', products, undefined)).toBe(false);
  });
});

describe('canRequestThreeYearCommitment', () => {
  it('returns true for an operations account with a matching non-LGA product', () => {
    expect(canRequestThreeYearCommitment('Operations', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true for a vendor account with a matching non-LGA product', () => {
    expect(canRequestThreeYearCommitment('Vendor', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns false for a client account', () => {
    expect(canRequestThreeYearCommitment('Client', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the account type is undefined', () => {
    expect(canRequestThreeYearCommitment(undefined, products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product is not in settings', () => {
    expect(canRequestThreeYearCommitment('Operations', products, 'PRD-9999-9999')).toBe(false);
  });

  it('returns false when the product segment is LGA', () => {
    expect(canRequestThreeYearCommitment('Operations', products, 'PRD-2222-2222')).toBe(false);
  });

  it('returns false when products are not provided', () => {
    expect(canRequestThreeYearCommitment('Operations', undefined, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product id is undefined', () => {
    expect(canRequestThreeYearCommitment('Operations', products, undefined)).toBe(false);
  });
});

describe('canRequestLinkedMembership', () => {
  it('returns true for an operations account with a matching product', () => {
    expect(canRequestLinkedMembership('Operations', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true for a vendor account with a matching product', () => {
    expect(canRequestLinkedMembership('Vendor', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true when the product segment is LGA, unlike the 3YC button', () => {
    expect(canRequestLinkedMembership('Operations', products, 'PRD-2222-2222')).toBe(true);
  });

  it('returns false for a client account', () => {
    expect(canRequestLinkedMembership('Client', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product is not in settings', () => {
    expect(canRequestLinkedMembership('Operations', products, 'PRD-9999-9999')).toBe(false);
  });

  it('returns false when products are not provided', () => {
    expect(canRequestLinkedMembership('Operations', undefined, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product id is undefined', () => {
    expect(canRequestLinkedMembership('Operations', products, undefined)).toBe(false);
  });
});

describe('canRequestGlobalCustomer', () => {
  it('returns true for an operations account with a matching product', () => {
    expect(canRequestGlobalCustomer('Operations', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true for a vendor account with a matching product', () => {
    expect(canRequestGlobalCustomer('Vendor', products, 'PRD-1111-1111')).toBe(true);
  });

  it('returns true when the product segment is LGA, like the linked membership button', () => {
    expect(canRequestGlobalCustomer('Operations', products, 'PRD-2222-2222')).toBe(true);
  });

  it('returns false for a client account', () => {
    expect(canRequestGlobalCustomer('Client', products, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product is not in settings', () => {
    expect(canRequestGlobalCustomer('Operations', products, 'PRD-9999-9999')).toBe(false);
  });

  it('returns false when products are not provided', () => {
    expect(canRequestGlobalCustomer('Operations', undefined, 'PRD-1111-1111')).toBe(false);
  });

  it('returns false when the product id is undefined', () => {
    expect(canRequestGlobalCustomer('Operations', products, undefined)).toBe(false);
  });
});

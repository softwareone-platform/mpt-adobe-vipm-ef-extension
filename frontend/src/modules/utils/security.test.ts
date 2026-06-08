import { ProductSegment } from '../agreement/hooks/useSettings';
import { canRequestThreeYearCommitment } from './security';

const products: ProductSegment[] = [
  { id: 'PRD-1111-1111', segment: 'COM' },
  { id: 'PRD-2222-2222', segment: 'LGA' },
];

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

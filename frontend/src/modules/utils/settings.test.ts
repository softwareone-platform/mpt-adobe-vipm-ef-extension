import { ProductSegment } from '../shared/hooks/useSettings';
import { getProduct } from './settings';

const products: ProductSegment[] = [
  { id: 'PRD-1111-1111', segment: 'COM' },
  { id: 'PRD-2222-2222', segment: 'LGA' },
];

describe('getProduct', () => {
  it('returns the product matching the id', () => {
    expect(getProduct(products, 'PRD-2222-2222')).toEqual({
      id: 'PRD-2222-2222',
      segment: 'LGA',
    });
  });

  it('returns undefined when no product matches', () => {
    expect(getProduct(products, 'PRD-9999-9999')).toBeUndefined();
  });

  it('returns undefined when products are not provided', () => {
    expect(getProduct(undefined, 'PRD-1111-1111')).toBeUndefined();
  });
});

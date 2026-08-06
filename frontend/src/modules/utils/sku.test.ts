import { getPartialSku } from './sku';

describe('getPartialSku', () => {
  it('keeps the discount-level-agnostic prefix of a full offer id', () => {
    expect(getPartialSku('65322587CA01A12')).toBe('65322587CA');
  });

  it('leaves a partial SKU untouched', () => {
    expect(getPartialSku('65322587CA')).toBe('65322587CA');
  });

  it('passes shorter ids through unchanged', () => {
    expect(getPartialSku('SHORT')).toBe('SHORT');
    expect(getPartialSku('')).toBe('');
  });
});

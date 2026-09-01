import { toDiscountErrorMessage } from './adobeError';

describe('toDiscountErrorMessage', () => {
  it('rewrites Adobe’s unknown-code rejection as the wizard’s own copy', () => {
    const message = toDiscountErrorMessage(
      '2146 - Invalid Flexible Discount Code: Line Item: 1, Reason: NOT_FOUND',
      'TEST123',
    );

    expect(message).toContain('TEST123');
    expect(message).toContain('is not known');
  });

  it('leaves another Adobe rejection as it arrived', () => {
    const verbatim = '2141 - Customer is not qualified for the Flexible Discount: Line Item: 1';

    expect(toDiscountErrorMessage(verbatim, 'TEST123')).toBe(verbatim);
  });

  it('leaves a message that carries no Adobe code alone', () => {
    expect(toDiscountErrorMessage('Request failed', '')).toBe('Request failed');
  });
});

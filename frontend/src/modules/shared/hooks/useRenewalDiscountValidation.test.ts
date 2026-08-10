import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanSubscriptionSelection } from '../model';
import { useRenewalDiscountValidation } from './useRenewalDiscountValidation';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const SUBSCRIPTIONS: RenewalPlanSubscriptionSelection[] = [
  { id: 'SUB-1', offerId: '65322587CA01A12', renew: true, renewalQuantity: 53 },
  { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
];

describe('useRenewalDiscountValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('previews the renewing subscriptions with the selected discount codes', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts(SUBSCRIPTIONS, ['CODE-ONE']);
    });

    expect(isValid).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/renewal-order/preview',
      { subscriptions: SUBSCRIPTIONS, flexDiscountCodes: ['CODE-ONE'] },
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('skips the preview when nothing renews', async () => {
    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    const subscriptions: RenewalPlanSubscriptionSelection[] = [
      { id: 'SUB-1', offerId: '65322587CA01A12', renew: false, renewalQuantity: 0 },
    ];
    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts(subscriptions, ['CODE-ONE']);
    });

    expect(isValid).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('surfaces the backend detail when Adobe rejects a discount code', async () => {
    mockPost.mockRejectedValue({
      response: { data: { detail: '3132 - Ineligible product or orderType' } },
    });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts(SUBSCRIPTIONS, ['BAD-CODE']);
    });

    expect(isValid).toBe(false);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('3132 - Ineligible product or orderType');
  });

  it('falls back to a generic message when the failure carries no detail', async () => {
    mockPost.mockRejectedValue({});

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validateDiscounts(SUBSCRIPTIONS, ['CODE-ONE']);
    });

    await waitFor(() =>
      expect(result.current.error).toBe('The selected discount codes could not be validated.'),
    );
  });

  it('moves to loading while the validation is in flight and refuses a concurrent run', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.validateDiscounts(SUBSCRIPTIONS, ['CODE-ONE']);
    });
    await waitFor(() => expect(result.current.status).toBe('loading'));

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.validateDiscounts(SUBSCRIPTIONS, ['CODE-ONE']);
    });
    expect(second).toBe(false);

    await act(async () => {
      resolveRequest({ data: { data: {} } });
      await first;
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('clears the outcome on reset', async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: 'Adobe rejected the code.' } } });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validateDiscounts(SUBSCRIPTIONS, ['CODE-ONE']);
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanBody } from '../model';
import { useRenewalDiscountValidation } from './useRenewalDiscountValidation';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const PLAN: RenewalPlanBody = {
  renewalPath: 'now',
  subscriptions: [
    {
      id: 'SUB-1',
      offerId: '65322587CA01A12',
      renew: true,
      renewalQuantity: 53,
      flexDiscountCodes: ['CODE-ONE'],
    },
    { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
  ],
  netNewItems: [],
};

describe('useRenewalDiscountValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('previews the early-renewal plan with each line carrying its own codes', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts(PLAN);
    });

    expect(isValid).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/renewal-order/preview',
      PLAN,
      expect.objectContaining({ signal: expect.anything() }),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('skips the preview at the anniversary, where fulfilment validates the codes', async () => {
    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts({ ...PLAN, renewalPath: 'anniversary' });
    });

    expect(isValid).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('drops the quote when the customer edits the codes again', async () => {
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useRenewalDiscountValidation('AGR-1234-5678', onPreview),
    );

    act(() => result.current.reset());

    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('drops the quote when Adobe rejects the codes', async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: 'Adobe rejected the code.' } } });
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useRenewalDiscountValidation('AGR-1234-5678', onPreview),
    );

    await act(async () => {
      await result.current.validateDiscounts(PLAN);
    });

    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('ignores a quote for a plan the customer has already moved past', async () => {
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useRenewalDiscountValidation('AGR-1234-5678', onPreview),
    );

    mockPost.mockResolvedValue({
      data: { preview: { lineItems: [{ offerId: 'STALE' }] } },
    });
    await act(async () => {
      const stale = result.current.validateDiscounts(PLAN);
      await result.current.validateDiscounts({ ...PLAN, renewalPath: 'anniversary' });
      await stale;
    });

    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('drops the quote it held when the plan can no longer be quoted', async () => {
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useRenewalDiscountValidation('AGR-1234-5678', onPreview),
    );

    await act(async () => {
      await result.current.validateDiscounts({ ...PLAN, renewalPath: 'anniversary' });
    });

    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('skips the preview when the plan renews and adds nothing', async () => {
    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts({
        renewalPath: 'now',
        subscriptions: [
          { id: 'SUB-1', offerId: '65322587CA01A12', renew: false, renewalQuantity: 0 },
        ],
        netNewItems: [],
      });
    });

    expect(isValid).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('previews an add-only early-renewal basket', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validateDiscounts({
        renewalPath: 'now',
        subscriptions: [],
        netNewItems: [{ offerId: '65304578CA01A12', quantity: 5 }],
      });
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('surfaces the backend detail when Adobe rejects a discount code', async () => {
    mockPost.mockRejectedValue({
      response: { data: { detail: '3132 - Ineligible product for orderType' } },
    });

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscounts(PLAN);
    });

    expect(isValid).toBe(false);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('3132 - Ineligible product for orderType');
  });

  it('falls back to a generic message when the failure carries no detail', async () => {
    mockPost.mockRejectedValue({});

    const { result } = renderHook(() => useRenewalDiscountValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validateDiscounts(PLAN);
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
      first = result.current.validateDiscounts(PLAN);
    });
    await waitFor(() => expect(result.current.status).toBe('loading'));

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.validateDiscounts(PLAN);
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
      await result.current.validateDiscounts(PLAN);
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

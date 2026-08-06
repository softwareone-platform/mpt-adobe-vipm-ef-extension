import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useRenewalOrderRequest } from './useRenewalOrderRequest';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const ORDER_INPUT = {
  subscriptions: [{ id: 'SUB-1', offerId: 'OFFER-1', renew: true, renewalQuantity: 5 }],
  netNewItems: [{ offerId: 'OFFER-2', quantity: 3 }],
  flexDiscountCodes: ['CODE-ONE'],
  recommendationTrackerId: 'TRACKER-1',
};

const CREATED_ORDER = {
  id: 'ORD-1',
  status: 'Processing',
  type: 'Change',
};

describe('useRenewalOrderRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('posts the plan, the codes and the tracker id to the renewal order endpoint', async () => {
    mockPost.mockResolvedValue({ data: { data: CREATED_ORDER } });

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitOrder(ORDER_INPUT);
    });

    expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1/renewal-order', ORDER_INPUT);
    expect(resolved).toEqual(CREATED_ORDER);
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('moves to loading while the request is in flight', async () => {
    let resolveRequest!: (value: { data: { data: typeof CREATED_ORDER } }) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    let pending: ReturnType<typeof result.current.submitOrder>;
    act(() => {
      pending = result.current.submitOrder(ORDER_INPUT);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveRequest({ data: { data: CREATED_ORDER } });
      await pending;
    });

    expect(result.current.status).toBe('success');
  });

  it('ignores a concurrent submit while a request is in flight', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    let first: ReturnType<typeof result.current.submitOrder>;
    let second: ReturnType<typeof result.current.submitOrder>;
    act(() => {
      first = result.current.submitOrder(ORDER_INPUT);
      second = result.current.submitOrder(ORDER_INPUT);
    });

    expect(await second!).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ data: { data: CREATED_ORDER } });
      await first!;
    });

    expect(await first!).toEqual(CREATED_ORDER);
  });

  it('returns false and surfaces the backend detail when the order is rejected', async () => {
    mockPost.mockRejectedValue({
      response: { data: { detail: 'Adobe rejected the discount code.' } },
    });

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitOrder(ORDER_INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Adobe rejected the discount code.');
  });

  it('falls back to the response title and then the error message', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { title: 'Validation failed' } } });

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    await act(async () => {
      await result.current.submitOrder(ORDER_INPUT);
    });
    expect(result.current.error).toBe('Validation failed');

    mockPost.mockRejectedValueOnce(new Error('Network down'));
    await act(async () => {
      await result.current.submitOrder(ORDER_INPUT);
    });
    expect(result.current.error).toBe('Network down');
  });

  it('fails when the response does not include the created order', async () => {
    mockPost.mockResolvedValue({ data: { data: null } });

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitOrder(ORDER_INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Order response did not include the created order.');
  });

  it('resets back to idle after an error', async () => {
    mockPost.mockRejectedValue(new Error('Order submission failed.'));

    const { result } = renderHook(() => useRenewalOrderRequest('AGR-1'));

    await act(async () => {
      await result.current.submitOrder(ORDER_INPUT);
    });
    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

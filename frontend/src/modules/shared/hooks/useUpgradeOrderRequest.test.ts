import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useUpgradeOrderRequest } from './useUpgradeOrderRequest';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const ORDER_INPUT = {
  targetOfferId: '65322651CA02A12',
  quantity: 6,
  recommendationTrackerId: 'TRACKER-1',
};

const CREATED_ORDER = {
  id: 'ORD-2222-2222',
  status: 'Processing',
  type: 'Change',
};

describe('useUpgradeOrderRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('posts the upgrade order to the correct endpoint with the right payload', async () => {
    mockPost.mockResolvedValue({ data: { data: CREATED_ORDER } });

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitOrder(ORDER_INPUT);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/subscriptions/SUB-1234-5678/upgrade-order',
      ORDER_INPUT,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(resolved).toEqual(CREATED_ORDER);
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('moves to loading while the request is in flight', async () => {
    let resolveRequest!: () => void;
    mockPost.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

    let pending: ReturnType<typeof result.current.submitOrder>;
    act(() => {
      pending = result.current.submitOrder(ORDER_INPUT);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveRequest();
      await pending;
    });
  });

  it('ignores a concurrent submit while a request is in flight', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

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

  it('allows a new submit after the previous request settles', async () => {
    mockPost.mockResolvedValue({ data: { data: CREATED_ORDER } });

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

    await act(async () => {
      await result.current.submitOrder(ORDER_INPUT);
    });
    await act(async () => {
      await result.current.submitOrder(ORDER_INPUT);
    });

    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('returns false and surfaces the backend detail when the request fails', async () => {
    mockPost.mockRejectedValue({
      response: { data: { detail: 'Adobe rejected the switch preview.' } },
    });

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitOrder(ORDER_INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Adobe rejected the switch preview.');
  });

  it('falls back to the response title and then the error message', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { title: 'Validation failed' } } });

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

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

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

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

    const { result } = renderHook(() => useUpgradeOrderRequest('AGR-1234-5678', 'SUB-1234-5678'));

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

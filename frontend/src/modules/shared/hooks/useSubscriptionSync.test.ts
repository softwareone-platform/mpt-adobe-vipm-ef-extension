import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useSubscriptionSync } from './useSubscriptionSync';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

describe('useSubscriptionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the encoded subscription id and exposes the returned subscription', async () => {
    const subscription = { id: 'SUB-1234-5678-9012', status: 'Active' };
    mockPost.mockResolvedValue({ data: { data: subscription } });

    const { result } = renderHook(() => useSubscriptionSync('SUB-1234-5678-9012'));

    await act(async () => {
      await result.current.syncSubscription();
    });

    expect(mockPost).toHaveBeenCalledWith('/api/v2/subscriptions/SUB-1234-5678-9012/sync');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.subscription).toEqual(subscription);
    expect(result.current.lastStatus).toBe('success');
    expect(result.current.lastCompleted).toEqual(expect.any(String));
    expect(result.current.error).toBe('');
  });

  it('does not post when subscription id is missing', async () => {
    const { result } = renderHook(() => useSubscriptionSync(''));

    await act(async () => {
      await result.current.syncSubscription();
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.subscription).toBeNull();
  });

  it('records sync failures and leaves the subscription null', async () => {
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));

    const { result } = renderHook(() => useSubscriptionSync('SUB-1234-5678-9012'));

    await act(async () => {
      await result.current.syncSubscription();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.lastStatus).toBe('error');
    expect(result.current.error).toBe('Marketplace unavailable');
    expect(result.current.subscription).toBeNull();
  });

  it('clears a previously loaded subscription when a resync fails', async () => {
    const subscription = { id: 'SUB-1234-5678-9012', status: 'Active' };
    mockPost.mockResolvedValueOnce({ data: { data: subscription } });

    const { result } = renderHook(() => useSubscriptionSync('SUB-1234-5678-9012'));

    await act(async () => {
      await result.current.syncSubscription();
    });
    await waitFor(() => expect(result.current.subscription).toEqual(subscription));

    mockPost.mockRejectedValueOnce(new Error('Marketplace unavailable'));
    await act(async () => {
      await result.current.syncSubscription();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.subscription).toBeNull();
  });
});

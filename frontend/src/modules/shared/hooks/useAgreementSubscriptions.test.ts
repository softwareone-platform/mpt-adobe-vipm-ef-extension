import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAgreementSubscriptions } from './useAgreementSubscriptions';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const SUBSCRIPTIONS = [
  { id: 'SUB-1111-1111', name: 'Subscription One' },
  { id: 'SUB-2222-2222', name: 'Subscription Two' },
];

describe('useAgreementSubscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when no agreement id is given', () => {
    const { result } = renderHook(() => useAgreementSubscriptions(''));

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the subscriptions of the encoded agreement id', async () => {
    mockGet.mockResolvedValue({ data: { data: SUBSCRIPTIONS } });

    const { result } = renderHook(() => useAgreementSubscriptions('AGR-1234-5678-9012'));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(SUBSCRIPTIONS);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678-9012/subscriptions',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('reports the failure and keeps no subscriptions', async () => {
    mockGet.mockRejectedValue(new Error('Marketplace unavailable'));

    const { result } = renderHook(() => useAgreementSubscriptions('AGR-1234-5678-9012'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Marketplace unavailable');
    expect(result.current.data).toEqual([]);
  });

  it('drops the loaded subscriptions when the agreement id goes away', async () => {
    mockGet.mockResolvedValue({ data: { data: SUBSCRIPTIONS } });

    const { result, rerender } = renderHook(({ id }) => useAgreementSubscriptions(id), {
      initialProps: { id: 'AGR-1234-5678-9012' },
    });

    await waitFor(() => expect(result.current.data).toEqual(SUBSCRIPTIONS));

    rerender({ id: '' });

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toEqual([]);
  });

  it('refetches on refresh', async () => {
    mockGet.mockResolvedValue({ data: { data: SUBSCRIPTIONS } });

    const { result } = renderHook(() => useAgreementSubscriptions('AGR-1234-5678-9012'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

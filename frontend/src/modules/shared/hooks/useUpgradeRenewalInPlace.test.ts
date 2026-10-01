import { renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useUpgradeRenewalInPlace } from './useUpgradeRenewalInPlace';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const AGREEMENT_ID = 'AGR-1234-5678';
const URL = `/api/v2/agreements/${AGREEMENT_ID}/upgrade-order/renewal-in-place`;

describe('useUpgradeRenewalInPlace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useUpgradeRenewalInPlace(''));

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each(['early', 'staged'])('reports a %s renewal in place', async (renewalInPlace) => {
    mockGet.mockResolvedValueOnce({ data: { data: { renewalInPlace } } });

    const { result } = renderHook(() => useUpgradeRenewalInPlace(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe(renewalInPlace);
    expect(mockGet).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('reports no renewal in place', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { renewalInPlace: null } } });

    const { result } = renderHook(() => useUpgradeRenewalInPlace(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBeNull();
  });

  it('surfaces the request error', async () => {
    mockGet.mockRejectedValueOnce(new Error('Adobe service request failed'));

    const { result } = renderHook(() => useUpgradeRenewalInPlace(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe service request failed');
  });

  it('falls back to its own message for a non-Error rejection', async () => {
    mockGet.mockRejectedValueOnce('boom');

    const { result } = renderHook(() => useUpgradeRenewalInPlace(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('renewal is in place');
  });

  it('ignores an answer that arrives after unmount', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockGet.mockReturnValueOnce(new Promise((done) => { resolve = done; }));

    const { result, unmount } = renderHook(() => useUpgradeRenewalInPlace(AGREEMENT_ID));
    unmount();
    resolve({ data: { data: { renewalInPlace: 'early' } } });

    await waitFor(() => expect(result.current.status).toBe('loading'));
  });
});

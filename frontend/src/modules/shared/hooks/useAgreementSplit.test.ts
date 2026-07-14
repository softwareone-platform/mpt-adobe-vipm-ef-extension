import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAgreementSplit } from './useAgreementSplit';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const _AGREEMENT_ID = 'AGR-1234-5678-9012';

const _SPLIT = {
  id: 'SBA-0000-0001',
  revision: 1,
  allocations: [
    {
      buyer: { id: 'BUY-0000-0001', name: 'Dummy Buyer One' },
      percentage: 100,
      price: { currency: 'USD', SPxY: 100, SPxM: 10 },
    },
  ],
};

describe('useAgreementSplit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when the agreement id is missing', () => {
    const { result } = renderHook(() => useAgreementSplit(''));
    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the split for a valid agreement id', async () => {
    mockGet.mockResolvedValue({ data: { data: _SPLIT } });

    const { result } = renderHook(() => useAgreementSplit(_AGREEMENT_ID));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(_SPLIT);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(`/api/v2/agreements/${_AGREEMENT_ID}/split`);
  });

  it('records errors when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Split unavailable'));

    const { result } = renderHook(() => useAgreementSplit(_AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Split unavailable');
    expect(result.current.data).toBeNull();
  });

  it('falls back to a generic error message for non-Error rejections', async () => {
    mockGet.mockRejectedValue('boom');

    const { result } = renderHook(() => useAgreementSplit(_AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Failed to load agreement split.');
  });

  it('encodes the agreement id in the request URL', async () => {
    mockGet.mockResolvedValue({ data: { data: _SPLIT } });

    renderHook(() => useAgreementSplit('AGR-1/2'));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith('/api/v2/agreements/AGR-1%2F2/split');
  });

  it('re-fetches when refresh is called', async () => {
    mockGet.mockResolvedValue({ data: { data: _SPLIT } });

    const { result } = renderHook(() => useAgreementSplit(_AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

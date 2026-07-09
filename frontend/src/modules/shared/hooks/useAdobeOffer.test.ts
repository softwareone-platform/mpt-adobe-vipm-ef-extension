import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAdobeOffer } from './useAdobeOffer';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const _AGREEMENT_ID = 'AGR-1234-5678-9012';
const _SUBSCRIPTION_ID = 'a1b2c3NA';

const _SWITCH_PATHS = {
  totalCount: 1,
  count: 1,
  offset: 0,
  limit: 20,
  productUpgrades: [
    { sourceBaseOfferId: 'SRCBASEOFF', targetList: [] },
  ],
};

describe('useAdobeOffer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when either id is missing', () => {
    const missingSub = renderHook(() => useAdobeOffer(_AGREEMENT_ID, ''));
    expect(missingSub.result.current.status).toBe('idle');

    const missingAgr = renderHook(() => useAdobeOffer('', _SUBSCRIPTION_ID));
    expect(missingAgr.result.current.status).toBe('idle');

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches offer switch paths for valid ids', async () => {
    mockGet.mockResolvedValue({ data: { data: _SWITCH_PATHS } });

    const { result } = renderHook(() => useAdobeOffer(_AGREEMENT_ID, _SUBSCRIPTION_ID));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(_SWITCH_PATHS);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v2/agreements/${_AGREEMENT_ID}/subscriptions/${_SUBSCRIPTION_ID}/offer-switch-paths`,
    );
  });

  it('records errors when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useAdobeOffer(_AGREEMENT_ID, _SUBSCRIPTION_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toBeNull();
  });

  it('falls back to a generic error message for non-Error rejections', async () => {
    mockGet.mockRejectedValue('boom');

    const { result } = renderHook(() => useAdobeOffer(_AGREEMENT_ID, _SUBSCRIPTION_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Failed to load Adobe offer switch paths.');
  });

  it('encodes both ids in the request URL', async () => {
    mockGet.mockResolvedValue({ data: { data: _SWITCH_PATHS } });

    renderHook(() => useAdobeOffer('AGR-1/2', 'sub/NA'));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1%2F2/subscriptions/sub%2FNA/offer-switch-paths',
    );
  });

  it('re-fetches when refresh is called', async () => {
    mockGet.mockResolvedValue({ data: { data: _SWITCH_PATHS } });

    const { result } = renderHook(() => useAdobeOffer(_AGREEMENT_ID, _SUBSCRIPTION_ID));

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

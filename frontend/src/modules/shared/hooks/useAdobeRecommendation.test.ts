import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAdobeRecommendation } from './useAdobeRecommendation';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const _AGREEMENT_ID = 'AGR-1234-5678-9012';
const _SOURCE_SKU = 'OFFER-SOURCE';
const _SOURCE_QTY = 10;

const _RECOMMENDATIONS = {
  productRecommendations: {
    upsells: [],
    crossSells: [{ rank: 0, product: { baseOfferId: 'OFFER-CROSS' } }],
    addOns: [],
  },
  xRecommendationTrackerId: 'TRACKER-1',
};

describe('useAdobeRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when an input is missing', () => {
    const missingAgr = renderHook(() =>
      useAdobeRecommendation('', _SOURCE_SKU, _SOURCE_QTY),
    );
    expect(missingAgr.result.current.status).toBe('idle');

    const missingSku = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, '', _SOURCE_QTY),
    );
    expect(missingSku.result.current.status).toBe('idle');

    const zeroQty = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, 0),
    );
    expect(zeroQty.result.current.status).toBe('idle');

    const nanQty = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, Number.NaN),
    );
    expect(nanQty.result.current.status).toBe('idle');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('fetches recommendations for valid inputs', async () => {
    mockPost.mockResolvedValue({ data: { data: _RECOMMENDATIONS } });

    const { result } = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, _SOURCE_QTY),
    );

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(_RECOMMENDATIONS);
    expect(result.current.error).toBeNull();
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v2/agreements/${_AGREEMENT_ID}/recommendations`,
      { offers: [{ offerId: _SOURCE_SKU, quantity: _SOURCE_QTY }] },
    );
  });

  it('records errors when the request fails', async () => {
    mockPost.mockRejectedValue(new Error('Adobe unavailable'));

    const { result } = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, _SOURCE_QTY),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toBeNull();
  });

  it('falls back to a generic error message for non-Error rejections', async () => {
    mockPost.mockRejectedValue('boom');

    const { result } = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, _SOURCE_QTY),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Failed to load Adobe recommendations.');
  });

  it('encodes the agreement id in the request URL', async () => {
    mockPost.mockResolvedValue({ data: { data: _RECOMMENDATIONS } });

    renderHook(() => useAdobeRecommendation('AGR-1/2', _SOURCE_SKU, _SOURCE_QTY));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1%2F2/recommendations',
      expect.anything(),
    );
  });

  it('re-fetches when refresh is called', async () => {
    mockPost.mockResolvedValue({ data: { data: _RECOMMENDATIONS } });

    const { result } = renderHook(() =>
      useAdobeRecommendation(_AGREEMENT_ID, _SOURCE_SKU, _SOURCE_QTY),
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockPost).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});

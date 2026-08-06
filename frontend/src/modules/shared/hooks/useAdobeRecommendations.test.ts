import { renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAdobeRecommendations } from './useAdobeRecommendations';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const AGREEMENT_ID = 'AGR-1234-5678-9012';
const OFFERS = [
  { offerId: '65322587CA', quantity: 10 },
  { offerId: '65322588CA', quantity: 3 },
];

const RECOMMENDATIONS = {
  productRecommendations: {
    upsells: [{ rank: 0, product: { baseOfferId: '65304578CA' } }],
    crossSells: [],
    addOns: [],
  },
  xRecommendationTrackerId: 'TRACKER-1',
};

describe('useAdobeRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement or offers', () => {
    const missingAgreement = renderHook(() => useAdobeRecommendations('', OFFERS));
    expect(missingAgreement.result.current.status).toBe('idle');

    const missingOffers = renderHook(() => useAdobeRecommendations(AGREEMENT_ID, []));
    expect(missingOffers.result.current.status).toBe('idle');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('fetches recommendations for the whole offer set', async () => {
    mockPost.mockResolvedValue({ data: { data: RECOMMENDATIONS } });

    const { result } = renderHook(() => useAdobeRecommendations(AGREEMENT_ID, OFFERS));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(RECOMMENDATIONS);
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v2/agreements/${AGREEMENT_ID}/recommendations`,
      { offers: OFFERS },
    );
  });

  it('does not refetch when the offers array is recreated with the same content', async () => {
    mockPost.mockResolvedValue({ data: { data: RECOMMENDATIONS } });

    const { result, rerender } = renderHook(
      ({ offers }) => useAdobeRecommendations(AGREEMENT_ID, offers),
      { initialProps: { offers: OFFERS } },
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    rerender({ offers: OFFERS.map((offer) => ({ ...offer })) });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('reports fetch failures', async () => {
    mockPost.mockRejectedValue(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useAdobeRecommendations(AGREEMENT_ID, OFFERS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
  });
});

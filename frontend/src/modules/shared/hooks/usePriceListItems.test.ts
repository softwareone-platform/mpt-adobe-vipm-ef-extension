import { renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { usePriceListItems } from './usePriceListItems';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const AGREEMENT_ID = 'AGR-1234-5678';
const RECOMMENDED_SKUS = new Set(['65304578CA']);

const ITEM = (id: string, recommended = false) => ({
  id: `PRI-${id}`,
  status: 'ForSale',
  unitLP: 234,
  unitSP: 234,
  recommended,
  item: { id: `ITM-${id}`, name: `Item ${id}` },
});

describe('usePriceListItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => usePriceListItems('', RECOMMENDED_SKUS));

    expect(result.current.status).toBe('idle');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('loads the crossed price list items from the extension backend', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: [ITEM('1'), ITEM('2', true)] } });

    const { result } = renderHook(() => usePriceListItems(AGREEMENT_ID, RECOMMENDED_SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[1].recommended).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v2/agreements/${AGREEMENT_ID}/price-list-items`,
      { recommendedSkus: ['65304578CA'] },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('serializes the recommended SKUs deterministically', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: [] } });

    const { result } = renderHook(() =>
      usePriceListItems(AGREEMENT_ID, new Set(['65322587CA', '65304578CA'])),
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      { recommendedSkus: ['65304578CA', '65322587CA'] },
      expect.anything(),
    );
  });

  it('treats a body without items as empty', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => usePriceListItems(AGREEMENT_ID, RECOMMENDED_SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toHaveLength(0);
  });

  it('reports fetch failures', async () => {
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));

    const { result } = renderHook(() => usePriceListItems(AGREEMENT_ID, RECOMMENDED_SKUS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Marketplace unavailable');
  });

  it('refetches on refresh', async () => {
    mockPost.mockResolvedValue({ data: { data: [ITEM('1')] } });

    const { result } = renderHook(() => usePriceListItems(AGREEMENT_ID, RECOMMENDED_SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    result.current.refresh();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
  });
});

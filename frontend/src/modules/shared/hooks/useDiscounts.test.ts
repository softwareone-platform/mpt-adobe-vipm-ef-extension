import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useDiscounts } from './useDiscounts';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const DISCOUNTS = [
  { id: 'rec1', code: 'DISCOUNT-CODE-1', discountType: 'PERCENTAGE' },
  { id: 'rec2', code: 'DISCOUNT-CODE-2', discountType: 'PERCENTAGE' },
];

function paginatedResponse(data: unknown[], total: number) {
  return { data: { data, $meta: { pagination: { offset: 0, limit: 10, total } } } };
}

describe('useDiscounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when no agreement id is given', () => {
    const { result } = renderHook(() => useDiscounts('', 1, 10));

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the first page with the agreement scope and pagination params', async () => {
    mockGet.mockResolvedValue(paginatedResponse(DISCOUNTS, 5));

    const { result } = renderHook(() => useDiscounts('AGR-0000-0000-0000', 1, 10));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(DISCOUNTS);
    expect(result.current.total).toBe(5);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-0000-0000-0000', limit: 10, offset: 0 }),
      }),
    );
  });

  it('computes the offset from the requested page and page size', async () => {
    mockGet.mockResolvedValue(paginatedResponse([], 12));

    renderHook(() => useDiscounts('AGR-0000-0000-0000', 3, 5));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-0000-0000-0000', limit: 5, offset: 10 }),
      }),
    );
  });

  it('re-fetches when the page changes', async () => {
    mockGet.mockResolvedValue(paginatedResponse(DISCOUNTS, 25));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useDiscounts('AGR-0000-0000-0000', page, 10),
      { initialProps: { page: 1 } },
    );

    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ page: 2 });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-0000-0000-0000', limit: 10, offset: 10 }),
      }),
    );
  });

  it('sends sort and filters query params when provided', async () => {
    mockGet.mockResolvedValue(paginatedResponse(DISCOUNTS, 2));
    const filters = {
      type: 'and',
      expressions: [{ type: 'binary', field: 'source', operator: 'eq', value: 'Open' }],
    };

    renderHook(() =>
      useDiscounts('AGR-0000-0000-0000', 1, 10, {
        sortBy: 'source',
        sortDir: 'desc',
        filters: JSON.stringify(filters),
      }),
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({
          agreement: 'AGR-0000-0000-0000',
          limit: 10,
          offset: 0,
          sortBy: 'source',
          sortDir: 'desc',
          filters: JSON.stringify(filters),
        }),
      }),
    );
  });

  it('falls back to the page length when the response has no pagination meta', async () => {
    mockGet.mockResolvedValue({ data: { data: DISCOUNTS } });

    const { result } = renderHook(() => useDiscounts('AGR-0000-0000-0000', 1, 10));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.total).toBe(DISCOUNTS.length);
  });

  it('records errors when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Airtable unavailable'));

    const { result } = renderHook(() => useDiscounts('AGR-0000-0000-0000', 1, 10));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Airtable unavailable');
  });

  it('re-fetches when refresh is called', async () => {
    mockGet
      .mockResolvedValueOnce(paginatedResponse([DISCOUNTS[0]], 1))
      .mockResolvedValueOnce(paginatedResponse(DISCOUNTS, 2));

    const { result } = renderHook(() => useDiscounts('AGR-0000-0000-0000', 1, 10));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([DISCOUNTS[0]]);

    act(() => {
      void result.current.refresh();
    });

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(DISCOUNTS);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch when refresh is called with no agreement id', async () => {
    const { result } = renderHook(() => useDiscounts('', 1, 10));

    act(() => {
      void result.current.refresh();
    });

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

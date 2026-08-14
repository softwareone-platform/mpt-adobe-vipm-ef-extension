import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAllDiscounts } from './useAllDiscounts';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const discount = (index: number) => ({ id: `DSC-${index}`, code: `CODE-${index}` });

describe('useAllDiscounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useAllDiscounts(''));

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reads a single page', async () => {
    mockGet.mockResolvedValue({
      data: { data: [discount(1)], $meta: { pagination: { total: 1 } } },
    });

    const { result } = renderHook(() => useAllDiscounts('AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('keeps reading until every page is in', async () => {
    const firstPage = Array.from({ length: 100 }, (_unused, index) => discount(index));
    const secondPage = [discount(100), discount(101)];
    mockGet
      .mockResolvedValueOnce({ data: { data: firstPage, $meta: { pagination: { total: 102 } } } })
      .mockResolvedValueOnce({ data: { data: secondPage, $meta: { pagination: { total: 102 } } } });

    const { result } = renderHook(() => useAllDiscounts('AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toHaveLength(102);
    expect(result.current.data[101].code).toBe('CODE-101');
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/api/v2/discount-codes',
      expect.objectContaining({ params: expect.objectContaining({ offset: 100, limit: 100 }) }),
    );
  });

  it('stops when a page comes back empty', async () => {
    mockGet.mockResolvedValue({ data: { data: [], $meta: { pagination: { total: 5 } } } });

    const { result } = renderHook(() => useAllDiscounts('AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('drops the previous agreement codes when the agreement changes', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: [discount(1)], $meta: { pagination: { total: 1 } } },
    });
    const { result, rerender } = renderHook(({ id }) => useAllDiscounts(id), {
      initialProps: { id: 'AGR-1' },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    let resolveSecond!: (value: unknown) => void;
    mockGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    rerender({ id: 'AGR-2' });

    expect(result.current.data).toEqual([]);
    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveSecond({ data: { data: [discount(9)], $meta: { pagination: { total: 1 } } } });
    });
    await waitFor(() => expect(result.current.data[0].code).toBe('CODE-9'));
  });

  it('drops the codes it was showing when the read fails', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: [discount(1)], $meta: { pagination: { total: 1 } } },
    });
    const { result, rerender } = renderHook(({ id }) => useAllDiscounts(id), {
      initialProps: { id: 'AGR-1' },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    mockGet.mockRejectedValueOnce(new Error('Discounts are down'));
    rerender({ id: 'AGR-2' });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces a failed read', async () => {
    mockGet.mockRejectedValue(new Error('Discounts are down'));

    const { result } = renderHook(() => useAllDiscounts('AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Discounts are down');
  });
});

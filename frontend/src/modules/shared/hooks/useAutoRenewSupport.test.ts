import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAutoRenewSupport } from './useAutoRenewSupport';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const AGREEMENT_ID = 'AGR-1234-5678';
const SKUS = new Set(['65304578CA', '65322587CA']);
const URL = `/api/v2/agreements/${AGREEMENT_ID}/renewal-order/auto-renew-support`;

describe('useAutoRenewSupport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useAutoRenewSupport('', SKUS));

    expect(result.current.status).toBe('idle');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('stays idle without SKUs to look up', () => {
    const { result } = renderHook(() => useAutoRenewSupport(AGREEMENT_ID, new Set()));

    expect(result.current.status).toBe('idle');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('loads the support flags keyed by partial SKU', async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { skus: { '65304578CA': true, '65322587CA': false } } },
    });

    const { result } = renderHook(() => useAutoRenewSupport(AGREEMENT_ID, SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ '65304578CA': true, '65322587CA': false });
    expect(mockPost).toHaveBeenCalledWith(
      URL,
      { skus: ['65304578CA', '65322587CA'] },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('serializes the requested SKUs deterministically', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { skus: {} } } });

    renderHook(() => useAutoRenewSupport(AGREEMENT_ID, new Set(['65322587CA', '65304578CA'])));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith(
      URL,
      { skus: ['65304578CA', '65322587CA'] },
      expect.anything(),
    );
  });

  it('treats a response without support data as empty', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useAutoRenewSupport(AGREEMENT_ID, SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({});
  });

  it('surfaces a failed lookup', async () => {
    mockPost.mockRejectedValueOnce(new Error('Airtable unavailable'));

    const { result } = renderHook(() => useAutoRenewSupport(AGREEMENT_ID, SKUS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Airtable unavailable');
    expect(result.current.data).toEqual({});
  });

  it('refetches on refresh', async () => {
    mockPost.mockResolvedValue({ data: { data: { skus: { '65304578CA': true } } } });

    const { result } = renderHook(() => useAutoRenewSupport(AGREEMENT_ID, SKUS));

    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
  });
});

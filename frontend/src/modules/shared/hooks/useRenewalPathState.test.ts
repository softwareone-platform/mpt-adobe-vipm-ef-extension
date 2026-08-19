import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useRenewalPathState } from './useRenewalPathState';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const AGREEMENT_ID = 'AGR-1234-5678';
const URL = `/api/v2/agreements/${AGREEMENT_ID}/renewal-order/path-state`;

const PATH_STATE = {
  anniversaryDate: '2026-08-20',
  windowOpen: true,
  windowOpensDays: 30,
  windowClosesDays: 3,
  hasActiveSubscriptions: true,
  lockedPath: null,
};

describe('useRenewalPathState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useRenewalPathState(''));

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('loads the path state', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: PATH_STATE } });

    const { result } = renderHook(() => useRenewalPathState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(PATH_STATE);
    expect(mockGet).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('carries the locked path', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { ...PATH_STATE, lockedPath: 'now' } } });

    const { result } = renderHook(() => useRenewalPathState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data?.lockedPath).toBe('now');
  });

  it('treats a response without path data as unknown', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useRenewalPathState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBeNull();
  });

  it('surfaces a failed lookup', async () => {
    mockGet.mockRejectedValueOnce(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useRenewalPathState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toBeNull();
  });

  it('refetches on refresh', async () => {
    mockGet.mockResolvedValue({ data: { data: PATH_STATE } });

    const { result } = renderHook(() => useRenewalPathState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

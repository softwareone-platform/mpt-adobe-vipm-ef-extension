import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useRenewalState } from './useRenewalState';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const AGREEMENT_ID = 'AGR-1234-5678';
const ADOBE_SUBSCRIPTION_ID = 'a1b2c3d4e5NA';
const URL = `/api/v2/agreements/${AGREEMENT_ID}/renewal-order/renewal-state`;

const PARTIAL_STATE = {
  currentQuantity: 10,
  renewedQuantity: 4,
  state: 'partiallyRenewed',
  remainingQuantity: 6,
  earlyRenewable: true,
  increaseAllowed: false,
};

describe('useRenewalState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useRenewalState(''));

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('loads the states keyed by Adobe subscription id', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { subscriptions: { [ADOBE_SUBSCRIPTION_ID]: PARTIAL_STATE } } },
    });

    const { result } = renderHook(() => useRenewalState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ [ADOBE_SUBSCRIPTION_ID]: PARTIAL_STATE });
    expect(mockGet).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('treats a response without states as empty', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useRenewalState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({});
  });

  it('surfaces a failed lookup', async () => {
    mockGet.mockRejectedValueOnce(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useRenewalState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toEqual({});
  });

  it('refetches on refresh', async () => {
    mockGet.mockResolvedValue({
      data: { data: { subscriptions: { [ADOBE_SUBSCRIPTION_ID]: PARTIAL_STATE } } },
    });

    const { result } = renderHook(() => useRenewalState(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

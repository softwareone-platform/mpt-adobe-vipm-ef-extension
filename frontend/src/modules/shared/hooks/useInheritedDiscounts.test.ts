import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useInheritedDiscounts } from './useInheritedDiscounts';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const AGREEMENT_ID = 'AGR-1234-5678';
const URL = `/api/v2/agreements/${AGREEMENT_ID}/renewal-order/inherited-discounts`;

const INHERITED = {
  offerId: '65304470CA01A12',
  subscriptionId: 'adobe-sub-1',
  code: 'BLACK_FRIDAY',
  adobeId: 'adobe-discount-1',
  eligible: true,
  name: 'Black Friday',
  description: '',
  discountLockEndDate: '2028-03-31T23:59:59Z',
  discountValues: [{ currency: 'USD', value: 10 }],
};

describe('useInheritedDiscounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle without an agreement', () => {
    const { result } = renderHook(() => useInheritedDiscounts(''));

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('loads the customer held reusables', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { inheritedDiscounts: [INHERITED] } } });

    const { result } = renderHook(() => useInheritedDiscounts(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([INHERITED]);
    expect(mockGet).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('treats a response without discounts as empty', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useInheritedDiscounts(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces a failed lookup', async () => {
    mockGet.mockRejectedValueOnce(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useInheritedDiscounts(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toEqual([]);
  });

  it('refetches on refresh', async () => {
    mockGet.mockResolvedValue({ data: { data: { inheritedDiscounts: [INHERITED] } } });

    const { result } = renderHook(() => useInheritedDiscounts(AGREEMENT_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

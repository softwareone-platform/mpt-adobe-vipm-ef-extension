import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useSwitchDiscountValidation } from './useSwitchDiscountValidation';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const INPUT = {
  targetOfferId: '65322651CA02A12',
  quantity: 6,
  recommendationTrackerId: 'TRACKER-1',
  flexDiscountCodes: ['UPGRADE10'],
};
const QUOTE = { lineItems: [{ offerId: '65322651CA02A12', pricing: { partnerPrice: 50 } }] };

describe('useSwitchDiscountValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews the switch and publishes the quote', async () => {
    mockPost.mockResolvedValue({ data: { preview: QUOTE } });
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useSwitchDiscountValidation('AGR-1', 'SUB-1', onPreview),
    );

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscount(INPUT);
    });

    expect(isValid).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions/SUB-1/upgrade-order/preview',
      INPUT,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(onPreview).toHaveBeenLastCalledWith(QUOTE);
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('fails with the refused codes and publishes no quote', async () => {
    mockPost.mockRejectedValue({
      response: {
        data: {
          detail: 'Adobe rejected one or more discount codes',
          errors: [{ pointer: '65322651CA02A12', detail: 'NOT_FOUND' }],
        },
      },
    });
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useSwitchDiscountValidation('AGR-1', 'SUB-1', onPreview),
    );

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validateDiscount(INPUT);
    });

    expect(isValid).toBe(false);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.rejectedFields).toEqual([
      { pointer: '65322651CA02A12', detail: 'NOT_FOUND' },
    ]);
  });

  it('drops the quote and the outcome on reset', async () => {
    mockPost.mockResolvedValue({ data: { preview: QUOTE } });
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useSwitchDiscountValidation('AGR-1', 'SUB-1', onPreview),
    );
    await act(async () => {
      await result.current.validateDiscount(INPUT);
    });

    act(() => result.current.reset());

    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(result.current.status).toBe('idle');
  });

  it('ignores a quote that lands after the selection changed', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useSwitchDiscountValidation('AGR-1', 'SUB-1', onPreview),
    );

    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.validateDiscount(INPUT);
    });
    act(() => result.current.reset());
    await act(async () => {
      resolvePost({ data: { preview: QUOTE } });
      await pending;
    });

    expect(onPreview).not.toHaveBeenCalledWith(QUOTE);
  });
});

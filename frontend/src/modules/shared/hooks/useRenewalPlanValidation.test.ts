import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanBody } from '../model';
import { useRenewalPlanValidation } from './useRenewalPlanValidation';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const PLAN: RenewalPlanBody = {
  renewalPath: 'anniversary',
  subscriptions: [
    { id: 'SUB-1', offerId: '65322587CA01A12', renew: true, renewalQuantity: 53 },
    { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
  ],
  netNewItems: [{ offerId: '65304578CA01A12', quantity: 5 }],
};

const EARLY_PLAN: RenewalPlanBody = { ...PLAN, renewalPath: 'now' };

describe('useRenewalPlanValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('checks the 3YC floor with the whole plan and does not preview against Adobe', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan(PLAN);
    });

    expect(isValid).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/renewal-order/3yc-check',
      PLAN,
      expect.objectContaining({ signal: expect.anything() }),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('previews the early-renewal plan against Adobe after the 3YC check', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan(EARLY_PLAN);
    });

    expect(isValid).toBe(true);
    expect(mockPost.mock.calls.map(([url, body]) => [url, body])).toEqual([
      ['/api/v2/agreements/AGR-1234-5678/renewal-order/3yc-check', EARLY_PLAN],
      ['/api/v2/agreements/AGR-1234-5678/renewal-order/preview', EARLY_PLAN],
    ]);
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('drops the quote it held when the plan is no longer quoted', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    const onPreview = jest.fn();

    const { result } = renderHook(() =>
      useRenewalPlanValidation('AGR-1234-5678', { onPreview }),
    );

    await act(async () => {
      await result.current.validatePlan(PLAN);
    });

    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('drops the quote when the customer edits the plan again', async () => {
    const onPreview = jest.fn();
    const { result } = renderHook(() =>
      useRenewalPlanValidation('AGR-1234-5678', { onPreview }),
    );

    act(() => result.current.reset());

    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('keeps the quote the Items step took when the Renewal step validates', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    const onPreview = jest.fn();

    const { result } = renderHook(() =>
      useRenewalPlanValidation('AGR-1234-5678', { quoteThroughAdobe: false, onPreview }),
    );

    await act(async () => {
      await result.current.validatePlan(EARLY_PLAN);
    });

    expect(onPreview).not.toHaveBeenCalled();
  });

  it('skips the Adobe quote when the caller owns no quantities', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() =>
      useRenewalPlanValidation('AGR-1234-5678', { quoteThroughAdobe: false }),
    );

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan(EARLY_PLAN);
    });

    expect(isValid).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/renewal-order/3yc-check',
      EARLY_PLAN,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('surfaces the Adobe rejection when the early-renewal preview fails', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } }).mockRejectedValueOnce({
      response: { data: { detail: 'Place the renewal first, then add in a new order.' } },
    });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan(EARLY_PLAN);
    });

    expect(isValid).toBe(false);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Place the renewal first, then add in a new order.');
  });

  it('skips the early-renewal preview when the plan renews and adds nothing', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validatePlan({
        renewalPath: 'now',
        subscriptions: [
          { id: 'SUB-1', offerId: '65322587CA01A12', renew: false, renewalQuantity: 0 },
        ],
        netNewItems: [],
      });
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678/renewal-order/3yc-check',
      expect.anything(),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('passes an empty plan without calling the backend', async () => {
    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan({
        renewalPath: 'anniversary',
        subscriptions: [],
        netNewItems: [],
      });
    });

    expect(isValid).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('surfaces the backend detail when the 3YC check fails', async () => {
    mockPost.mockRejectedValue({
      response: {
        data: { detail: 'The renewal plan would place the account below the minimum quantities.' },
      },
    });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan(PLAN);
    });

    expect(isValid).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'The renewal plan would place the account below the minimum quantities.',
    );
  });

  it('falls back to a generic message when the failure carries no detail', async () => {
    mockPost.mockRejectedValue({});

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validatePlan(PLAN);
    });

    await waitFor(() =>
      expect(result.current.error).toBe('The renewal plan could not be validated.'),
    );
  });

  it('moves to loading while the validation is in flight and refuses a concurrent run', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.validatePlan({ ...PLAN, subscriptions: [] });
    });
    await waitFor(() => expect(result.current.status).toBe('loading'));

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.validatePlan(PLAN);
    });
    expect(second).toBe(false);

    await act(async () => {
      resolveRequest({ data: { data: {} } });
      await first;
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('clears the outcome on reset', async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: 'Broken floor.' } } });

    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    await act(async () => {
      await result.current.validatePlan(PLAN);
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

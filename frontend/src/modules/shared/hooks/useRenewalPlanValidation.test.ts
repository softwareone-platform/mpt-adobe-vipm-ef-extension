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
  subscriptions: [
    { id: 'SUB-1', offerId: '65322587CA01A12', renew: true, renewalQuantity: 53 },
    { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
  ],
  netNewItems: [{ offerId: '65304578CA01A12', quantity: 5 }],
};

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
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('passes an empty plan without calling the backend', async () => {
    const { result } = renderHook(() => useRenewalPlanValidation('AGR-1234-5678'));

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await result.current.validatePlan({ subscriptions: [], netNewItems: [] });
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

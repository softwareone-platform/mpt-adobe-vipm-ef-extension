import { act, renderHook, waitFor } from '@testing-library/react';

import type { ThreeYearCommitmentRequestInput } from '../ThreeYearCommitment/model';
import { useThreeYearCommitmentRequest } from './useThreeYearCommitmentRequest';

const INPUT: ThreeYearCommitmentRequestInput = {
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      commitmentRequest: {
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 10 },
          { offerType: 'CONSUMABLES', quantity: 1000 },
        ],
      },
      recommitmentRequest: {
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 10 },
          { offerType: 'CONSUMABLES', quantity: 1000 },
        ],
      },
    },
  ],
};

describe('useThreeYearCommitmentRequest', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('moves to loading while the request is in flight', async () => {
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.submitRequest(INPUT);
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBe('');

    // Flush the in-flight request so its state update lands inside act(...).
    await act(async () => {
      jest.runAllTimers();
      await pending;
    });
  });

  it('resolves to success and returns true once the mocked call completes', async () => {
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    let resolved: boolean | undefined;
    await act(async () => {
      const pending = result.current.submitRequest(INPUT);
      jest.runAllTimers();
      resolved = await pending;
    });

    expect(resolved).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.error).toBe('');
  });

  it('resets back to idle', async () => {
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    await act(async () => {
      const pending = result.current.submitRequest(INPUT);
      jest.runAllTimers();
      await pending;
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  // The mocked request only resolves today, so the error path is reached by
  // making the underlying timer throw — mirroring how the real endpoint will
  // reject once it replaces the setTimeout stub.
  it('moves to error and returns false when the request rejects', async () => {
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
      throw new Error('Commitment endpoint unavailable.');
    });
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.submitRequest(INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Commitment endpoint unavailable.');

    timeoutSpy.mockRestore();
  });

  it('clears the error when reset from an error state', async () => {
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
      throw new Error('Commitment endpoint unavailable.');
    });
    const { result } = renderHook(() => useThreeYearCommitmentRequest());

    await act(async () => {
      await result.current.submitRequest(INPUT);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Commitment endpoint unavailable.');

    timeoutSpy.mockRestore();
    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';

import { useGuardedRequest } from './useGuardedRequest';

describe('useGuardedRequest', () => {
  it('starts idle with no error', () => {
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('returns the task result and reports success', async () => {
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.run(async () => ({ id: 'ORD-1' }));
    });

    expect(resolved).toEqual({ id: 'ORD-1' });
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('moves to loading while the task is pending', async () => {
    let resolveTask!: () => void;
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    let pending!: Promise<boolean | false>;
    act(() => {
      pending = result.current.run(
        () =>
          new Promise<boolean>((resolve) => {
            resolveTask = () => resolve(true);
          }),
      );
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveTask();
      await pending;
    });

    expect(result.current.status).toBe('success');
  });

  it('refuses a concurrent run and never starts the second task', async () => {
    let resolveTask!: () => void;
    const secondTask = jest.fn();
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    let first!: Promise<boolean | false>;
    let second: boolean | false | undefined;
    act(() => {
      first = result.current.run(
        () =>
          new Promise<boolean>((resolve) => {
            resolveTask = () => resolve(true);
          }),
      );
    });

    await act(async () => {
      second = await result.current.run(secondTask);
    });

    expect(second).toBe(false);
    expect(secondTask).not.toHaveBeenCalled();

    await act(async () => {
      resolveTask();
      await first;
    });

    expect(result.current.status).toBe('success');
  });

  it('allows a new run once the previous task settles', async () => {
    const task = jest.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    await act(async () => {
      await result.current.run(task);
    });
    await act(async () => {
      await result.current.run(task);
    });

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('releases the guard when the task rejects', async () => {
    const task = jest.fn().mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    await act(async () => {
      await result.current.run(task);
    });
    await act(async () => {
      await result.current.run(task);
    });

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('surfaces the backend detail, then the title, then the error message', async () => {
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.run(() =>
        Promise.reject({ response: { data: { detail: 'Adobe rejected the order.' } } }),
      );
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Adobe rejected the order.');

    await act(async () => {
      await result.current.run(() =>
        Promise.reject({ response: { data: { title: 'Validation failed' } } }),
      );
    });
    expect(result.current.error).toBe('Validation failed');

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('Network down')));
    });
    expect(result.current.error).toBe('Network down');
  });

  it('falls back to the translated key when the failure carries no message', async () => {
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    await act(async () => {
      await result.current.run(() => Promise.reject({}));
    });

    expect(result.current.error).toBe('Order submission failed.');
  });

  it('clears the outcome on reset', async () => {
    const { result } = renderHook(() => useGuardedRequest('Errors:OrderSubmission'));

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('Order submission failed.')));
    });
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

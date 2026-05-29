import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAgreementSync } from './useAgreementSync';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

describe('useAgreementSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the encoded agreement id and records successful completion', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAgreementSync('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.syncAgreement();
    });

    expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1234-5678-9012/sync');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.lastStatus).toBe('success');
    expect(result.current.lastCompleted).toEqual(expect.any(String));
    expect(result.current.error).toBe('');
  });

  it('does not post when agreement id is missing', async () => {
    const { result } = renderHook(() => useAgreementSync(''));

    await act(async () => {
      await result.current.syncAgreement();
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('records sync failures', async () => {
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));

    const { result } = renderHook(() => useAgreementSync('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.syncAgreement();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.lastStatus).toBe('error');
    expect(result.current.lastCompleted).toEqual(expect.any(String));
    expect(result.current.error).toBe('Marketplace unavailable');
  });
});

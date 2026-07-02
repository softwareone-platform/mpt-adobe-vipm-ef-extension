import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import type { LinkedMembershipRequestInput } from '../LinkedMembership/model';
import { useLinkedMembershipRequest } from './useLinkedMembershipRequest';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const MOCK_CUSTOMER_DATA = {
  customerId: 'P1005425253',
  status: '1002',
  linkedMembership: { linkedMembershipId: 'LM-1', name: 'My Group', type: 'STANDARD' },
};

const STANDARD_INPUT: LinkedMembershipRequestInput = {
  name: 'My Group',
  type: 'STANDARD',
};

const CONSORTIUM_INPUT: LinkedMembershipRequestInput = {
  name: 'Consortium Group',
  type: 'CONSORTIUM',
};

describe('useLinkedMembershipRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('posts the request to the correct endpoint with name and type', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(CONSORTIUM_INPUT);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678-9012/linked-membership',
      { name: 'Consortium Group', type: 'CONSORTIUM' },
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('moves to loading while the request is in flight', async () => {
    let resolveRequest!: () => void;
    mockPost.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    let pending: ReturnType<typeof result.current.submitRequest>;
    act(() => {
      pending = result.current.submitRequest(STANDARD_INPUT);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveRequest();
      await pending;
    });
  });

  it('returns the Adobe customer data on success', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitRequest(STANDARD_INPUT);
    });

    expect(resolved).toEqual(MOCK_CUSTOMER_DATA);
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.error).toBe('');
  });

  it('returns false when the request rejects', async () => {
    mockPost.mockRejectedValue(new Error('Linked membership endpoint unavailable.'));

    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitRequest(STANDARD_INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Linked membership endpoint unavailable.');
  });

  it('clears the error when reset from an error state', async () => {
    mockPost.mockRejectedValue(new Error('Linked membership endpoint unavailable.'));

    const { result } = renderHook(() => useLinkedMembershipRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(STANDARD_INPUT);
    });
    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

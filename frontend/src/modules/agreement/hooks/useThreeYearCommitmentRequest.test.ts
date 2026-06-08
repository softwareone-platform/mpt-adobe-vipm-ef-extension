import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import type { ThreeYearCommitmentRequestInput } from '../ThreeYearCommitment/model';
import { useThreeYearCommitmentRequest } from './useThreeYearCommitmentRequest';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const MOCK_CUSTOMER_DATA = {
  customerId: 'P1005425253',
  status: '1002',
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT' as const,
      commitment: null,
      commitmentRequest: {
        status: 'REQUESTED',
        minimumQuantities: [{ offerType: 'LICENSE' as const, quantity: 25 }],
      },
      recommitmentRequest: null,
    },
  ],
};

const COMMITMENT_INPUT: ThreeYearCommitmentRequestInput = {
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      commitmentRequest: {
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 50 },
          { offerType: 'CONSUMABLES', quantity: 1000 },
        ],
      },
    },
  ],
};

const RECOMMITMENT_INPUT: ThreeYearCommitmentRequestInput = {
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      recommitmentRequest: {
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 75 },
        ],
      },
    },
  ],
};

describe('useThreeYearCommitmentRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('posts a commitment request to the correct endpoint with the right payload', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(COMMITMENT_INPUT);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678-9012/3yc-request',
      { licenses: 50, consumables: 1000, isRecommitment: false },
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('sets isRecommitment to true and omits consumables when not provided', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(RECOMMITMENT_INPUT);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1234-5678-9012/3yc-request',
      { licenses: 75, isRecommitment: true },
    );
  });

  it('moves to loading while the request is in flight', async () => {
    let resolveRequest!: () => void;
    mockPost.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    let pending: ReturnType<typeof result.current.submitRequest>;
    act(() => {
      pending = result.current.submitRequest(COMMITMENT_INPUT);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveRequest();
      await pending;
    });
  });

  it('returns the Adobe customer data on success', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitRequest(COMMITMENT_INPUT);
    });

    expect(resolved).toEqual(MOCK_CUSTOMER_DATA);
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.error).toBe('');
  });

  it('returns false when the request rejects', async () => {
    mockPost.mockRejectedValue(new Error('Commitment endpoint unavailable.'));

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.submitRequest(COMMITMENT_INPUT);
    });

    expect(resolved).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Commitment endpoint unavailable.');
  });

  it('resets back to idle after a successful request', async () => {
    mockPost.mockResolvedValue({ data: { data: MOCK_CUSTOMER_DATA } });

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(COMMITMENT_INPUT);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('clears the error when reset from an error state', async () => {
    mockPost.mockRejectedValue(new Error('Commitment endpoint unavailable.'));

    const { result } = renderHook(() => useThreeYearCommitmentRequest('AGR-1234-5678-9012'));

    await act(async () => {
      await result.current.submitRequest(COMMITMENT_INPUT);
    });
    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

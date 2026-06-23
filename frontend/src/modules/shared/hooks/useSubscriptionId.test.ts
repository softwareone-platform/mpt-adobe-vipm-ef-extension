import { renderHook } from '@testing-library/react';

import { useMPTContext } from '@mpt-extension/sdk-react';

import { useSubscriptionId } from './useSubscriptionId';

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
}), { virtual: true });

const mockUseMPTContext = jest.mocked(useMPTContext);

describe('useSubscriptionId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the subscription id from the Marketplace context', () => {
    mockUseMPTContext.mockReturnValue({
      data: {
        subscription: {
          id: 'SUB-1234-5678-9012',
        },
      },
    });

    const { result } = renderHook(() => useSubscriptionId());

    expect(result.current).toBe('SUB-1234-5678-9012');
  });

  it('returns an empty id when the Marketplace context has no subscription', () => {
    mockUseMPTContext.mockReturnValue({});

    const { result } = renderHook(() => useSubscriptionId());

    expect(result.current).toBe('');
  });
});

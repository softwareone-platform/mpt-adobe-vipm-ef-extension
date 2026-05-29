import { renderHook } from '@testing-library/react';

import { useMPTContext } from '@mpt-extension/sdk-react';

import { useAgreementId } from './useAgreementId';

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
}), { virtual: true });

const mockUseMPTContext = jest.mocked(useMPTContext);

describe('useAgreementId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the agreement id from the Marketplace context', () => {
    mockUseMPTContext.mockReturnValue({
      data: {
        agreement: {
          id: 'AGR-1234-5678-9012',
        },
      },
    });

    const { result } = renderHook(() => useAgreementId());

    expect(result.current).toBe('AGR-1234-5678-9012');
  });

  it('returns an empty id when the Marketplace context has no agreement', () => {
    mockUseMPTContext.mockReturnValue({});

    const { result } = renderHook(() => useAgreementId());

    expect(result.current).toBe('');
  });
});

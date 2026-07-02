import { renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useSettings } from './useSettings';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

describe('useSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the settings endpoint and returns the unwrapped payload', async () => {
    const settings = { products: [{ id: 'PRD-1111-1111', segment: 'COM' }] };
    mockGet.mockResolvedValue({ data: { data: settings } });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current).toEqual(settings));
    expect(mockGet).toHaveBeenCalledWith('/api/v2/settings');
  });

  it('returns undefined when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Settings unavailable'));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });
});

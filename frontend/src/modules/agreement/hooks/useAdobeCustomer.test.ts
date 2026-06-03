import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useAdobeCustomer } from './useAdobeCustomer';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

describe('useAdobeCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when no agreement id is given', () => {
    const { result } = renderHook(() => useAdobeCustomer(''));

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches customer data for a valid agreement id', async () => {
    const mockCustomer = {
      customerId: 'P1005419036',
      status: '1000',
      benefits: [{ type: 'THREE_YEAR_COMMIT', commitment: null, commitmentRequest: null, recommitmentRequest: null }],
    };
    mockGet.mockResolvedValue({ data: { data: mockCustomer } });

    const { result } = renderHook(() => useAdobeCustomer('AGR-1234-5678-9012'));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(mockCustomer);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/agreements/AGR-1234-5678-9012/customer');
  });

  it('records errors when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Adobe unavailable'));

    const { result } = renderHook(() => useAdobeCustomer('AGR-1234-5678-9012'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Adobe unavailable');
    expect(result.current.data).toBeNull();
  });

  it('updates customer data directly without a fetch', async () => {
    const { result } = renderHook(() => useAdobeCustomer(''));

    const updatedCustomer = { customerId: 'P1005425253', status: '1002', benefits: [] };

    act(() => {
      result.current.update(updatedCustomer);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual(updatedCustomer);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('encodes the agreement id in the request URL', async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });

    renderHook(() => useAdobeCustomer('AGR-1234/5678'));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith('/api/v2/agreements/AGR-1234%2F5678/customer');
  });

  it('re-fetches when refresh is called', async () => {
    const firstCustomer = { customerId: 'P1005419036', status: '1000', benefits: [] };
    const secondCustomer = { customerId: 'P1005419036', status: '1001', benefits: [] };
    mockGet
      .mockResolvedValueOnce({ data: { data: firstCustomer } })
      .mockResolvedValueOnce({ data: { data: secondCustomer } });

    const { result } = renderHook(() => useAdobeCustomer('AGR-1234-5678-9012'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(firstCustomer);
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(secondCustomer);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch when refresh is called with no agreement id', async () => {
    const { result } = renderHook(() => useAdobeCustomer(''));

    act(() => {
      result.current.refresh();
    });

    expect(result.current.status).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

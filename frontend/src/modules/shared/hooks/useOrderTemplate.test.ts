import { renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useOrderTemplate } from './useOrderTemplate';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);

const TEMPLATE = '# Your order is being processed';

describe('useOrderTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle when no order has been placed', () => {
    const { result } = renderHook(() => useOrderTemplate(null));

    expect(result.current.status).toBe('idle');
    expect(result.current.template).toBe('');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('renders the placed order through the encoded order id', async () => {
    mockGet.mockResolvedValue({ data: { data: { template: TEMPLATE } } });

    const { result } = renderHook(() => useOrderTemplate('ORD-1234/5678'));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.template).toBe(TEMPLATE);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/orders/ORD-1234%2F5678/render',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('formats the date directives the platform leaves for the client', async () => {
    mockGet.mockResolvedValue({
      data: { data: { template: 'Anniversary date: **:date[2027-08-21]**' } },
    });

    const { result } = renderHook(() => useOrderTemplate('ORD-1234-5678'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.template).toBe('Anniversary date: **8/21/2027**');
  });

  it('leaves a date directive alone when its value is not a date', async () => {
    mockGet.mockResolvedValue({ data: { data: { template: 'Last sync: :date[soon]' } } });

    const { result } = renderHook(() => useOrderTemplate('ORD-1234-5678'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.template).toBe('Last sync: :date[soon]');
  });

  it('reports the failure and keeps no template', async () => {
    mockGet.mockRejectedValue(new Error('Marketplace unavailable'));

    const { result } = renderHook(() => useOrderTemplate('ORD-1234-5678'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Marketplace unavailable');
    expect(result.current.template).toBe('');
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useDiscountById } from './useDiscountById';

import type { DiscountUpdatePayload } from '../../agreement/Discounts/components/wizard/discountDraft';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
    put: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);
const mockPut = jest.mocked(http.put);

const sample = (id: string) => ({ id, code: `CODE-${id}` });

const PAYLOAD = {
  name: 'Renamed Discount',
  category: 'STANDARD',
  discountType: 'PERCENTAGE',
  value: 10,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-06-30T23:59:59Z',
  reusable: false,
  targetOfferIds: ['ITEM-001'],
  qualifyingOfferIds: ['ITEM-001', 'ITEM-002'],
  applicableOrderTypes: ['RENEWAL'],
  supportsAnnual: false,
  supports3yc: false,
} as DiscountUpdatePayload;

function rejectPatchWith(data: unknown) {
  mockPut.mockRejectedValue({ response: { data } });
}

describe('useDiscountById (fetch)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts idle when no id is given', () => {
    const { result } = renderHook(() => useDiscountById('', 'AGR-1'));

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches discount data for a valid id', async () => {
    const mockDiscount = sample('DSC-1');
    mockGet.mockResolvedValue({ data: { data: mockDiscount } });

    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(mockDiscount);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v2/discount-codes/DSC-1', expect.any(Object));
  });

  it('records errors when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useDiscountById('MISSING', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Not found');
    expect(result.current.data).toBeNull();
  });

  it('encodes the id in the request URL', async () => {
    mockGet.mockResolvedValue({ data: { data: sample('A/B') } });

    renderHook(() => useDiscountById('A/B', 'AGR-1'));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith('/api/v2/discount-codes/A%2FB', expect.any(Object));
  });

  it('re-fetches when refresh is called', async () => {
    const first = sample('ONE');
    const second = sample('TWO');
    mockGet
      .mockResolvedValueOnce({ data: { data: first } })
      .mockResolvedValueOnce({ data: { data: second } });

    const { result } = renderHook(() => useDiscountById('ID', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(first);
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => result.current.refresh());

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(second);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe('useDiscountById (update)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: sample('DSC-1') } });
  });

  it('patches the payload against the discount, scoped to the agreement', async () => {
    mockPut.mockResolvedValue({ data: { data: { id: 'DSC-1', code: 'RENAMED' } } });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-0000-0000-0000'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.update(PAYLOAD);
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/api/v2/discount-codes/DSC-1',
      PAYLOAD,
      { params: { agreement: 'AGR-0000-0000-0000' } },
    );
  });

  it('encodes the discount id in the PATCH URL', async () => {
    mockPut.mockResolvedValue({ data: { data: { id: 'A/B' } } });
    const { result } = renderHook(() => useDiscountById('A/B', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.update(PAYLOAD);
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/api/v2/discount-codes/A%2FB',
      PAYLOAD,
      expect.any(Object),
    );
  });

  it('replaces data with the updated discount on success', async () => {
    const updated = { id: 'DSC-1', code: 'RENAMED' };
    mockPut.mockResolvedValue({ data: { data: updated } });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    let returned;
    await act(async () => {
      returned = await result.current.update(PAYLOAD);
    });

    expect(returned).toEqual(updated);
    expect(result.current.data).toEqual(updated);
    expect(result.current.status).toBe('success');
  });

  it('maps a field pointer onto the matching draft field', async () => {
    rejectPatchWith({
      detail: 'Discount values are invalid.',
      errors: [{ pointer: '#/name', detail: 'Name is required.' }],
    });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.update(PAYLOAD);
    });

    expect(result.current.fieldErrors.name).toBe('Name is required.');
    expect(result.current.error).toBe('Discount values are invalid.');
    expect(result.current.status).toBe('error');
  });

  it.each([
    ['a nested pointer', { pointer: '#/values/0/value', detail: 'Bad.' }],
    ['a missing pointer', { detail: 'Bad.' }],
    ['a non-string pointer', { pointer: 42, detail: 'Bad.' }],
  ])('ignores %s, which has no matching form field', async (_label, entry) => {
    rejectPatchWith({ detail: 'Invalid request.', errors: [entry] });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.update(PAYLOAD);
    });

    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.error).toBe('Invalid request.');
  });

  it('keeps the previously fetched data when the patch fails', async () => {
    const original = sample('DSC-1');
    mockGet.mockResolvedValue({ data: { data: original } });
    mockPut.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.data).toEqual(original));

    await act(async () => {
      await result.current.update(PAYLOAD);
    });

    expect(result.current.error).toBe('Network down');
    expect(result.current.data).toEqual(original);
  });

  it('treats a response without a discount id as a failure', async () => {
    mockPut.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    let returned;
    await act(async () => {
      returned = await result.current.update(PAYLOAD);
    });

    expect(returned).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('rejects a concurrent update so a double click cannot patch twice', async () => {
    mockPut.mockResolvedValue({ data: { data: { id: 'DSC-1' } } });
    const { result } = renderHook(() => useDiscountById('DSC-1', 'AGR-1'));

    await waitFor(() => expect(result.current.status).toBe('success'));

    let second;
    await act(async () => {
      const first = result.current.update(PAYLOAD);
      second = await result.current.update(PAYLOAD);
      await first;
    });

    expect(second).toBe(false);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('refuses to patch when no discount id is provided', async () => {
    const { result } = renderHook(() => useDiscountById('', 'AGR-1'));

    let outcome;
    await act(async () => {
      outcome = await result.current.update(PAYLOAD);
    });

    expect(outcome).toBe(false);
    expect(mockPut).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

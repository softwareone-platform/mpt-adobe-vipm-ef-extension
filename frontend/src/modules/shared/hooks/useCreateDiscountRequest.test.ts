import { act, renderHook, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { useCreateDiscountRequest } from './useCreateDiscountRequest';

import type { DiscountCreatePayload } from '../../agreement/Discounts/components/wizard/discountDraft';

jest.mock('@mpt-extension/sdk', () => ({
  http: { post: jest.fn() },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

const PAYLOAD = {
  code: 'DUMMYCODE123',
  name: 'Dummy Create Discount',
  category: 'STANDARD',
  discountType: 'PERCENTAGE',
  value: 5,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-06-31T23:59:59Z',
  reusable: false,
  targetOfferIds: ['ITEM-001', 'ITEM-002', 'ITEM-003'],
  qualifyingOfferIds: ['ITEM-001', 'ITEM-002', 'ITEM-003', 'ITEM-004'],
  applicableOrderTypes: ['RENEWAL'],
  supportsAnnual: false,
  supports3yc: false,
} as DiscountCreatePayload;

function rejectWith(data: unknown) {
  mockPost.mockRejectedValue({ response: { data } });
}

describe('useCreateDiscountRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts the payload scoped to the agreement', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'rec1', code: 'DUMMYCODE123' } } });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-0000-0000-0000'));

    await act(async () => {
      await result.current.submitRequest(PAYLOAD);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      PAYLOAD,
      { params: { agreement: 'AGR-0000-0000-0000' } },
    );
  });

  it('returns the created discount and reports success', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'rec1', code: 'DUMMYCODE123' } } });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    let created;
    await act(async () => {
      created = await result.current.submitRequest(PAYLOAD);
    });

    expect(created).toEqual({ id: 'rec1', code: 'DUMMYCODE123' });
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('maps a duplicate code pointer onto the code field', async () => {
    rejectWith({
      detail: 'A discount with this code already exists in the market segment.',
      errors: [{ pointer: '#/code', detail: 'Duplicate code.' }],
    });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    await act(async () => {
      await result.current.submitRequest(PAYLOAD);
    });

    expect(result.current.fieldErrors.code).toBe('Duplicate code.');
    expect(result.current.error).toBe(
      'A discount with this code already exists in the market segment.',
    );
  });

  it.each([
    ['a nested pointer', { pointer: '#/values/0/value', detail: 'Bad.' }],
    ['a missing pointer', { detail: 'Bad.' }],
    ['a non-string pointer', { pointer: 42, detail: 'Bad.' }],
  ])('ignores %s, which has no matching form field', async (_label, entry) => {
    rejectWith({ detail: 'Invalid request.', errors: [entry] });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    await act(async () => {
      await result.current.submitRequest(PAYLOAD);
    });

    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.error).toBe('Invalid request.');
  });

  it('falls back to the error message when the response carries no body', async () => {
    mockPost.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    await act(async () => {
      await result.current.submitRequest(PAYLOAD);
    });

    expect(result.current.error).toBe('Network down');
    expect(result.current.fieldErrors).toEqual({});
  });

  it('treats a response without a discount id as a failure', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    let created;
    await act(async () => {
      created = await result.current.submitRequest(PAYLOAD);
    });

    expect(created).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('rejects a concurrent submit so a double click cannot create two codes', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'rec1' } } });
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    let second;
    await act(async () => {
      const first = result.current.submitRequest(PAYLOAD);
      second = await result.current.submitRequest(PAYLOAD);
      await first;
    });

    expect(second).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('clears the state on reset', async () => {
    mockPost.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useCreateDiscountRequest('AGR-1'));

    await act(async () => {
      await result.current.submitRequest(PAYLOAD);
    });
    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('');
  });
});

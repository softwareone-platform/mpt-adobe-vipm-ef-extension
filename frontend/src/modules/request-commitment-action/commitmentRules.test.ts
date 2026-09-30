import type { AdobeCustomerData } from '../shared/model';
import {
  isRecommitmentOpen,
  quantityFloor,
  readCommitmentState,
  recommitmentOpensOn,
} from './commitmentRules';
import type { CommitmentState } from './commitmentRules';

const TODAY = new Date(2026, 8, 30);

function customer(benefit: Record<string, unknown>): AdobeCustomerData {
  return { benefits: [{ type: 'THREE_YEAR_COMMIT', ...benefit }] } as AdobeCustomerData;
}

function committedState(overrides: Partial<CommitmentState> = {}): CommitmentState {
  return {
    isCommitted: true,
    endDate: '2029-09-28',
    licenseMinimum: 50,
    consumableMinimum: null,
    pendingRequest: null,
    hasRecommitmentRequest: false,
    ...overrides,
  };
}

describe('readCommitmentState', () => {
  it('reads the minimums and end date of a committed customer', () => {
    const data = customer({
      commitment: {
        status: 'COMMITTED',
        endDate: '2029-09-28',
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 50 },
          { offerType: 'CONSUMABLES', quantity: 1000 },
        ],
      },
    });

    expect(readCommitmentState(data)).toEqual({
      isCommitted: true,
      endDate: '2029-09-28',
      licenseMinimum: 50,
      consumableMinimum: 1000,
      pendingRequest: null,
      hasRecommitmentRequest: false,
    });
  });

  it('reports no minimums for a customer whose commitment is not active', () => {
    const data = customer({
      commitment: {
        status: 'EXPIRED',
        endDate: '2026-01-01',
        minimumQuantities: [{ offerType: 'LICENSE', quantity: 10 }],
      },
    });

    expect(readCommitmentState(data)).toEqual({
      isCommitted: false,
      endDate: null,
      licenseMinimum: null,
      consumableMinimum: null,
      pendingRequest: null,
      hasRecommitmentRequest: false,
    });
  });

  it.each([
    ['commitmentRequest', 'commitment'],
    ['recommitmentRequest', 'recommitment'],
  ] as const)('reads a %s awaiting acceptance as the pending request', (requestKey, type) => {
    const data = customer({
      [requestKey]: {
        status: 'REQUESTED',
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 20 },
          { offerType: 'CONSUMABLES', quantity: 1000 },
        ],
      },
    });

    expect(readCommitmentState(data).pendingRequest).toEqual({
      type,
      licenses: 20,
      consumables: 1000,
    });
  });

  it('does not read an accepted request as pending', () => {
    const data = customer({
      commitmentRequest: { status: 'ACCEPTED', minimumQuantities: [] },
    });

    expect(readCommitmentState(data).pendingRequest).toBeNull();
  });

  it.each(['REQUESTED', 'ACCEPTED'])(
    'flags a %s recommitment request, which blocks a commitment request',
    (status) => {
      const data = customer({ recommitmentRequest: { status, minimumQuantities: [] } });

      expect(readCommitmentState(data).hasRecommitmentRequest).toBe(true);
    },
  );

  it('does not flag a commitment request as a recommitment request', () => {
    const data = customer({
      commitmentRequest: { status: 'ACCEPTED', minimumQuantities: [] },
    });

    expect(readCommitmentState(data).hasRecommitmentRequest).toBe(false);
  });

  it('reads an empty state when the customer has no 3YC benefit', () => {
    expect(readCommitmentState(null)).toEqual({
      isCommitted: false,
      endDate: null,
      licenseMinimum: null,
      consumableMinimum: null,
      pendingRequest: null,
      hasRecommitmentRequest: false,
    });
  });
});

describe('quantityFloor', () => {
  it('uses the committed minimum for an uplevel', () => {
    const state = committedState({ licenseMinimum: 50, consumableMinimum: 1000 });

    expect(quantityFloor(state, 'commitment', 'LICENSE')).toBe(50);
    expect(quantityFloor(state, 'commitment', 'CONSUMABLES')).toBe(1000);
  });

  it('has no floor for an offer type the customer is not committed to', () => {
    expect(quantityFloor(committedState(), 'commitment', 'CONSUMABLES')).toBeNull();
  });

  it('has no floor for a recommitment', () => {
    expect(quantityFloor(committedState(), 'recommitment', 'LICENSE')).toBeNull();
  });
});

describe('recommitmentOpensOn', () => {
  it('opens 30 days before the end date', () => {
    expect(recommitmentOpensOn('2029-09-28')).toBe('2029-08-29');
  });

  it('reads only the date part of a timestamp', () => {
    expect(recommitmentOpensOn('2027-03-15T00:00:00Z')).toBe('2027-02-13');
  });
});

describe('isRecommitmentOpen', () => {
  it.each([
    ['2026-10-30', true],
    ['2026-10-31', false],
    ['2026-10-01', true],
  ])('with an end date of %s is %s', (endDate, expected) => {
    expect(isRecommitmentOpen(committedState({ endDate }), TODAY)).toBe(expected);
  });

  it('is closed for a customer without an active commitment', () => {
    const state = committedState({ isCommitted: false, endDate: null });

    expect(isRecommitmentOpen(state, TODAY)).toBe(false);
  });
});

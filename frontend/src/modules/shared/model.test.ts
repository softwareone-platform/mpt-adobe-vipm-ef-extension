import {
  CommerceParameter,
  ProductSegments,
  findLinkedMembership,
  hasThreeYearCommitment,
  isGlobalSalesEnabled,
  readParameter,
  resolveAgreementId,
  resolveSubscriptionId,
} from './model';

describe('agreement model helpers', () => {
  it('resolves agreement id from the Marketplace context agreement', () => {
    const result = resolveAgreementId({
      data: {
        agreement: {
          id: 'AGR-1234-5678-9012',
        },
      },
    });

    expect(result).toBe('AGR-1234-5678-9012');
  });

  it('trims agreement id from the Marketplace context agreement', () => {
    const result = resolveAgreementId({
      data: {
        agreement: {
          id: ' AGR-9876-5432-1098 ',
        },
      },
    });

    expect(result).toBe('AGR-9876-5432-1098');
  });

  it('returns an empty agreement id when the context agreement is missing', () => {
    const result = resolveAgreementId({});

    expect(result).toBe('');
  });
});

describe('subscription model helpers', () => {
  it('resolves subscription id from the Marketplace context subscription', () => {
    const result = resolveSubscriptionId({
      data: {
        subscription: {
          id: 'SUB-1234-5678-9012',
        },
      },
    });

    expect(result).toBe('SUB-1234-5678-9012');
  });

  it('trims subscription id from the Marketplace context subscription', () => {
    const result = resolveSubscriptionId({
      data: {
        subscription: {
          id: ' SUB-9876-5432-1098 ',
        },
      },
    });

    expect(result).toBe('SUB-9876-5432-1098');
  });

  it('returns an empty subscription id when the context subscription is missing', () => {
    const result = resolveSubscriptionId({});

    expect(result).toBe('');
  });
});

describe('readParameter', () => {
  const parameters: CommerceParameter[] = [
    { externalId: '3YCEnrollStatus', value: 'Enrolled' },
    { externalId: '3YCMinLicenses', value: 100 },
  ];

  it('returns the value of the matching parameter', () => {
    expect(readParameter(parameters, '3YCMinLicenses')).toBe(100);
  });

  it('returns undefined when no parameter matches', () => {
    expect(readParameter(parameters, 'missing')).toBeUndefined();
  });

  it('returns undefined when parameters are not provided', () => {
    expect(readParameter(undefined, '3YCEnrollStatus')).toBeUndefined();
  });
});

describe('findLinkedMembership', () => {
  it('returns the linked membership from the customer payload', () => {
    const membership = { linkedMembershipId: 'LM-1', name: 'My Group', type: 'STANDARD' };

    expect(findLinkedMembership({ linkedMembership: membership })).toBe(membership);
  });

  it('returns undefined when the customer has no linked membership', () => {
    expect(findLinkedMembership({ linkedMembership: null })).toBeUndefined();
    expect(findLinkedMembership({})).toBeUndefined();
  });

  it('returns undefined when the customer data is null', () => {
    expect(findLinkedMembership(null)).toBeUndefined();
  });
});

describe('hasThreeYearCommitment', () => {
  it('returns true when the current commitment is COMMITTED', () => {
    expect(
      hasThreeYearCommitment({
        benefits: [
          { type: 'THREE_YEAR_COMMIT', commitment: { status: 'COMMITTED', minimumQuantities: [] } },
        ],
      }),
    ).toBe(true);
  });

  it('returns false for a non-committed commitment status', () => {
    expect(
      hasThreeYearCommitment({
        benefits: [
          { type: 'THREE_YEAR_COMMIT', commitment: { status: 'REQUESTED', minimumQuantities: [] } },
        ],
      }),
    ).toBe(false);
  });

  it('returns false when there is no three-year benefit or customer data', () => {
    expect(hasThreeYearCommitment({ benefits: [] })).toBe(false);
    expect(hasThreeYearCommitment({})).toBe(false);
    expect(hasThreeYearCommitment(null)).toBe(false);
  });
});

describe('isGlobalSalesEnabled', () => {
  it('returns true when the customer has global sales enabled', () => {
    expect(isGlobalSalesEnabled({ globalSalesEnabled: true })).toBe(true);
  });

  it('returns false when the flag is false, absent, or there is no customer data', () => {
    expect(isGlobalSalesEnabled({ globalSalesEnabled: false })).toBe(false);
    expect(isGlobalSalesEnabled({})).toBe(false);
    expect(isGlobalSalesEnabled(null)).toBe(false);
    expect(isGlobalSalesEnabled(undefined)).toBe(false);
  });
});

describe('ProductSegments', () => {
  it('maps each segment to its string value', () => {
    expect(ProductSegments.COM).toBe('COM');
    expect(ProductSegments.EDU).toBe('EDU');
    expect(ProductSegments.GOV).toBe('GOV');
    expect(ProductSegments.LGA).toBe('LGA');
  });
});

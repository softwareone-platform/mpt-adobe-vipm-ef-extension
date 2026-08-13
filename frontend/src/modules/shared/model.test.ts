import {
  CommerceParameter,
  ProductSegments,
  RenewalPlanBody,
  findLinkedMembership,
  getRecommendedOfferIds,
  hasThreeYearCommitment,
  isGlobalSalesEnabled,
  isRenewalPreviewRequired,
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
    { id: 'PAR-1', externalId: 'paramA', value: 'valueA' },
    { id: 'PAR-2', externalId: 'paramB', value: 100 },
  ];

  it('returns the value of the matching parameter', () => {
    expect(readParameter(parameters, 'paramB')).toBe(100);
  });

  it('returns undefined when no parameter matches', () => {
    expect(readParameter(parameters, 'missing')).toBeUndefined();
  });

  it('returns undefined when parameters are not provided', () => {
    expect(readParameter(undefined, 'paramA')).toBeUndefined();
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

describe('getRecommendedOfferIds', () => {
  it('flattens upsells, crossSells and addOns into a set of base offer ids', () => {
    const result = getRecommendedOfferIds({
      productRecommendations: {
        upsells: [{ product: { baseOfferId: 'OFFER-UP' } }],
        crossSells: [{ product: { baseOfferId: 'OFFER-CROSS' } }],
        addOns: [{ product: { baseOfferId: 'OFFER-ADDON' } }],
      },
      xRecommendationTrackerId: 'TRACKER-1',
    });

    expect(result).toEqual(new Set(['OFFER-UP', 'OFFER-CROSS', 'OFFER-ADDON']));
  });

  it('skips recommendations without a base offer id', () => {
    const result = getRecommendedOfferIds({
      productRecommendations: { upsells: [{ rank: 0 }], crossSells: [], addOns: [] },
      xRecommendationTrackerId: '',
    });

    expect(result.size).toBe(0);
  });

  it('returns an empty set when there is no data', () => {
    expect(getRecommendedOfferIds(null).size).toBe(0);
    expect(getRecommendedOfferIds(undefined).size).toBe(0);
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

describe('isRenewalPreviewRequired', () => {
  const plan = (overrides: Partial<RenewalPlanBody> = {}): RenewalPlanBody => ({
    renewalPath: 'now',
    subscriptions: [{ id: 'SUB-1', offerId: 'OFFER-1', renew: true, renewalQuantity: 5 }],
    netNewItems: [],
    ...overrides,
  });

  it('previews an early renewal that renews a subscription', () => {
    expect(isRenewalPreviewRequired(plan())).toBe(true);
  });

  it('previews an early renewal that only adds a product', () => {
    const result = isRenewalPreviewRequired(
      plan({ subscriptions: [], netNewItems: [{ offerId: 'OFFER-2', quantity: 3 }] }),
    );

    expect(result).toBe(true);
  });

  it('does not preview an at-anniversary plan', () => {
    expect(isRenewalPreviewRequired(plan({ renewalPath: 'anniversary' }))).toBe(false);
  });

  it('does not preview an early renewal with no line Adobe could price', () => {
    const result = isRenewalPreviewRequired(
      plan({
        subscriptions: [{ id: 'SUB-1', offerId: 'OFFER-1', renew: false, renewalQuantity: 0 }],
      }),
    );

    expect(result).toBe(false);
  });
});

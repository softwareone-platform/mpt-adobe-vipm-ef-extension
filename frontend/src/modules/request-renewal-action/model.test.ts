import {
  appliesToRenewal,
  buildInitialRenewalSelections,
  buildRenewalPlanRequest,
  canRenewAtAnniversary,
  findDiscountByCode,
  getDefaultRenewalQuantity,
  getHeldSkus,
  getRenewalQuantity,
  getRenewalRowIds,
  getSelectedDiscountCodes,
  isDiscountAvailable,
  isRenewedByDefault,
  isRenewing,
  normalizeDiscountCode,
} from './model';
import type { Discount, Subscription } from '../shared/model';

describe('isRenewedByDefault', () => {
  it('renews a subscription whose autoRenewal preference is on', () => {
    expect(isRenewedByDefault({ id: 'SUB-1', autoRenew: true })).toBe(true);
  });

  it('lets a subscription lapse when the preference is off or unknown', () => {
    expect(isRenewedByDefault({ id: 'SUB-1', autoRenew: false })).toBe(false);
    expect(isRenewedByDefault({ id: 'SUB-1' })).toBe(false);
  });
});

describe('buildInitialRenewalSelections', () => {
  it('seeds one decision per subscription from its standing preference', () => {
    expect(
      buildInitialRenewalSelections([
        { id: 'SUB-1', autoRenew: true },
        { id: 'SUB-2', autoRenew: false },
        { id: 'SUB-3' },
      ]),
    ).toEqual({ 'SUB-1': true, 'SUB-2': false, 'SUB-3': false });
  });

  it('builds an empty plan for an agreement without subscriptions', () => {
    expect(buildInitialRenewalSelections([])).toEqual({});
  });
});

describe('isRenewing', () => {
  it('prefers the customer selection over the standing preference', () => {
    expect(isRenewing({ id: 'SUB-1', autoRenew: true }, { 'SUB-1': false })).toBe(false);
    expect(isRenewing({ id: 'SUB-1', autoRenew: false }, { 'SUB-1': true })).toBe(true);
  });

  it('falls back to the standing preference without a selection', () => {
    expect(isRenewing({ id: 'SUB-1', autoRenew: true }, {})).toBe(true);
    expect(isRenewing({ id: 'SUB-1', autoRenew: false }, {})).toBe(false);
  });
});

describe('getRenewalQuantity', () => {
  const subscription: Subscription = {
    id: 'SUB-1',
    lines: [{ id: 'ALI-1', quantity: 37, item: { id: 'ITM-1', name: 'Item' } }],
  };

  it('defaults to the standing line quantity', () => {
    expect(getDefaultRenewalQuantity(subscription)).toBe(37);
    expect(getRenewalQuantity(subscription, {})).toBe(37);
  });

  it('prefers the quantity the customer typed, including a cleared input', () => {
    expect(getRenewalQuantity(subscription, { 'SUB-1': 53 })).toBe(53);
    expect(getRenewalQuantity(subscription, { 'SUB-1': null })).toBeNull();
  });

  it('has no quantity for a subscription without lines', () => {
    expect(getDefaultRenewalQuantity({ id: 'SUB-2' })).toBeNull();
    expect(getRenewalQuantity({ id: 'SUB-2' }, {})).toBeNull();
  });
});

describe('buildRenewalPlanRequest', () => {
  const subscriptions: Subscription[] = [
    {
      id: 'SUB-1',
      autoRenew: true,
      lines: [
        {
          id: 'ALI-1',
          quantity: 37,
          item: { id: 'ITM-1', name: 'Item', externalIds: { vendor: '65322587CA01A12' } },
        },
      ],
    },
    {
      id: 'SUB-2',
      autoRenew: true,
      lines: [
        {
          id: 'ALI-2',
          quantity: 21,
          item: { id: 'ITM-2', name: 'Item 2', externalIds: { vendor: '65322588CA01A12' } },
        },
      ],
    },
  ];

  it('carries every subscription with its renew decision and quantity', () => {
    const plan = buildRenewalPlanRequest(
      subscriptions,
      { 'SUB-2': false },
      { 'SUB-1': 53 },
      [],
      'anniversary',
    );

    expect(plan).toEqual({
      renewalPath: 'anniversary',
      subscriptions: [
        { id: 'SUB-1', offerId: '65322587CA01A12', renew: true, renewalQuantity: 53 },
        { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
      ],
      netNewItems: [],
    });
  });

  it('carries the early-renewal path the customer picked on the first step', () => {
    const plan = buildRenewalPlanRequest(subscriptions, {}, {}, [], 'now');

    expect(plan.renewalPath).toBe('now');
  });

  it('maps the net-new additions onto their offer selections', () => {
    const plan = buildRenewalPlanRequest(
      subscriptions,
      {},
      {},
      [
        {
          itemId: 'ITM-9',
          itemName: 'Premiere Pro',
          sku: '65304578CA01A12',
          unitSP: 234,
          quantity: 5,
          recommended: false,
        },
      ],
      'anniversary',
    );

    expect(plan.netNewItems).toEqual([{ offerId: '65304578CA01A12', quantity: 5 }]);
  });

  it('skips a subscription without a vendor SKU', () => {
    const plan = buildRenewalPlanRequest([{ id: 'SUB-3' }], {}, {}, [], 'anniversary');

    expect(plan.subscriptions).toEqual([]);
  });
});

describe('getHeldSkus', () => {
  it('collects the partial SKU of every subscription line', () => {
    const skus = getHeldSkus([
      {
        id: 'SUB-1',
        lines: [
          {
            id: 'ALI-1',
            quantity: 1,
            item: { id: 'ITM-1', name: 'Item', externalIds: { vendor: '65322587CA01A12' } },
          },
        ],
      },
      { id: 'SUB-2' },
    ]);

    expect(skus).toEqual(new Set(['65322587CA']));
  });
});

describe('canRenewAtAnniversary', () => {
  const subscription: Subscription = {
    id: 'SUB-1',
    lines: [
      {
        id: 'ALI-1',
        quantity: 1,
        item: { id: 'ITM-1', name: 'Item', externalIds: { vendor: '65322587CA01A12' } },
      },
    ],
  };

  it('accepts a subscription whose SKU supports auto-renewal', () => {
    expect(canRenewAtAnniversary(subscription, { '65322587CA': true })).toBe(true);
  });

  it('rejects a SKU without support, and one that was never looked up', () => {
    expect(canRenewAtAnniversary(subscription, { '65322587CA': false })).toBe(false);
    expect(canRenewAtAnniversary(subscription, {})).toBe(false);
  });

  it('rejects a subscription carrying no SKU', () => {
    expect(canRenewAtAnniversary({ id: 'SUB-2' }, { '65322587CA': true })).toBe(false);
  });
});

describe('normalizeDiscountCode', () => {
  it('trims and upper-cases the typed code', () => {
    expect(normalizeDiscountCode('  code-one ')).toBe('CODE-ONE');
  });
});

describe('isDiscountAvailable', () => {
  const discount: Discount = { id: 'DSC-1', code: 'CODE-ONE' };

  it('offers a code the customer has not redeemed', () => {
    expect(isDiscountAvailable(discount)).toBe(true);
    expect(isDiscountAvailable({ ...discount, redeemedAt: null })).toBe(true);
  });

  it('takes a redeemed single-use code out of play', () => {
    expect(isDiscountAvailable({ ...discount, redeemedAt: '2026-03-04T10:00:00+00:00' })).toBe(
      false,
    );
  });

  it('keeps a reusable code in play after its redemption', () => {
    expect(
      isDiscountAvailable({
        ...discount,
        reusable: true,
        redeemedAt: '2026-03-04T10:00:00+00:00',
      }),
    ).toBe(true);
  });
});

describe('appliesToRenewal', () => {
  const discount: Discount = { id: 'DSC-1', code: 'CODE-ONE' };

  it('applies an unrestricted code to a renewal', () => {
    expect(appliesToRenewal(discount)).toBe(true);
    expect(appliesToRenewal({ ...discount, applicableOrderTypes: [] })).toBe(true);
  });

  it('applies a code listing the renewal order type', () => {
    expect(appliesToRenewal({ ...discount, applicableOrderTypes: ['NEW', 'RENEWAL'] })).toBe(true);
  });

  it('leaves out a code restricted to other order types', () => {
    expect(appliesToRenewal({ ...discount, applicableOrderTypes: ['NEW'] })).toBe(false);
  });
});

describe('getRenewalRowIds', () => {
  const subscriptions: Subscription[] = [
    { id: 'SUB-1', autoRenew: true },
    { id: 'SUB-2', autoRenew: false },
  ];

  it('carries the renewing subscriptions and the net-new products', () => {
    expect(
      getRenewalRowIds(subscriptions, {}, [
        {
          itemId: 'ITM-9',
          itemName: 'Item',
          sku: 'OFFER-9',
          unitSP: 10,
          quantity: 1,
          recommended: false,
        },
      ]),
    ).toEqual(['SUB-1', 'ITM-9']);
  });
});

describe('getSelectedDiscountCodes', () => {
  it('lists each applied code once, skipping the lines without one', () => {
    expect(
      getSelectedDiscountCodes({ 'SUB-1': 'CODE-ONE', 'SUB-2': '', 'ITM-1': 'CODE-ONE' }, [
        'SUB-1',
        'SUB-2',
        'ITM-1',
      ]),
    ).toEqual(['CODE-ONE']);
  });

  it('has nothing to send when no line carries a code', () => {
    expect(getSelectedDiscountCodes({}, [])).toEqual([]);
  });

  it('sends one entry for the same code written differently', () => {
    expect(
      getSelectedDiscountCodes({ 'SUB-1': ' code-one ', 'SUB-2': 'CODE-ONE' }, ['SUB-1', 'SUB-2']),
    ).toEqual(['CODE-ONE']);
  });

  it('drops the code of a line the renewal no longer carries', () => {
    expect(
      getSelectedDiscountCodes({ 'SUB-1': 'CODE-ONE', 'SUB-2': 'CODE-TWO' }, ['SUB-1']),
    ).toEqual(['CODE-ONE']);
  });
});

describe('findDiscountByCode', () => {
  const discounts: Discount[] = [{ id: 'DSC-1', code: 'CODE-ONE' }];

  it('matches a known code regardless of its case', () => {
    expect(findDiscountByCode('code-one', discounts)?.id).toBe('DSC-1');
  });

  it('returns nothing for a code the store does not hold', () => {
    expect(findDiscountByCode('CODE-TWO', discounts)).toBeUndefined();
  });
});


import {
  appliesToOffer,
  appliesToRenewal,
  buildInitialRenewalSelections,
  buildRenewalPlanRequest,
  canRenewAtAnniversary,
  findDiscountByCode,
  findRenewAndAddConflict,
  getDefaultRenewalQuantity,
  getDiscountLabel,
  getHeldSkus,
  getRemainingQuantity,
  getRenewalQuantity,
  getRenewalState,
  isDiscountAvailable,
  isEarlyRenewable,
  isIncreaseAllowed,
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
        {
          id: 'SUB-1',
          offerId: '65322587CA01A12',
          renew: true,
          renewalQuantity: 53,
          flexDiscountCodes: [],
        },
        {
          id: 'SUB-2',
          offerId: '65322588CA01A12',
          renew: false,
          renewalQuantity: 0,
          flexDiscountCodes: [],
        },
      ],
      netNewItems: [],
    });
  });

  it('stamps each line with its own discount code', () => {
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
      { 'SUB-1': ' code-one ', 'ITM-9': 'CODE-NET-NEW' },
    );

    expect(plan.subscriptions[0].flexDiscountCodes).toEqual(['CODE-ONE']);
    expect(plan.subscriptions[1].flexDiscountCodes).toEqual([]);
    expect(plan.netNewItems[0].flexDiscountCodes).toEqual(['CODE-NET-NEW']);
  });

  it('keeps a code off a lapsing subscription', () => {
    const plan = buildRenewalPlanRequest(subscriptions, { 'SUB-1': false }, {}, [], 'anniversary', {
      'SUB-1': 'CODE-ONE',
    });

    expect(plan.subscriptions[0].flexDiscountCodes).toEqual([]);
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

    expect(plan.netNewItems).toEqual([
      { offerId: '65304578CA01A12', quantity: 5, flexDiscountCodes: [] },
    ]);
  });

  it('skips a subscription without a vendor SKU', () => {
    const plan = buildRenewalPlanRequest([{ id: 'SUB-3' }], {}, {}, [], 'anniversary');

    expect(plan.subscriptions).toEqual([]);
  });
});

describe('renewal state helpers', () => {
  const ADOBE_ID = 'a1b2c3d4e5NA';
  const subscription: Subscription = {
    id: 'SUB-1',
    externalIds: { vendor: ADOBE_ID },
    lines: [{ id: 'ALI-1', quantity: 10, item: { id: 'ITM-1', name: 'Item' } }],
  };
  const partial = {
    currentQuantity: 10,
    renewedQuantity: 4,
    state: 'partiallyRenewed' as const,
    remainingQuantity: 6,
    earlyRenewable: true,
    increaseAllowed: false,
  };
  const states = { [ADOBE_ID]: partial };

  it('finds the state by the Adobe subscription id', () => {
    expect(getRenewalState(subscription, states)).toEqual(partial);
    expect(getRenewalState({ id: 'SUB-2' }, states)).toBeUndefined();
  });

  it('reports the seats a further renewal can still carry', () => {
    expect(getRemainingQuantity(subscription, states)).toBe(6);
  });

  it('falls back to the whole line without a state', () => {
    expect(getRemainingQuantity(subscription, {})).toBe(10);
  });

  it('keeps a line the customer holds unless Adobe retired the SKU', () => {
    expect(isEarlyRenewable(subscription, {})).toBe(true);
    expect(isEarlyRenewable(subscription, states)).toBe(true);
    expect(
      isEarlyRenewable(subscription, { [ADOBE_ID]: { ...partial, earlyRenewable: false } }),
    ).toBe(false);
  });

  it('offers an increase only on a fully renewed line of the early path', () => {
    const renewed = { [ADOBE_ID]: { ...partial, increaseAllowed: true } };
    expect(isIncreaseAllowed(subscription, renewed, 'now')).toBe(true);
    expect(isIncreaseAllowed(subscription, renewed, 'anniversary')).toBe(false);
    expect(isIncreaseAllowed(subscription, states, 'now')).toBe(false);
    expect(isIncreaseAllowed(subscription, {}, 'now')).toBe(false);
  });
});

describe('findRenewAndAddConflict', () => {
  const renewalLine = { lineNumber: 1, itemId: 'ITM-1', isNetNew: false };
  const increase = { ...renewalLine, currentQuantity: 37, renewalQuantity: 53 };
  const decrease = { ...renewalLine, lineNumber: 2, itemId: 'ITM-2', currentQuantity: 10, renewalQuantity: 6 };
  const netNew = {
    lineNumber: 3,
    itemId: 'ITM-3',
    isNetNew: true,
    currentQuantity: null,
    renewalQuantity: 22,
  };

  it('reports both sides when an increase meets a renewal change', () => {
    expect(findRenewAndAddConflict([increase, decrease], 'now')).toEqual({
      renewals: [decrease],
      additions: [increase],
    });
  });

  it('counts a net-new product as an addition', () => {
    expect(findRenewAndAddConflict([decrease, netNew], 'now')).toEqual({
      renewals: [decrease],
      additions: [netNew],
    });
  });

  it('accepts a basket that only renews or only adds', () => {
    expect(findRenewAndAddConflict([decrease], 'now')).toBeNull();
    expect(findRenewAndAddConflict([increase, netNew], 'now')).toBeNull();
  });

  it('counts an unchanged line as a renewal, since it still rides the renew-mode order', () => {
    const unchanged = { ...renewalLine, currentQuantity: 37, renewalQuantity: 37 };

    expect(findRenewAndAddConflict([unchanged, netNew], 'now')).toEqual({
      renewals: [unchanged],
      additions: [netNew],
    });
  });

  it('forbids nothing at the anniversary', () => {
    expect(findRenewAndAddConflict([increase, decrease], 'anniversary')).toBeNull();
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

describe('appliesToOffer', () => {
  const discount: Discount = { id: 'DSC-1', code: 'CODE-ONE' };

  it('applies a code with no targets to every line', () => {
    expect(appliesToOffer(discount, '65322651CA02A12')).toBe(true);
    expect(appliesToOffer({ ...discount, targetOfferIds: [] }, '65322651CA02A12')).toBe(true);
  });

  it('applies a targeted code to the offers it lists', () => {
    const targeted = { ...discount, targetOfferIds: ['65322651CA02A12', '11083117CA01A12'] };

    expect(appliesToOffer(targeted, '11083117CA01A12')).toBe(true);
    expect(appliesToOffer(targeted, ' 11083117ca01a12 ')).toBe(true);
  });

  it('reads a target list that arrives as one comma-separated entry', () => {
    const targeted = { ...discount, targetOfferIds: ['65322651CA02A12,11083117CA01A12'] };

    expect(appliesToOffer(targeted, '11083117CA01A12')).toBe(true);
    expect(appliesToOffer(targeted, '30001846CB')).toBe(false);
  });

  it('leaves out a targeted code on another offer', () => {
    const targeted = { ...discount, targetOfferIds: ['65322651CA02A12'] };

    expect(appliesToOffer(targeted, '11083117CA01A12')).toBe(false);
    expect(appliesToOffer(targeted, '')).toBe(false);
  });
});

describe('getDiscountLabel', () => {
  it('reads the code alone when it carries no name', () => {
    expect(getDiscountLabel({ id: 'DSC-1', code: 'CODE-ONE' })).toBe('CODE-ONE');
    expect(getDiscountLabel({ id: 'DSC-1', code: 'CODE-ONE', name: '  ' })).toBe('CODE-ONE');
  });

  it('reads the name in brackets after the code', () => {
    expect(getDiscountLabel({ id: 'DSC-1', code: 'CODE-ONE', name: 'Spring promo' })).toBe(
      'CODE-ONE (Spring promo)',
    );
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


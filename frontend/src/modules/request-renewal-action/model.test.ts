import {
  buildInitialRenewalSelections,
  buildRenewalPlanRequest,
  getDefaultRenewalQuantity,
  getHeldSkus,
  getRenewalQuantity,
  isRenewedByDefault,
  isRenewing,
} from './model';
import type { Subscription } from '../shared/model';

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
    );

    expect(plan).toEqual({
      subscriptions: [
        { id: 'SUB-1', offerId: '65322587CA01A12', renew: true, renewalQuantity: 53 },
        { id: 'SUB-2', offerId: '65322588CA01A12', renew: false, renewalQuantity: 0 },
      ],
      netNewItems: [],
    });
  });

  it('maps the net-new additions onto their offer selections', () => {
    const plan = buildRenewalPlanRequest(subscriptions, {}, {}, [
      {
        itemId: 'ITM-9',
        itemName: 'Premiere Pro',
        sku: '65304578CA01A12',
        unitSP: 234,
        quantity: 5,
        recommended: false,
      },
    ]);

    expect(plan.netNewItems).toEqual([{ offerId: '65304578CA01A12', quantity: 5 }]);
  });

  it('skips a subscription without a vendor SKU', () => {
    const plan = buildRenewalPlanRequest([{ id: 'SUB-3' }], {}, {}, []);

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

import { buildInitialRenewalSelections, isRenewedByDefault } from './model';

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

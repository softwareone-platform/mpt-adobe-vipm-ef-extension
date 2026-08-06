import type { Subscription } from '../shared/model';

export type RenewalPath = 'anniversary' | 'now';

/** The customer's per-subscription renewal decisions, keyed by subscription id. */
export type RenewalSelections = Record<string, boolean>;

/**
 * Whether a subscription renews unless the customer opts out.
 *
 * The Renew toggle maps to the standing ``autoRenewal.enabled`` preference,
 * which the platform mirrors on the subscription's ``autoRenew`` flag.
 */
export function isRenewedByDefault(subscription: Subscription): boolean {
  return subscription.autoRenew === true;
}

export function buildInitialRenewalSelections(subscriptions: Subscription[]): RenewalSelections {
  return Object.fromEntries(
    subscriptions.map((subscription) => [subscription.id, isRenewedByDefault(subscription)]),
  );
}

import type { Subscription, Terms } from '../shared/model';
import { getPartialSku } from '../utils/sku';

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

/** Whether the customer currently plans to renew the subscription. */
export function isRenewing(subscription: Subscription, selections: RenewalSelections): boolean {
  return selections[subscription.id] ?? isRenewedByDefault(subscription);
}

/**
 * The renewal quantities typed in the Items step, keyed by subscription id.
 *
 * Only edited subscriptions appear; ``null`` marks a cleared input awaiting a
 * value. Untouched subscriptions renew at their standing quantity.
 */
export type RenewalQuantities = Record<string, number | null>;

/**
 * The quantity a subscription renews at unless the customer changes it.
 *
 * Adobe subscriptions hold exactly one item, and the platform keeps the line
 * quantity aligned with Adobe's standing renewal quantity.
 */
export function getDefaultRenewalQuantity(subscription: Subscription): number | null {
  return subscription.lines?.[0]?.quantity ?? null;
}

export function getRenewalQuantity(
  subscription: Subscription,
  quantities: RenewalQuantities,
): number | null {
  const stored = quantities[subscription.id];
  return stored !== undefined ? stored : getDefaultRenewalQuantity(subscription);
}

/**
 * A product the customer does not currently hold, scheduled to activate at
 * the anniversary.
 *
 * Picked from the agreement's price list in the Items step and carried in the
 * wizard state until the submission sends it as a ``netNewItems`` entry
 * (fulfilment creates the scheduled subscription). ``quantity`` is ``null``
 * while the input is cleared.
 */
export interface NetNewItem {
  itemId: string;
  itemName: string;
  sku: string;
  terms?: Terms;
  unitSP: number | null;
  quantity: number | null;
  recommended: boolean;
}

/**
 * The partial SKUs the agreement already holds via its subscriptions.
 *
 * The add-items picker excludes these: an item the customer holds renews
 * through its subscription, never as a net-new product.
 */
export function getHeldSkus(subscriptions: Subscription[]): Set<string> {
  return new Set(
    subscriptions.flatMap((subscription) => {
      const sku = subscription.lines?.[0]?.item.externalIds?.vendor;
      return sku ? [getPartialSku(sku)] : [];
    }),
  );
}

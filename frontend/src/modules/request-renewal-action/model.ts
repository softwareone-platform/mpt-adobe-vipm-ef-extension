import type { Discount, RenewalPlanBody, Subscription, Terms } from '../shared/model';
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

export interface OrderDetails {
  externalId: string;
  notes: string;
}

/** Codes are matched case-insensitively; Adobe records them in upper case. */
export function normalizeDiscountCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Whether the customer can still apply the discount.
 *
 * A code can be redeemed only once per customer, so a redemption recorded
 * against this customer takes the code out of play.
 */
export function isDiscountAvailable(discount: Discount): boolean {
  return !discount.redeemedAt;
}

/** Whether the discount applies to a renewal; an unrestricted code applies to any order. */
export function appliesToRenewal(discount: Discount): boolean {
  const orderTypes = discount.applicableOrderTypes;
  return !orderTypes?.length || orderTypes.includes('RENEWAL');
}

/** The discount code applied to each renewal line, keyed by subscription or item id. */
export type DiscountSelections = Record<string, string>;

/** The ids of the lines the renewal carries: the renewing subscriptions and the net-new products. */
export function getRenewalRowIds(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  netNewItems: NetNewItem[],
): string[] {
  return [
    ...subscriptions
      .filter((subscription) => isRenewing(subscription, selections))
      .map((subscription) => subscription.id),
    ...netNewItems.map((item) => item.itemId),
  ];
}

/**
 * The codes the renewal carries, as the order's flat ``flexDiscountCodes`` list.
 *
 * A code stays in the wizard state after its line leaves the plan — the
 * customer switched Renew off or removed the net-new product — so only the
 * codes still sitting on a carried line are sent.
 */
export function getSelectedDiscountCodes(
  selections: DiscountSelections,
  rowIds: string[],
): string[] {
  const carried = new Set(rowIds);
  return Array.from(
    new Set(
      Object.entries(selections)
        .filter(([rowId]) => carried.has(rowId))
        .map(([, code]) => normalizeDiscountCode(code))
        .filter(Boolean),
    ),
  );
}

export function findDiscountByCode(code: string, discounts: Discount[]): Discount | undefined {
  const wanted = normalizeDiscountCode(code);
  return discounts.find((discount) => normalizeDiscountCode(discount.code) === wanted);
}

/**
 * The wizard's renewal plan as the renewal endpoints expect it.
 *
 * Carries every subscription with its renew decision — the 3YC floor check
 * needs the lapsing ones too — plus the net-new additions. Quantities are
 * expected to have passed the Items step validation; a pending (``null``)
 * quantity is sent as 0, which the backend rejects.
 */
export function buildRenewalPlanRequest(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  netNewItems: NetNewItem[],
): RenewalPlanBody {
  return {
    subscriptions: subscriptions.flatMap((subscription) => {
      const offerId = subscription.lines?.[0]?.item.externalIds?.vendor;
      if (!offerId) return [];
      const renew = isRenewing(subscription, selections);
      return [
        {
          id: subscription.id,
          offerId,
          renew,
          renewalQuantity: renew ? (getRenewalQuantity(subscription, quantities) ?? 0) : 0,
        },
      ];
    }),
    netNewItems: netNewItems.map((item) => ({
      offerId: item.sku,
      quantity: item.quantity ?? 0,
    })),
  };
}

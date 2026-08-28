import type {
  Discount,
  RenewalPath,
  RenewalPlanBody,
  RenewalStateEntry,
  Subscription,
  Terms,
} from '../shared/model';
import { getPartialSku } from '../utils/sku';

// The wizard's steps read the path from here, next to the rest of the plan
// state, while the endpoint bodies that carry it live in the shared model.
export type { RenewalPath };

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

/** The per-subscription early-renewal states, keyed by Adobe subscription id. */
export type RenewalStates = Record<string, RenewalStateEntry>;

/**
 * The subscription's early-renewal state, or ``undefined`` when there is none.
 *
 * Adobe reports the state against its own subscription id, which the platform
 * mirrors on the subscription's vendor external id. A subscription missing from
 * the reply has never been early-renewed — Adobe only returns the renewed
 * quantity inside the pre-anniversary window — so the caller falls back to the
 * not-renewed reading rather than treating it as an error.
 */
export function getRenewalState(
  subscription: Subscription,
  states: RenewalStates,
): RenewalStateEntry | undefined {
  const adobeSubscriptionId = subscription.externalIds?.vendor;
  return adobeSubscriptionId ? states[adobeSubscriptionId] : undefined;
}

/**
 * Whether the early path can carry the subscription at all.
 *
 * A SKU Adobe will not early-renew (end of sale always, end of life for a
 * customer without a three-year commitment) is left out of the wizard rather
 * than shown in a restricted state. An unknown state does not hide the line:
 * the preview rejects it if Adobe disagrees.
 */
export function isEarlyRenewable(subscription: Subscription, states: RenewalStates): boolean {
  return getRenewalState(subscription, states)?.earlyRenewable !== false;
}

/**
 * How many of the existing seats this renewal can still early-renew.
 *
 * The figure the remainder control surfaces on a partially-renewed line ("X of
 * Y renewed, renew remaining Z"). Without a state the whole line is still
 * renewable.
 */
export function getRemainingQuantity(
  subscription: Subscription,
  states: RenewalStates,
): number | null {
  const state = getRenewalState(subscription, states);
  return state ? state.remainingQuantity : getDefaultRenewalQuantity(subscription);
}

/**
 * Whether the Items step offers an increase beyond the current quantity.
 *
 * An increase rides a later add-mode order, so it is offered only once every
 * existing seat is already early-renewed; a partially-renewed line renews its
 * remainder first. Only the early path can increase at all.
 */
export function isIncreaseAllowed(
  subscription: Subscription,
  states: RenewalStates,
  path: RenewalPath,
): boolean {
  return path === 'now' && getRenewalState(subscription, states)?.increaseAllowed === true;
}

/** One Items-step line as the renew-and-add check reads it. */
export interface RenewalLine {
  /** The line's position in the grid, which the guidance names. */
  lineNumber: number;
  itemId: string;
  isNetNew: boolean;
  currentQuantity: number | null;
  renewalQuantity: number | null;
}

/** The two sides of a basket Adobe cannot place as one order. */
export interface RenewAndAddConflict {
  renewals: RenewalLine[];
  additions: RenewalLine[];
}

/**
 * Whether the line asks for seats beyond what the customer holds.
 *
 * A net-new product and an increase beyond the current quantity are the same
 * thing to Adobe: both ride an add-mode order.
 */
export function isAddition(line: RenewalLine): boolean {
  if (line.isNetNew) return true;
  return (
    line.currentQuantity != null &&
    line.renewalQuantity != null &&
    line.renewalQuantity > line.currentQuantity
  );
}

/**
 * Whether the line renews existing seats.
 *
 * Any existing line carried at or below the quantity the customer holds counts,
 * unchanged ones included: it still rides the renew-mode order, which Adobe
 * cannot combine with an addition. A line above the current quantity is the
 * addition itself, so it is left to ``isAddition``.
 */
export function isRenewalChange(line: RenewalLine): boolean {
  return (
    !line.isNetNew &&
    line.currentQuantity != null &&
    line.renewalQuantity != null &&
    line.renewalQuantity <= line.currentQuantity
  );
}

/**
 * The renew-and-add combination Adobe forbids in a single order, if the basket has it.
 *
 * An early renewal is placed as one Adobe order, and that order either renews
 * existing products or adds beyond them — never both. The customer keeps one
 * side and places the other as a later order, so both sides are returned for
 * the guidance to name. Nothing is forbidden at the anniversary, where the
 * order is a plain change.
 */
export function findRenewAndAddConflict(
  lines: RenewalLine[],
  path: RenewalPath,
): RenewAndAddConflict | null {
  if (path !== 'now') return null;
  const additions = lines.filter(isAddition);
  const renewals = lines.filter(isRenewalChange);
  return additions.length && renewals.length ? { renewals, additions } : null;
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

/** Whether the subscription's SKU can renew at the anniversary date. */
export function canRenewAtAnniversary(
  subscription: Subscription,
  support: Record<string, boolean>,
): boolean {
  const sku = subscription.lines?.[0]?.item.externalIds?.vendor;
  return sku ? support[getPartialSku(sku)] === true : false;
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
 * A single-use code can be redeemed once per customer, so a redemption
 * recorded against this customer takes it out of play. A reusable code stays
 * selectable after its redemption — its discount lock is what limits how long
 * it can be applied, and the listing already drops it once the lock runs out.
 */
export function isDiscountAvailable(discount: Discount): boolean {
  return Boolean(discount.reusable) || !discount.redeemedAt;
}

/** Whether the discount applies to a renewal; an unrestricted code applies to any order. */
export function appliesToRenewal(discount: Discount): boolean {
  const orderTypes = discount.applicableOrderTypes;
  return !orderTypes?.length || orderTypes.includes('RENEWAL');
}

/**
 * Whether the discount targets the line's offer.
 *
 * A code carries the offers it was created for as its target list, matched
 * against the item's vendor external id. A code with no targets is unrestricted
 * and applies to every line. The list is stored as one comma-separated string,
 * so an entry that arrives unsplit is split here.
 */
export function appliesToOffer(discount: Discount, vendorExternalId: string): boolean {
  const targets = getTargetOfferIds(discount);
  if (!targets.length) return true;
  const offer = vendorExternalId.trim().toUpperCase();
  return Boolean(offer) && targets.includes(offer);
}

function getTargetOfferIds(discount: Discount): string[] {
  return (discount.targetOfferIds ?? [])
    .flatMap((target) => target.split(','))
    .map((target) => target.trim().toUpperCase())
    .filter(Boolean);
}

/** How a code reads in the picker: its name in brackets when the code carries one. */
export function getDiscountLabel(discount: Discount): string {
  const name = discount.name?.trim();
  return name ? `${discount.code} (${name})` : discount.code;
}

/** The discount code applied to each renewal line, keyed by subscription or item id. */
export type DiscountSelections = Record<string, string>;

/**
 * The line's discount codes as its plan selection carries them.
 *
 * A code stays in the wizard state after its line leaves the plan — the
 * customer switched Renew off or removed the net-new product — so codes are
 * read per carried line, never from the state as a whole.
 */
function getLineDiscountCodes(
  discountSelections: DiscountSelections | undefined,
  rowId: string,
): string[] {
  const code = normalizeDiscountCode(discountSelections?.[rowId] ?? '');
  return code ? [code] : [];
}

export function findDiscountByCode(code: string, discounts: Discount[]): Discount | undefined {
  const wanted = normalizeDiscountCode(code);
  return discounts.find((discount) => normalizeDiscountCode(discount.code) === wanted);
}

/**
 * The wizard's renewal plan as the renewal endpoints expect it.
 *
 * Carries every subscription with its renew decision — the 3YC floor check
 * needs the lapsing ones too — plus the net-new additions and the renewal path
 * chosen on the first step, which decides how the backend validates the plan
 * and is snapshotted on the order for fulfilment. Quantities are expected to
 * have passed the Items step validation; a pending (``null``) quantity is sent
 * as 0, which the backend rejects.
 *
 * ``discountSelections`` stamps each line with the code the customer applied
 * to it on the Promotions step, so a code only ever reaches the line it was
 * picked for; the steps before Promotions build the plan without it. A
 * lapsing subscription never carries a code — there is no line to apply it to.
 */
export function buildRenewalPlanRequest(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  netNewItems: NetNewItem[],
  renewalPath: RenewalPath,
  discountSelections?: DiscountSelections,
): RenewalPlanBody {
  return {
    renewalPath,
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
          flexDiscountCodes: renew ? getLineDiscountCodes(discountSelections, subscription.id) : [],
        },
      ];
    }),
    netNewItems: netNewItems.map((item) => ({
      offerId: item.sku,
      quantity: item.quantity ?? 0,
      flexDiscountCodes: getLineDiscountCodes(discountSelections, item.itemId),
    })),
  };
}

import type { Discount } from '../shared/model';
import { getDiscountedUnitPrice, isDiscountAvailable } from './discount';

function netUnitPrice(discount: Discount, unitSP: number | null): number {
  if (unitSP == null) return Number.POSITIVE_INFINITY;
  return getDiscountedUnitPrice(unitSP, discount) ?? Number.POSITIVE_INFINITY;
}

function isClosed(discount: Discount): boolean {
  return (discount.source ?? '').trim().toUpperCase() !== 'OPEN';
}

function compareFlag(left: boolean, right: boolean): number {
  return Number(right) - Number(left);
}

/**
 * Rank the candidate codes for a line from best to worst value.
 *
 * The net price is computed locally from each code's Discount Values, so the
 * wizard can pre-select the best deal before Adobe quotes it. Ties break on
 * reusable over single-use, then closed over open, then the Adobe discount id
 * ascending as a stable key. A code whose value cannot be priced ranks last,
 * and a code the customer can no longer apply is never ranked at all.
 */
export function rankDiscounts(discounts: Discount[], unitSP: number | null): Discount[] {
  return discounts
    .filter(isDiscountAvailable)
    .map((discount) => ({ discount, net: netUnitPrice(discount, unitSP) }))
    .sort(
      (left, right) =>
        left.net - right.net ||
        compareFlag(Boolean(left.discount.reusable), Boolean(right.discount.reusable)) ||
        compareFlag(isClosed(left.discount), isClosed(right.discount)) ||
        (left.discount.adobeDiscountId ?? '').localeCompare(right.discount.adobeDiscountId ?? ''),
    )
    .map(({ discount }) => discount);
}

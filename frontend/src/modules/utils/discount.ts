import { i18n } from '../../i18n/translations';

import type { Discount, DiscountOrderType } from '../shared/model';
import { formatCurrency } from './price';

function clampPercentage(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

export function getDiscountedUnitPrice(unitSP: number, discount: Discount): number | null {
  const entry = discount.values?.[0];
  if (!entry || entry.value == null) return null;
  switch (discount.discountType) {
    case 'PERCENTAGE': {
      const percentage = clampPercentage(entry.value);
      return unitSP * (1 - percentage / 100);
    }
    case 'FIXED_DISCOUNT':
      return Math.max(unitSP - entry.value, 0);
    case 'FIXED_PRICE':
      return entry.value;
    default:
      return null;
  }
}

export function formatDiscountValue(discount: Discount): string {
  const entry = discount.values?.[0];
  if (!entry || entry.value == null) return '—';
  switch (discount.discountType) {
    case 'PERCENTAGE':
      return i18n.t('Discounts:PercentageOff', { value: entry.value });
    case 'FIXED_DISCOUNT':
      return i18n.t('Discounts:AmountOff', {
        amount: formatCurrency(entry.value, entry.currency),
      });
    default:
      return formatCurrency(entry.value, entry.currency);
  }
}

/** Order types a code must list explicitly; a code with no order types does not cover them. */
const EXPLICIT_ORDER_TYPES: readonly DiscountOrderType[] = ['SWITCH'];

/**
 * Whether the discount applies to an order of this type.
 *
 * A code with no order types applies to any order, except a switch order: a
 * mid-term upgrade is only offered the codes that list SWITCH explicitly.
 */
export function appliesToOrderType(discount: Discount, orderType: DiscountOrderType): boolean {
  const orderTypes = discount.applicableOrderTypes;
  if (!orderTypes?.length) return !EXPLICIT_ORDER_TYPES.includes(orderType);
  return orderTypes.includes(orderType);
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

/** How a code reads in the picker: its name in brackets when the code carries one. */
export function getDiscountLabel(discount: Discount): string {
  const name = discount.name?.trim();
  return name ? `${discount.code} (${name})` : discount.code;
}

import { i18n } from '../../i18n/translations';

import type { Discount } from '../shared/model';
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

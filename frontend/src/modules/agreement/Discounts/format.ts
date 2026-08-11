import { i18n } from '../../../i18n/translations';

import type { Discount, DiscountOrderType } from '../../shared/model';

export const EM_DASH = '—';

export function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : EM_DASH;
}

function formatCurrency(value: number, currency?: string): string {
  if (!currency) return String(value);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function formatValue(discount: Discount): string {
  const entry = discount.values?.[0];
  if (!entry || entry.value == null) return EM_DASH;
  switch (discount.discountType) {
    case 'PERCENTAGE':
      return i18n.t('Agreement:Discounts:PercentageOff', { value: entry.value });
    case 'FIXED_DISCOUNT':
      return i18n.t('Agreement:Discounts:AmountOff', {
        amount: formatCurrency(entry.value, entry.currency),
      });
    default:
      return formatCurrency(entry.value, entry.currency);
  }
}

export function formatOrderTypes(orderTypes?: DiscountOrderType[]): string {
  if (!orderTypes?.length) return i18n.t('Agreement:Discounts:OrderTypes:Any');
  return orderTypes
    .map((type) => i18n.t(`Agreement:Discounts:OrderTypes:${type}`, { defaultValue: type }))
    .join(', ');
}

export function formatSource(source?: string | null): string {
  return source ?? EM_DASH;
}

import { i18n } from '../../../i18n/translations';

import type { Discount, DiscountOrderType } from '../../shared/model';
import { EM_DASH } from '../../utils/date';
import { formatCurrency } from '../../utils/price';

export function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : EM_DASH;
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

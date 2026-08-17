import { i18n } from "../../../../../i18n/translations";
import { EM_DASH } from "../../../../utils/date";
import { formatCurrency } from "../../../../utils/price";

import { parseItemList } from "./discountDraft";

import type { DiscountDraft } from "./discountDraft";

/** Renders the amount the way the discounts grid does, from the draft's raw fields. */
export function formatReviewValue(draft: DiscountDraft): string {
  const amount = Number(draft.value);
  if (!draft.value || Number.isNaN(amount)) return EM_DASH;
  switch (draft.discountType) {
    case "PERCENTAGE":
      return i18n.t("Agreement:Discounts:PercentageOff", { value: amount });
    case "FIXED_DISCOUNT":
      return i18n.t("Agreement:Discounts:AmountOff", {
        amount: formatCurrency(amount, draft.currency),
      });
    default:
      return formatCurrency(amount, draft.currency);
  }
}

/** Normalizes the raw CSV back into the comma-separated form the design shows. */
export function formatReviewItems(raw: string): string {
  const items = parseItemList(raw);
  return items.length > 0 ? items.join(", ") : EM_DASH;
}

export function formatReviewOrderTypes(draft: DiscountDraft): string {
  const selection = draft.applicableOrderTypes;
  if (selection.length === 0) return EM_DASH;
  return selection
    .map((entry) => i18n.t(`Agreement:Discounts:Wizard:OrderTypes:${entry}`))
    .join(", ");
}

export function formatReviewCategory(draft: DiscountDraft): string {
  return draft.category
    ? i18n.t(`Agreement:Discounts:Wizard:Categories:${draft.category}`)
    : EM_DASH;
}

export function formatReviewDiscountType(draft: DiscountDraft): string {
  return draft.discountType
    ? i18n.t(`Agreement:Discounts:Wizard:DiscountTypes:${draft.discountType}`)
    : EM_DASH;
}

import { i18n } from "../../../../../i18n/translations";

import { parseItemList } from "./discountDraft";

import type { DiscountDraft } from "./discountDraft";

export const EM_DASH = "—";

/** `2026-06-01T00:00:00Z` becomes `01 JUN 2026`, matching the design. */
export function formatReviewDate(value: string): string {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

function formatCurrency(amount: number, currency: string): string {
  if (!currency) return String(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

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

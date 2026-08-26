import type { Discount, DiscountOrderType, DiscountType } from "../../../../shared/model";

export type DiscountCategory = "STANDARD" | "INTRO";

/**
 * UI-only sentinel for the "Any" order type. The API encodes "applies to any
 * order type" as an empty `applicableOrderTypes` list, which is also how an
 * untouched draft looks, so the wizard needs a value that tells them apart.
 */
export const ANY_ORDER_TYPE = "ANY";

export type OrderTypeSelection = DiscountOrderType | typeof ANY_ORDER_TYPE;

/**
 * The wizard draft.
 *
 * Every field is kept as the raw value the control produces so a half-filled
 * form is always representable; coercion to the wire types happens once, in
 * {@link toCreatePayload}. `value` is a string because an `<input type="number">`
 * yields `""` while the user is typing, and the two item lists are raw text
 * because splitting a CSV on every keystroke would fight the caret.
 */
export interface DiscountDraft {
  code: string;
  name: string;
  description: string;
  category: DiscountCategory | "";
  discountType: DiscountType | "";
  value: string;
  currency: string;
  startDate: string;
  endDate: string;
  reusable: boolean;
  discountLockEndDate: string;
  targetItems: string;
  prerequisiteItems: string;
  /** `[]` means nothing has been chosen yet; `["ANY"]` is the any-order-type option. */
  applicableOrderTypes: OrderTypeSelection[];
  supportsAnnual: boolean;
  supportsThreeYc: boolean;
}

export const EMPTY_DRAFT: DiscountDraft = {
  code: "",
  name: "",
  description: "",
  category: "",
  discountType: "PERCENTAGE",
  value: "",
  currency: "",
  startDate: "",
  endDate: "",
  reusable: false,
  discountLockEndDate: "",
  targetItems: "",
  prerequisiteItems: "",
  applicableOrderTypes: [],
  supportsAnnual: false,
  supportsThreeYc: false,
};

/** Split a comma or newline separated part-number list, dropping blank entries. */
export function parseItemList(raw: string): string[] {
  return raw
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface DiscountCreatePayload {
  code: string;
  name: string;
  description?: string;
  category: DiscountCategory;
  discountType: DiscountType;
  value: number;
  currency?: string;
  startDate: string;
  endDate: string;
  reusable: boolean;
  discountLockEndDate?: string;
  targetOfferIds: string[];
  qualifyingOfferIds: string[];
  applicableOrderTypes: DiscountOrderType[];
  supportsAnnual: boolean;
  supports3yc: boolean;
}

/**
 * Payload for `PATCH /api/v2/discount-codes/{id}`. Same shape as create minus
 * the immutable `code`.
 */
export type DiscountUpdatePayload = Omit<DiscountCreatePayload, "code">;

/** Wire mapping shared by create and update payload builders. */
function toDiscountPayloadBody(draft: DiscountDraft): DiscountUpdatePayload {
  const payload: DiscountUpdatePayload = {
    name: draft.name.trim(),
    category: (draft.category || "STANDARD") as DiscountCategory,
    discountType: (draft.discountType || "PERCENTAGE") as DiscountType,
    value: Number(draft.value),
    startDate: draft.startDate,
    endDate: draft.endDate,
    reusable: draft.reusable,
    targetOfferIds: parseItemList(draft.targetItems),
    qualifyingOfferIds: parseItemList(draft.prerequisiteItems),
    // "Any" is the empty list on the wire; the sentinel never leaves the wizard.
    applicableOrderTypes: draft.applicableOrderTypes.includes(ANY_ORDER_TYPE)
      ? []
      : (draft.applicableOrderTypes as DiscountOrderType[]),
    supportsAnnual: draft.supportsAnnual,
    supports3yc: draft.supportsThreeYc,
  };

  const description = draft.description.trim();
  if (description) {
    payload.description = description;
  }
  // Server only needs currency for non-percentage types; otherwise it falls back to the authorization currency.
  if (draft.discountType !== "PERCENTAGE" && draft.currency) {
    payload.currency = draft.currency;
  }
  if (draft.reusable && draft.discountLockEndDate) {
    payload.discountLockEndDate = draft.discountLockEndDate;
  }

  return payload;
}

/** Serialize the draft into the `POST /api/v2/discount-codes` body. */
export function toCreatePayload(draft: DiscountDraft): DiscountCreatePayload {
  return {
    code: draft.code.trim(),
    ...toDiscountPayloadBody(draft),
  };
}

/** Serialize the draft into the `PATCH /api/v2/discount-codes/{id}` body (no `code`, it's immutable). */
export function toUpdatePayload(draft: DiscountDraft): DiscountUpdatePayload {
  return toDiscountPayloadBody(draft);
}

/**
 * Initialize a draft from a current discount for the edit wizard.
 */
export function toDraft(discount: Discount, agreementCurrency: string): DiscountDraft {
  const valueEntry =
    discount.values?.find((entry) => entry.currency === agreementCurrency) ??
    discount.values?.[0];
  const applicable = discount.applicableOrderTypes ?? [];
  return {
    code: discount.code ?? "",
    name: discount.name ?? "",
    description: discount.description ?? "",
    category: (discount.category as DiscountCategory | "") ?? "",
    discountType: (discount.discountType as DiscountType | "") ?? "PERCENTAGE",
    value: valueEntry?.value != null ? String(valueEntry.value) : "",
    currency: valueEntry?.currency ?? agreementCurrency ?? "",
    startDate: discount.startDate ?? "",
    endDate: discount.endDate ?? "",
    reusable: discount.reusable ?? false,
    discountLockEndDate: discount.discountLockEndDate ?? "",
    targetItems: (discount.targetOfferIds ?? []).join(", "),
    prerequisiteItems: (discount.qualifyingOfferIds ?? []).join(", "),
    applicableOrderTypes: applicable.length === 0 ? [ANY_ORDER_TYPE] : applicable,
    supportsAnnual: discount.supportsAnnual ?? false,
    supportsThreeYc: discount.supports3yc ?? false,
  };
}

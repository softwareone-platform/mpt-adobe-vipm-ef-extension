import type { DiscountOrderType, DiscountType } from "../../../../shared/model";

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
 * Serialize the draft into the `POST /api/v2/discount-codes` body.
 *
 * Three wire names differ from the draft on purpose, matching the backend
 * aliases: the amount is sent as `value`, the 3YC flag as `supports3yc`, and
 * `discountLockEndDate` is omitted entirely unless the code is reusable — the
 * server rejects the pair `reusable: false` + a lock date.
 */
export function toCreatePayload(draft: DiscountDraft): DiscountCreatePayload {
  const payload: DiscountCreatePayload = {
    code: draft.code.trim(),
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
  // The server only requires a currency for non-percentage types and falls back
  // to the agreement's authorization currency when it is absent.
  if (draft.discountType !== "PERCENTAGE" && draft.currency) {
    payload.currency = draft.currency;
  }
  if (draft.reusable && draft.discountLockEndDate) {
    payload.discountLockEndDate = draft.discountLockEndDate;
  }

  return payload;
}

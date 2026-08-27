import { i18n } from "../../../../../i18n/translations";

import { ANY_ORDER_TYPE, parseItemList } from "./discountDraft";

import type { DiscountDraft } from "./discountDraft";

/** Mirrors MIN_LENGTH/MAX_LENGTH in backend/mpt_adobe_vipm_ef/constants.py. */
export const MAX_TEXT_LENGTH = 255;

const PERCENTAGE_MIN = 1;
const PERCENTAGE_MAX = 100;

export type DiscountField =
  | "code"
  | "name"
  | "category"
  | "discountType"
  | "value"
  | "startDate"
  | "endDate"
  | "discountLockEndDate"
  | "targetItems"
  | "prerequisiteItems"
  | "applicableOrderTypes"
  | "currency";

export type DiscountFieldErrors = Partial<Record<DiscountField, string>>;

function firstMessage(
  errors: DiscountFieldErrors,
  order: readonly DiscountField[],
): string | null {
  for (const field of order) {
    const message = errors[field];
    if (message) {
      return message;
    }
  }
  return null;
}

function codeError(draft: DiscountDraft): string | undefined {
  const code = draft.code.trim();
  if (!code) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:CodeRequired");
  }
  if (code.length > MAX_TEXT_LENGTH) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:CodeTooLong", {
      max: MAX_TEXT_LENGTH,
    });
  }
  return undefined;
}

function nameError(draft: DiscountDraft): string | undefined {
  const name = draft.name.trim();
  if (!name) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:NameRequired");
  }
  if (name.length > MAX_TEXT_LENGTH) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:NameTooLong", {
      max: MAX_TEXT_LENGTH,
    });
  }
  return undefined;
}

function categoryError(draft: DiscountDraft): string | undefined {
  return draft.category
    ? undefined
    : i18n.t("Agreement:Discounts:Wizard:Validation:CategoryRequired");
}

function discountTypeError(draft: DiscountDraft): string | undefined {
  return draft.discountType
    ? undefined
    : i18n.t("Agreement:Discounts:Wizard:Validation:DiscountTypeRequired");
}

function valueError(draft: DiscountDraft): string | undefined {
  const raw = draft.value.trim();
  if (!raw) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:ValueRequired");
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:ValuePositive");
  }
  // The server applies the 1-100 bound only to percentage discounts.
  if (
    draft.discountType === "PERCENTAGE" &&
    (value < PERCENTAGE_MIN || value > PERCENTAGE_MAX)
  ) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:PercentageRange");
  }
  return undefined;
}

const DEFINITION_ORDER = [
  "code",
  "name",
  "category",
  "discountType",
  "value",
] as const satisfies readonly DiscountField[];

export function validateDefinitionFields(draft: DiscountDraft): DiscountFieldErrors {
  const errors: DiscountFieldErrors = {};
  const assign = (field: DiscountField, message: string | undefined) => {
    if (message) {
      errors[field] = message;
    }
  };

  assign("code", codeError(draft));
  assign("name", nameError(draft));
  assign("category", categoryError(draft));
  assign("discountType", discountTypeError(draft));
  assign("value", valueError(draft));

  return errors;
}

/**
 * Validate the Definition step, returning the first failure or null.
 *
 * The rules mirror `DiscountCodeCreateRequest` in
 * backend/mpt_adobe_vipm_ef/models/discount.py so the wizard rejects what the
 * API would reject anyway, without waiting for a round trip.
 */
export function validateDefinition(draft: DiscountDraft): string | null {
  return firstMessage(validateDefinitionFields(draft), DEFINITION_ORDER);
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/u;

/**
 * Whether the value is a date the comparisons below can trust.
 *
 * `new Date` yields an invalid date for unparseable text, which compares false
 * both ways, and rolls an impossible day over into the next month, so only the
 * picker's shape is accepted and the day is checked against a UTC date built
 * from its parts. Nothing else is trusted: "02/30/2026" parses as March too,
 * and a local-time value would shift a day under `toISOString`.
 */
function isValidDate(value: string): boolean {
  const parts = CALENDAR_DAY.exec(value);
  const parsed = new Date(value);

  if (!parts || Number.isNaN(parsed.getTime())) {
    return false;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);

  const asUtc = new Date(Date.UTC(year, month - 1, day));

  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

function dateInvalid(): string {
  return i18n.t("Agreement:Discounts:Wizard:Validation:DateInvalid");
}

const VALIDITY_ORDER = [
  "startDate",
  "endDate",
  "discountLockEndDate",
] as const satisfies readonly DiscountField[];

export function validateValidityFields(draft: DiscountDraft): DiscountFieldErrors {
  const errors: DiscountFieldErrors = {};

  if (!draft.startDate) {
    errors.startDate = i18n.t("Agreement:Discounts:Wizard:Validation:StartDateRequired");
  } else if (!isValidDate(draft.startDate)) {
    errors.startDate = dateInvalid();
  }

  if (!draft.endDate) {
    errors.endDate = i18n.t("Agreement:Discounts:Wizard:Validation:EndDateRequired");
  } else if (!isValidDate(draft.endDate)) {
    errors.endDate = dateInvalid();
  }

  if (
    !errors.startDate &&
    !errors.endDate &&
    new Date(draft.startDate) >= new Date(draft.endDate)
  ) {
    errors.endDate = i18n.t("Agreement:Discounts:Wizard:Validation:EndDateAfterStart");
  }

  // A lock date is meaningless for a single-use code. The serializer drops any
  // stale value, so a date left over from an unticked box is not an error.
  if (draft.reusable) {
    if (!draft.discountLockEndDate) {
      errors.discountLockEndDate = i18n.t(
        "Agreement:Discounts:Wizard:Validation:LockDateRequired",
      );
    } else if (!isValidDate(draft.discountLockEndDate)) {
      errors.discountLockEndDate = dateInvalid();
    } else if (
      !errors.endDate &&
      new Date(draft.discountLockEndDate) <= new Date(draft.endDate)
    ) {
      errors.discountLockEndDate = i18n.t(
        "Agreement:Discounts:Wizard:Validation:LockDateAfterEnd",
      );
    }
  }

  return errors;
}

/** Validate the Validity step, mirroring `_validate_dates` and `_validate_reusability`. */
export function validateValidity(draft: DiscountDraft): string | null {
  return firstMessage(validateValidityFields(draft), VALIDITY_ORDER);
}

/** Adobe part numbers are alphanumeric; the server rejects blanks and spaces. */
const PART_NUMBER = /^[A-Za-z0-9]+$/u;

function itemFormatError(raw: string): string | undefined {
  const malformed = parseItemList(raw).filter((item) => !PART_NUMBER.test(item));
  if (malformed.length === 0) {
    return undefined;
  }
  return i18n.t("Agreement:Discounts:Wizard:Validation:ItemFormat", {
    items: malformed.join(", "),
  });
}

function orderTypesError(draft: DiscountDraft): string | undefined {
  const selection = draft.applicableOrderTypes;
  if (selection.length === 0) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:OrderTypesRequired");
  }
  if (selection.includes(ANY_ORDER_TYPE) && selection.length > 1) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:OrderTypesAnyExclusive");
  }
  // `_validate_category` rejects an INTRO code whose order types are anything
  // other than exactly ["NEW"], so catch it here rather than on submit.
  if (
    draft.category === "INTRO" &&
    (selection.length !== 1 || selection[0] !== "NEW")
  ) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:IntroOrderTypes");
  }
  return undefined;
}

const SCOPE_ORDER = [
  "targetItems",
  "prerequisiteItems",
  "applicableOrderTypes",
] as const satisfies readonly DiscountField[];

export function validateScopeFields(draft: DiscountDraft): DiscountFieldErrors {
  const errors: DiscountFieldErrors = {};

  if (parseItemList(draft.targetItems).length === 0) {
    errors.targetItems = i18n.t(
      "Agreement:Discounts:Wizard:Validation:TargetItemsRequired",
    );
  } else {
    const malformed = itemFormatError(draft.targetItems);
    if (malformed) {
      errors.targetItems = malformed;
    }
  }

  const malformedPrerequisites = itemFormatError(draft.prerequisiteItems);
  if (malformedPrerequisites) {
    errors.prerequisiteItems = malformedPrerequisites;
  }

  const orderTypes = orderTypesError(draft);
  if (orderTypes) {
    errors.applicableOrderTypes = orderTypes;
  }

  return errors;
}

/** Validate the Scope step, mirroring `_clean_offer_ids` and `_validate_category`. */
export function validateScope(draft: DiscountDraft): string | null {
  return firstMessage(validateScopeFields(draft), SCOPE_ORDER);
}

function currencyError(draft: DiscountDraft): string | undefined {
  // Percentage discounts carry no currency. For the fixed types the value row
  // needs one, so refuse to submit when the agreement did not supply it.
  if (draft.discountType === "PERCENTAGE" || draft.currency) {
    return undefined;
  }
  return i18n.t("Agreement:Discounts:Wizard:Validation:CurrencyRequired");
}

const REVIEW_ORDER = [
  ...DEFINITION_ORDER,
  ...VALIDITY_ORDER,
  ...SCOPE_ORDER,
  "currency",
] as const satisfies readonly DiscountField[];

export function validateReviewFields(draft: DiscountDraft): DiscountFieldErrors {
  const errors: DiscountFieldErrors = {
    ...validateDefinitionFields(draft),
    ...validateValidityFields(draft),
    ...validateScopeFields(draft),
  };

  const currency = currencyError(draft);
  if (currency) {
    errors.currency = currency;
  }

  return errors;
}

/**
 * Re-check every rule before the POST.
 *
 * The earlier steps gate their own fields, but a user can edit an earlier step
 * after passing a later one, so the Review step is the only place that sees the
 * whole draft at once.
 */
export function validateReview(draft: DiscountDraft): string | null {
  return firstMessage(validateReviewFields(draft), REVIEW_ORDER);
}

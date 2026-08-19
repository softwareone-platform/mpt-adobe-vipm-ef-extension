import { i18n } from "../../../../../i18n/translations";

import { ANY_ORDER_TYPE, parseItemList } from "./discountDraft";

import type { DiscountDraft } from "./discountDraft";

/** Mirrors MIN_LENGTH/MAX_LENGTH in backend/mpt_adobe_vipm_ef/constants.py. */
export const MAX_TEXT_LENGTH = 255;

const PERCENTAGE_MIN = 1;
const PERCENTAGE_MAX = 100;

function validateCode(draft: DiscountDraft): string | null {
  const code = draft.code.trim();
  if (!code) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:CodeRequired");
  }
  if (code.length > MAX_TEXT_LENGTH) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:CodeTooLong", {
      max: MAX_TEXT_LENGTH,
    });
  }
  return null;
}

function validateName(draft: DiscountDraft): string | null {
  const name = draft.name.trim();
  if (!name) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:NameRequired");
  }
  if (name.length > MAX_TEXT_LENGTH) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:NameTooLong", {
      max: MAX_TEXT_LENGTH,
    });
  }
  return null;
}

function validateCategory(draft: DiscountDraft): string | null {
  return draft.category
    ? null
    : i18n.t("Agreement:Discounts:Wizard:Validation:CategoryRequired");
}

function validateDiscountType(draft: DiscountDraft): string | null {
  return draft.discountType
    ? null
    : i18n.t("Agreement:Discounts:Wizard:Validation:DiscountTypeRequired");
}

function validateValue(draft: DiscountDraft): string | null {
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
  return null;
}

/**
 * Validate the Definition step, returning the first failure or null.
 *
 * The rules mirror `DiscountCodeCreateRequest` in
 * backend/mpt_adobe_vipm_ef/models/discount.py so the wizard rejects what the
 * API would reject anyway, without waiting for a round trip.
 */
export function validateDefinition(draft: DiscountDraft): string | null {
  return (
    validateCode(draft) ??
    validateName(draft) ??
    validateCategory(draft) ??
    validateDiscountType(draft) ??
    validateValue(draft)
  );
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

function validatePeriod(draft: DiscountDraft): string | null {
  if (!draft.startDate) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:StartDateRequired");
  }
  if (!draft.endDate) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:EndDateRequired");
  }
  if (!isValidDate(draft.startDate) || !isValidDate(draft.endDate)) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:DateInvalid");
  }
  if (new Date(draft.startDate) >= new Date(draft.endDate)) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:EndDateAfterStart");
  }
  return null;
}

function validateLockDate(draft: DiscountDraft): string | null {
  // A lock date is meaningless for a single-use code. The serializer drops any
  // stale value, so a date left over from an unticked box is not an error.
  if (!draft.reusable) {
    return null;
  }
  if (!draft.discountLockEndDate) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:LockDateRequired");
  }
  if (!isValidDate(draft.discountLockEndDate)) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:DateInvalid");
  }
  if (new Date(draft.discountLockEndDate) <= new Date(draft.endDate)) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:LockDateAfterEnd");
  }
  return null;
}

/** Validate the Validity step, mirroring `_validate_dates` and `_validate_reusability`. */
export function validateValidity(draft: DiscountDraft): string | null {
  return validatePeriod(draft) ?? validateLockDate(draft);
}

/** Adobe part numbers are alphanumeric; the server rejects blanks and spaces. */
const PART_NUMBER = /^[A-Za-z0-9]+$/u;

function invalidItems(raw: string): string[] {
  return parseItemList(raw).filter((item) => !PART_NUMBER.test(item));
}

function validateItems(draft: DiscountDraft): string | null {
  if (parseItemList(draft.targetItems).length === 0) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:TargetItemsRequired");
  }
  const malformed = [
    ...invalidItems(draft.targetItems),
    ...invalidItems(draft.prerequisiteItems),
  ];
  if (malformed.length > 0) {
    return i18n.t("Agreement:Discounts:Wizard:Validation:ItemFormat", {
      items: malformed.join(", "),
    });
  }
  return null;
}

function validateOrderTypes(draft: DiscountDraft): string | null {
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
  return null;
}

/** Validate the Scope step, mirroring `_clean_offer_ids` and `_validate_category`. */
export function validateScope(draft: DiscountDraft): string | null {
  return validateItems(draft) ?? validateOrderTypes(draft);
}

/**
 * Presence checks that gate the Next button.
 *
 * Deliberately weaker than the validators: they only ask whether the required
 * fields carry something, so the button can be disabled without a message.
 * The validators still run on Next for the rules a blank check cannot express
 * (percentage bounds, date ordering, INTRO order types), where the user needs
 * to be told what is wrong.
 */
export function isDefinitionComplete(draft: DiscountDraft): boolean {
  return Boolean(
    draft.code.trim() &&
    draft.name.trim() &&
    draft.category &&
    draft.discountType &&
    draft.value.trim(),
  );
}

export function isValidityComplete(draft: DiscountDraft): boolean {
  const hasPeriod = Boolean(draft.startDate && draft.endDate);
  return hasPeriod && (!draft.reusable || Boolean(draft.discountLockEndDate));
}

export function isScopeComplete(draft: DiscountDraft): boolean {
  return (
    parseItemList(draft.targetItems).length > 0 && draft.applicableOrderTypes.length > 0
  );
}

function validateCurrency(draft: DiscountDraft): string | null {
  // Percentage discounts carry no currency. For the fixed types the value row
  // needs one, so refuse to submit when the agreement did not supply it.
  if (draft.discountType === "PERCENTAGE" || draft.currency) {
    return null;
  }
  return i18n.t("Agreement:Discounts:Wizard:Validation:CurrencyRequired");
}

/**
 * Re-check every rule before the POST.
 *
 * The earlier steps gate their own fields, but a user can edit an earlier step
 * after passing a later one, so the Review step is the only place that sees the
 * whole draft at once.
 */
export function validateReview(draft: DiscountDraft): string | null {
  return (
    validateDefinition(draft) ??
    validateValidity(draft) ??
    validateScope(draft) ??
    validateCurrency(draft)
  );
}

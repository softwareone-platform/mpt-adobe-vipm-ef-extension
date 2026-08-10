import { ANY_ORDER_TYPE, EMPTY_DRAFT } from "./discountDraft";
import {
  EM_DASH,
  formatReviewCategory,
  formatReviewDate,
  formatReviewDiscountType,
  formatReviewItems,
  formatReviewOrderTypes,
  formatReviewValue,
} from "./reviewFormat";

import type { DiscountDraft } from "./discountDraft";

function draftWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
  return { ...EMPTY_DRAFT, ...overrides };
}

describe("formatReviewDate", () => {
  it.each([
    ["2026-06-01T00:00:00.000Z", "01 JUN 2026"],
    ["2026-10-01T00:00:00.000Z", "01 OCT 2026"],
    ["2027-03-01T00:00:00.000Z", "01 MAR 2027"],
  ])("renders %s as %s", (iso, expected) => {
    expect(formatReviewDate(iso)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["an unparseable value", "not-a-date"],
  ])("falls back to a dash for %s", (_label, value) => {
    expect(formatReviewDate(value)).toBe(EM_DASH);
  });
});

describe("formatReviewValue", () => {
  it("suffixes percentage discounts", () => {
    const result = formatReviewValue(draftWith({ discountType: "PERCENTAGE", value: "25" }));

    expect(result).toBe("25% off");
  });

  it("renders a fixed discount as an amount off", () => {
    const result = formatReviewValue(
      draftWith({ discountType: "FIXED_DISCOUNT", value: "20", currency: "USD" }),
    );

    expect(result).toContain("off");
    expect(result).toContain("20");
  });

  it("renders a fixed price as a bare amount", () => {
    const result = formatReviewValue(
      draftWith({ discountType: "FIXED_PRICE", value: "297.84", currency: "USD" }),
    );

    expect(result).toContain("297.84");
    expect(result).not.toContain("off");
  });

  it("falls back to a dash when no value was entered", () => {
    expect(formatReviewValue(draftWith({ value: "" }))).toBe(EM_DASH);
  });
});

describe("formatReviewItems", () => {
  it("normalizes separators into a comma separated list", () => {
    expect(formatReviewItems(" 30013593CB ,\n30013600CB ")).toBe("30013593CB, 30013600CB");
  });

  it("falls back to a dash when the list is empty", () => {
    expect(formatReviewItems("  ")).toBe(EM_DASH);
  });
});

describe("formatReviewOrderTypes", () => {
  it.each([
    ["the Any sentinel", [ANY_ORDER_TYPE], "Any"],
    ["a single type", ["NEW"], "Add seats"],
    ["several types", ["NEW", "RENEWAL"], "Add seats, Renewal"],
  ])("renders %s", (_label, applicableOrderTypes, expected) => {
    const result = formatReviewOrderTypes(
      draftWith({
        applicableOrderTypes: applicableOrderTypes as DiscountDraft["applicableOrderTypes"],
      }),
    );

    expect(result).toBe(expected);
  });

  it("falls back to a dash when nothing was chosen", () => {
    expect(formatReviewOrderTypes(draftWith({ applicableOrderTypes: [] }))).toBe(EM_DASH);
  });
});

describe("formatReviewCategory and formatReviewDiscountType", () => {
  it("renders the chosen labels", () => {
    const draft = draftWith({ category: "STANDARD", discountType: "PERCENTAGE" });

    expect(formatReviewCategory(draft)).toBe("Standard");
    expect(formatReviewDiscountType(draft)).toBe("Percentage discount");
  });

  it("falls back to a dash when the category is unset", () => {
    expect(formatReviewCategory(draftWith({ category: "" }))).toBe(EM_DASH);
  });
});

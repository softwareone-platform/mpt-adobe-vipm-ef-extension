import { ANY_ORDER_TYPE, EMPTY_DRAFT } from "./discountDraft";
import {
  MAX_TEXT_LENGTH,
  isDefinitionComplete,
  isScopeComplete,
  isValidityComplete,
  validateDefinition,
  validateReview,
  validateScope,
  validateValidity,
} from "./discountValidation";

import type { DiscountDraft } from "./discountDraft";

function draftWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
  return {
    ...EMPTY_DRAFT,
    code: "SUMMER25",
    name: "Summer 2025",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    value: "20",
    ...overrides,
  };
}

describe("validateDefinition", () => {
  it("accepts a fully populated definition", () => {
    const result = validateDefinition(draftWith());

    expect(result).toBeNull();
  });

  it.each([
    ["code", { code: "" }],
    ["code that is only whitespace", { code: "   " }],
    ["name", { name: "" }],
    ["category", { category: "" as const }],
    ["discount type", { discountType: "" as const }],
    ["value", { value: "" }],
  ])("rejects a missing %s", (_label, overrides) => {
    const result = validateDefinition(draftWith(overrides));

    expect(result).not.toBeNull();
  });

  it.each([
    ["code", { code: "a".repeat(MAX_TEXT_LENGTH + 1) }],
    ["name", { name: "a".repeat(MAX_TEXT_LENGTH + 1) }],
  ])("rejects a %s longer than the server limit", (_label, overrides) => {
    const result = validateDefinition(draftWith(overrides));

    expect(result).toContain(String(MAX_TEXT_LENGTH));
  });

  it.each([
    ["zero", "0"],
    ["negative", "-5"],
    ["non-numeric", "abc"],
  ])("rejects a %s value", (_label, value) => {
    const result = validateDefinition(draftWith({ value }));

    expect(result).toBe("The value must be greater than zero.");
  });

  it.each(["0.5", "101"])(
    "rejects the percentage %s because it falls outside 1-100",
    (value) => {
      const result = validateDefinition(draftWith({ discountType: "PERCENTAGE", value }));

      expect(result).toBe("A percentage value must be between 1 and 100.");
    },
  );

  it.each(["1", "100"])("accepts the percentage bound %s", (value) => {
    const result = validateDefinition(draftWith({ discountType: "PERCENTAGE", value }));

    expect(result).toBeNull();
  });

  it("applies the 1-100 bound only to percentage discounts", () => {
    const result = validateDefinition(
      draftWith({ discountType: "FIXED_PRICE", value: "297.84" }),
    );

    expect(result).toBeNull();
  });
});

describe("validateValidity", () => {
  const START = "2026-06-01T00:00:00.000Z";
  const END = "2026-08-31T00:00:00.000Z";
  const LOCK = "2026-12-31T00:00:00.000Z";

  function periodWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
    return { ...EMPTY_DRAFT, startDate: START, endDate: END, ...overrides };
  }

  it("accepts a single-use code with a well ordered period", () => {
    const result = validateValidity(periodWith());

    expect(result).toBeNull();
  });

  it.each([
    ["start date", { startDate: "" }],
    ["end date", { endDate: "" }],
    ["null start date", { startDate: null as unknown as string }],
    ["null end date", { endDate: null as unknown as string }],
  ])("rejects a missing %s", (_label, overrides) => {
    const result = validateValidity(periodWith(overrides));

    expect(result).not.toBeNull();
  });

  it.each([
    ["an impossible day", "2026-02-30"],
    ["a month overflow", "2026-13-01"],
    ["a US-style date", "06/31/2026"],
    ["a non-calendar date", "not-a-date"],
  ])("rejects a non-exact calendar date for %s", (_label, value) => {
    const result = validateValidity(periodWith({ startDate: value, endDate: "2026-08-31" }));

    expect(result).toBe("The dates must be real calendar dates.");
  });

  it.each([
    ["a precise ISO date", "2026-06-15"],
    ["a same-day timestamp", "2026-06-15T00:00:00.000Z"],
    ["a time-with-offset value", "2026-06-15T23:00:00-05:00"],
  ])("accepts a valid calendar date for %s", (_label, value) => {
    const result = validateValidity(periodWith({ startDate: value, endDate: "2026-08-31" }));

    expect(result).toBeNull();
  });

  it.each([
    ["the end date precedes the start date", { startDate: END, endDate: START }],
    ["both dates are equal", { startDate: START, endDate: START }],
  ])("rejects a period where %s", (_label, overrides) => {
    const result = validateValidity(periodWith(overrides));

    expect(result).toBe("The start date must be before the end date.");
  });

  it.each([
    ["an unparseable start date", { startDate: "not-a-date" }],
    ["an unparseable end date", { endDate: "not-a-date" }],
    ["a day the month does not have", { endDate: "2026-02-30" }],
    ["a day the month does not have on a full timestamp", { endDate: "2026-06-31T23:59:59Z" }],
    ["a US-style impossible day", { endDate: "06/31/2026" }],
    ["a textual impossible day", { endDate: "Jun 31, 2026" }],
    ["a day without its leading zero", { endDate: "2026-6-31" }],
  ])("rejects %s", (_label, overrides) => {
    const result = validateValidity(periodWith(overrides));

    expect(result).toBe("The dates must be real calendar dates.");
  });

  it("rejects an impossible lock date", () => {
    const result = validateValidity(
      periodWith({ reusable: true, discountLockEndDate: "2026-11-31" }),
    );

    expect(result).toBe("The dates must be real calendar dates.");
  });

  it("requires a lock date once the code is reusable", () => {
    const result = validateValidity(periodWith({ reusable: true, discountLockEndDate: "" }));

    expect(result).toBe("A discount lock end date is required for reusable discounts.");
  });

  it.each([
    ["equal to", END],
    ["before", START],
  ])("rejects a lock date %s the end date", (_label, discountLockEndDate) => {
    const result = validateValidity(periodWith({ reusable: true, discountLockEndDate }));

    expect(result).toBe("The discount lock end date must be after the end date.");
  });

  it("accepts a reusable code whose lock date follows the end date", () => {
    const result = validateValidity(periodWith({ reusable: true, discountLockEndDate: LOCK }));

    expect(result).toBeNull();
  });

  it("ignores a lock date carried over from unticking reusable", () => {
    const result = validateValidity(periodWith({ reusable: false, discountLockEndDate: START }));

    expect(result).toBeNull();
  });
});

describe("validateScope", () => {
  function scopeWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
    return {
      ...EMPTY_DRAFT,
      category: "STANDARD",
      targetItems: "30001846CB, 30006354CB",
      applicableOrderTypes: ["RENEWAL"],
      ...overrides,
    };
  }

  it("accepts target items with a specific order type", () => {
    const result = validateScope(scopeWith());

    expect(result).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["only separators", " , \n "],
  ])("rejects a target list that is %s", (_label, targetItems) => {
    const result = validateScope(scopeWith({ targetItems }));

    expect(result).toBe("At least one target item is required.");
  });

  it("accepts an empty prerequisite list", () => {
    const result = validateScope(scopeWith({ prerequisiteItems: "" }));

    expect(result).toBeNull();
  });

  it.each([
    ["a space inside the part number", "3000 1846CB"],
    ["a punctuation character", "30001846-CB"],
  ])("rejects a target item with %s", (_label, targetItems) => {
    const result = validateScope(scopeWith({ targetItems }));

    expect(result).toContain("Adobe part numbers without spaces");
  });

  it("reports malformed prerequisite items too", () => {
    const result = validateScope(scopeWith({ prerequisiteItems: "30013112CB, bad id" }));

    expect(result).toContain("bad id");
  });

  it("requires at least one order type", () => {
    const result = validateScope(scopeWith({ applicableOrderTypes: [] }));

    expect(result).toBe("At least one applicable order type is required.");
  });

  it("accepts Any on its own", () => {
    const result = validateScope(scopeWith({ applicableOrderTypes: [ANY_ORDER_TYPE] }));

    expect(result).toBeNull();
  });

  it("rejects Any combined with a specific order type", () => {
    const result = validateScope(
      scopeWith({ applicableOrderTypes: [ANY_ORDER_TYPE, "NEW"] }),
    );

    expect(result).toBe('"Any" cannot be combined with specific order types.');
  });

  it("accepts several specific order types together", () => {
    const result = validateScope(scopeWith({ applicableOrderTypes: ["NEW", "RENEWAL"] }));

    expect(result).toBeNull();
  });

  it("accepts an INTRO discount limited to Add seats", () => {
    const result = validateScope(
      scopeWith({ category: "INTRO", applicableOrderTypes: ["NEW"] }),
    );

    expect(result).toBeNull();
  });

  it.each([
    ["Any", [ANY_ORDER_TYPE]],
    ["Renewal", ["RENEWAL"]],
    ["Add seats plus Renewal", ["NEW", "RENEWAL"]],
  ])("rejects an INTRO discount scoped to %s", (_label, applicableOrderTypes) => {
    const result = validateScope(
      scopeWith({
        category: "INTRO",
        applicableOrderTypes: applicableOrderTypes as DiscountDraft["applicableOrderTypes"],
      }),
    );

    expect(result).toBe("Intro discounts apply to Add seats orders only.");
  });
});

describe("validateReview", () => {
  function completeDraft(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
    return {
      ...EMPTY_DRAFT,
      code: "SUMMER25",
      name: "Summer 2025",
      category: "STANDARD",
      discountType: "PERCENTAGE",
      value: "20",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-08-31T00:00:00.000Z",
      targetItems: "30001846CB",
      applicableOrderTypes: ["RENEWAL"],
      ...overrides,
    };
  }

  it("accepts a draft that satisfies every step", () => {
    expect(validateReview(completeDraft())).toBeNull();
  });

  it.each([
    ["Definition", { code: "" }, "A code is required."],
    ["Validity", { startDate: "" }, "A start date is required."],
    ["Scope", { targetItems: "" }, "At least one target item is required."],
  ])("re-runs the %s rules", (_label, overrides, message) => {
    expect(validateReview(completeDraft(overrides))).toBe(message);
  });

  it("catches an INTRO discount that was scoped outside Add seats", () => {
    const result = validateReview(
      completeDraft({ category: "INTRO", applicableOrderTypes: ["RENEWAL"] }),
    );

    expect(result).toBe("Intro discounts apply to Add seats orders only.");
  });

  it.each(["FIXED_DISCOUNT", "FIXED_PRICE"])(
    "requires a customer currency for %s discounts",
    (discountType) => {
      const result = validateReview(
        completeDraft({
          discountType: discountType as DiscountDraft["discountType"],
          currency: "",
        }),
      );

      expect(result).toBe(
        "A customer currency is required for fixed amount and fixed price discounts.",
      );
    },
  );

  it.each(["FIXED_DISCOUNT", "FIXED_PRICE"])(
    "accepts %s discounts once the currency is known",
    (discountType) => {
      const result = validateReview(
        completeDraft({
          discountType: discountType as DiscountDraft["discountType"],
          currency: "USD",
        }),
      );

      expect(result).toBeNull();
    },
  );

  it("never asks for a currency on percentage discounts", () => {
    const result = validateReview(completeDraft({ discountType: "PERCENTAGE", currency: "" }));

    expect(result).toBeNull();
  });
});

describe("step completeness gates", () => {
  const FILLED: DiscountDraft = {
    ...EMPTY_DRAFT,
    code: "SUMMER25",
    name: "Summer 2025",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    value: "20",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2026-08-31T00:00:00.000Z",
    targetItems: "30001846CB",
    applicableOrderTypes: ["RENEWAL"],
  };

  describe("isDefinitionComplete", () => {
    it("accepts every required field filled", () => {
      expect(isDefinitionComplete(FILLED)).toBe(true);
    });

    it.each([
      ["code", { code: "" }],
      ["whitespace-only code", { code: "  " }],
      ["name", { name: "" }],
      ["category", { category: "" as const }],
      ["discount type", { discountType: "" as const }],
      ["value", { value: "" }],
    ])("rejects a missing %s", (_label, overrides) => {
      expect(isDefinitionComplete({ ...FILLED, ...overrides })).toBe(false);
    });

    it("stays true for a value the validator would still reject", () => {
      // The gate only asks for presence; the range check happens on Next.
      expect(isDefinitionComplete({ ...FILLED, value: "999" })).toBe(true);
    });
  });

  describe("isValidityComplete", () => {
    it("accepts a single-use code with both dates", () => {
      expect(isValidityComplete(FILLED)).toBe(true);
    });

    it.each([
      ["start date", { startDate: "" }],
      ["end date", { endDate: "" }],
    ])("rejects a missing %s", (_label, overrides) => {
      expect(isValidityComplete({ ...FILLED, ...overrides })).toBe(false);
    });

    it("demands a lock date once the code is reusable", () => {
      expect(isValidityComplete({ ...FILLED, reusable: true })).toBe(false);
      expect(
        isValidityComplete({
          ...FILLED,
          reusable: true,
          discountLockEndDate: "2026-12-31T00:00:00.000Z",
        }),
      ).toBe(true);
    });
  });

  describe("isScopeComplete", () => {
    it("accepts target items with an order type", () => {
      expect(isScopeComplete(FILLED)).toBe(true);
    });

    it.each([
      ["no target items", { targetItems: "" }],
      ["only separators as target items", { targetItems: " , \n " }],
      ["no order type", { applicableOrderTypes: [] }],
    ])("rejects %s", (_label, overrides) => {
      expect(isScopeComplete({ ...FILLED, ...overrides })).toBe(false);
    });

    it("stays true for a scope the validator would still reject", () => {
      expect(
        isScopeComplete({ ...FILLED, category: "INTRO", applicableOrderTypes: ["RENEWAL"] }),
      ).toBe(true);
    });
  });
});

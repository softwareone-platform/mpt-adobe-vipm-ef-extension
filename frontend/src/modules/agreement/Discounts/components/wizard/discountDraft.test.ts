import { ANY_ORDER_TYPE, EMPTY_DRAFT, toCreatePayload } from "./discountDraft";

import type { DiscountDraft } from "./discountDraft";

function draftWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
  return {
    ...EMPTY_DRAFT,
    code: "SUMMER25",
    name: "Summer 2025",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    value: "20",
    startDate: "2026-06-01T00:00:00Z",
    endDate: "2026-08-31T23:59:59Z",
    targetItems: "65322651CA02A12",
    applicableOrderTypes: ["RENEWAL"],
    ...overrides,
  };
}

describe("toCreatePayload", () => {
  it("sends the amount under the server's `value` alias, as a number", () => {
    const payload = toCreatePayload(draftWith({ value: "20" }));

    expect(payload.value).toBe(20);
    expect(payload).not.toHaveProperty("amount");
  });

  it("sends the 3YC flag under the server's `supports3yc` alias", () => {
    const payload = toCreatePayload(draftWith({ supportsThreeYc: true }));

    expect(payload.supports3yc).toBe(true);
    expect(payload).not.toHaveProperty("supportsThreeYc");
  });

  it("always includes applicableOrderTypes, since an empty list means any", () => {
    const payload = toCreatePayload(draftWith({ applicableOrderTypes: [] }));

    expect(payload.applicableOrderTypes).toEqual([]);
    expect("applicableOrderTypes" in payload).toBe(true);
  });

  it("maps the Any sentinel to the empty list the API expects", () => {
    const payload = toCreatePayload(draftWith({ applicableOrderTypes: [ANY_ORDER_TYPE] }));

    expect(payload.applicableOrderTypes).toEqual([]);
  });

  it("passes specific order types through unchanged", () => {
    const payload = toCreatePayload(
      draftWith({ applicableOrderTypes: ["NEW", "RENEWAL"] }),
    );

    expect(payload.applicableOrderTypes).toEqual(["NEW", "RENEWAL"]);
  });

  it("splits the item lists on commas and newlines, trimming each entry", () => {
    const payload = toCreatePayload(
      draftWith({
        targetItems: " 30001846CB , 30006354CB \n 30013112CB ",
        prerequisiteItems: "30007371CB,30015486CB",
      }),
    );

    expect(payload.targetOfferIds).toEqual(["30001846CB", "30006354CB", "30013112CB"]);
    expect(payload.qualifyingOfferIds).toEqual(["30007371CB", "30015486CB"]);
  });

  it("drops blank entries left by trailing separators", () => {
    const payload = toCreatePayload(draftWith({ targetItems: "30001846CB, , \n" }));

    expect(payload.targetOfferIds).toEqual(["30001846CB"]);
  });

  it("sends an empty qualifying list when no prerequisite items were entered", () => {
    const payload = toCreatePayload(draftWith({ prerequisiteItems: "" }));

    expect(payload.qualifyingOfferIds).toEqual([]);
  });

  it("carries the supported term flags", () => {
    const payload = toCreatePayload(
      draftWith({ supportsAnnual: true, supportsThreeYc: true }),
    );

    expect(payload.supportsAnnual).toBe(true);
    expect(payload.supports3yc).toBe(true);
  });

  it("trims the free-text fields", () => {
    const payload = toCreatePayload(
      draftWith({ code: "  SUMMER25  ", name: "  Summer 2025  ", description: "  Note  " }),
    );

    expect(payload.code).toBe("SUMMER25");
    expect(payload.name).toBe("Summer 2025");
    expect(payload.description).toBe("Note");
  });

  it("omits a blank description rather than sending an empty string", () => {
    const payload = toCreatePayload(draftWith({ description: "   " }));

    expect(payload).not.toHaveProperty("description");
  });

  it("omits the currency for percentage discounts", () => {
    const payload = toCreatePayload(
      draftWith({ discountType: "PERCENTAGE", currency: "USD" }),
    );

    expect(payload).not.toHaveProperty("currency");
  });

  it("sends the currency for fixed discounts", () => {
    const payload = toCreatePayload(
      draftWith({ discountType: "FIXED_PRICE", currency: "USD" }),
    );

    expect(payload.currency).toBe("USD");
  });

  it("drops a stale lock date when the code is no longer reusable", () => {
    const payload = toCreatePayload(
      draftWith({ reusable: false, discountLockEndDate: "2026-12-31T00:00:00Z" }),
    );

    expect(payload).not.toHaveProperty("discountLockEndDate");
  });

  it("sends the lock date for reusable codes", () => {
    const payload = toCreatePayload(
      draftWith({ reusable: true, discountLockEndDate: "2026-12-31T00:00:00Z" }),
    );

    expect(payload.discountLockEndDate).toBe("2026-12-31T00:00:00Z");
  });
});

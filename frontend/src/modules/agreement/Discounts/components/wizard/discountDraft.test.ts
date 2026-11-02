import { ANY_ORDER_TYPE, EMPTY_DRAFT, toCreatePayload, toDraft, toUpdatePayload } from "./discountDraft";

import type { Discount } from "../../../../shared/model";
import type { DiscountDraft } from "./discountDraft";

function draftWith(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
  return {
    ...EMPTY_DRAFT,
    code: "DUMMYCODE123",
    name: "Dummy Discount draft",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    value: "8",
    startDate: "2026-01-01",
    endDate: "2027-10-31",
    targetItems: "ITEM-001",
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
      draftWith({ code: "  DUMMYCODE123  ", name: "  Dummy Discount  ", description: "  Note  " }),
    );

    expect(payload.code).toBe("DUMMYCODE123");
    expect(payload.name).toBe("Dummy Discount");
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
      draftWith({ reusable: false, discountLockEndDate: "2026-12-31" }),
    );

    expect(payload).not.toHaveProperty("discountLockEndDate");
  });

  it("sends the lock date for reusable codes", () => {
    const payload = toCreatePayload(
      draftWith({ reusable: true, discountLockEndDate: "2026-12-31" }),
    );

    expect(payload.discountLockEndDate).toBe("2026-12-31");
  });
});

describe("toDraft", () => {
  const stored: Discount = {
    id: "recDUMMY",
    code: "DUMMYCODE123",
    name: "Dummy Discount",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    startDate: "2026-10-29",
    endDate: "2026-12-30",
    reusable: true,
    discountLockEndDate: "2027-06-29",
    targetOfferIds: ["65304578CA"],
    applicableOrderTypes: ["RENEWAL"],
    values: [{ currency: "USD", value: 20 }],
  };

  it("seeds the stored days into the draft", () => {
    const draft = toDraft(stored, "USD");

    expect([draft.startDate, draft.endDate, draft.discountLockEndDate]).toEqual([
      "2026-10-29",
      "2026-12-30",
      "2027-06-29",
    ]);
  });

  it("keeps only the day of a stored timestamp", () => {
    const draft = toDraft(
      { ...stored, startDate: "2026-10-29T00:00:00+00:00", endDate: "2026-12-30T00:00:00.000Z" },
      "USD",
    );

    expect([draft.startDate, draft.endDate]).toEqual(["2026-10-29", "2026-12-30"]);
  });

  it("sends the same days back on a save with no change", () => {
    const payload = toUpdatePayload(toDraft(stored, "USD"));

    expect([payload.startDate, payload.endDate, payload.discountLockEndDate]).toEqual([
      "2026-10-29",
      "2026-12-30",
      "2027-06-29",
    ]);
  });
});

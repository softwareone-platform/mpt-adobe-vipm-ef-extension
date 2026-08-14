import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ANY_ORDER_TYPE, EMPTY_DRAFT } from "../../discountDraft";
import { SummaryStep } from "./SummaryStep";

import type { DiscountDraft } from "../../discountDraft";

jest.mock("@softwareone-platform/sdk-react-ui-v0/icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const CREATED_DRAFT: DiscountDraft = {
  ...EMPTY_DRAFT,
  code: "DUMMYCODE1234567890",
  name: "Dummy Discount Name",
  category: "STANDARD",
  discountType: "PERCENTAGE",
  value: "25",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-04-01T00:00:00.000Z",
  reusable: true,
  discountLockEndDate: "2026-07-01T00:00:00.000Z",
  targetItems: "ITEM-001, ITEM-002",
  prerequisiteItems: "ITEM-003",
  applicableOrderTypes: [ANY_ORDER_TYPE],
  supportsAnnual: true,
  supportsThreeYc: false,
};

function renderStep(overrides: Partial<DiscountDraft> = {}) {
  render(<SummaryStep draft={{ ...CREATED_DRAFT, ...overrides }} />);
}

describe("SummaryStep", () => {
  it("confirms the discount was created", () => {
    renderStep();

    expect(
      screen.getByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The customer's closed discount has been created and can be used in future orders.",
      ),
    ).toBeInTheDocument();
  });

  it("recaps the same three sections as the review", () => {
    renderStep();

    for (const section of ["Definition", "Validity", "Scope"]) {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    }
  });

  it("shows the saved values", () => {
    renderStep();

    expect(screen.getByText("DUMMYCODE1234567890")).toBeInTheDocument();
    expect(screen.getByText("25% off")).toBeInTheDocument();
    expect(screen.getByText("01 JAN 2026")).toBeInTheDocument();
    expect(screen.getByText("ITEM-001, ITEM-002")).toBeInTheDocument();
    expect(screen.getByText("Any")).toBeInTheDocument();
  });

  it("marks the ticked flags with a Yes and the unticked ones with a No", () => {
    renderStep();

    expect(screen.getAllByText("Yes")).toHaveLength(2);
    expect(screen.getAllByText("No")).toHaveLength(1);
  });

  it("does not offer any way back into the form", () => {
    renderStep();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

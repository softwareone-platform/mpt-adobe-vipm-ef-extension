import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ANY_ORDER_TYPE, EMPTY_DRAFT } from "../../discountDraft";
import { ScopeStep } from "./ScopeStep";

import type { StepNavigationProperties } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { DiscountDraft } from "../../discountDraft";

type OnNext = (props: StepNavigationProperties) => Promise<number>;

let capturedOnNext: OnNext | undefined;
const registerOnNextCallback = jest.fn((callback: OnNext) => {
  capturedOnNext = callback;
  return () => undefined;
});

jest.mock("@softwareone-platform/sdk-react-ui-v0/wizard", () => ({
  useStepActions: () => ({ registerOnNextCallback }),
}));

jest.mock("@softwareone-platform/sdk-react-ui-v0/notification", () => ({
  InlineNotification: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="validation-error">{children}</div>
  ),
}));

jest.mock("@softwareone-platform/sdk-react-ui-v0/checkbox", () =>
  jest
    .requireActual<typeof import("../../../../../../shared/testing/sdkUiMocks")>(
      "../../../../../../shared/testing/sdkUiMocks",
    )
    .createCheckboxMock(),
);

const NAVIGATION: StepNavigationProperties = {
  currentStepIndex: 2,
  targetStepIndex: 3,
} as unknown as StepNavigationProperties;

function renderStep(overrides: Partial<DiscountDraft> = {}) {
  const updateDraft = jest.fn();
  const draft: DiscountDraft = {
    ...EMPTY_DRAFT,
    category: "STANDARD",
    targetItems: "30001846CB, 30006354CB",
    applicableOrderTypes: ["RENEWAL"],
    ...overrides,
  };

  render(
    <ScopeStep
      draft={draft}
      updateDraft={updateDraft}
      customerId="1005847693"
      segment="Commercial"
    />,
  );

  return { draft, updateDraft };
}

async function runNext(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!(NAVIGATION);
  });
  return target;
}

function openOrderTypes() {
  fireEvent.click(screen.getByTestId("order-types-control"));
}

function pickOrderType(value: string) {
  const row = screen.getByTestId(`order-type-${value}`).closest("li")!;
  fireEvent.mouseDown(row);
  fireEvent.click(row);
}

describe("ScopeStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNext = undefined;
  });

  it("renders the item lists with their helper copy", () => {
    renderStep();

    expect(screen.getByText("Target items")).toBeInTheDocument();
    expect(
      screen.getByText("Items the customer can purchase with this discount."),
    ).toBeInTheDocument();
    expect(screen.getByText("Prerequisite items")).toBeInTheDocument();
    expect(
      screen.getByText("Items the customer must already own to use this discount."),
    ).toBeInTheDocument();
  });

  it.each([
    ["discount-target-items", "targetItems"],
    ["discount-prerequisite-items", "prerequisiteItems"],
  ])("writes the %s textarea into the draft", (testId, field) => {
    const { updateDraft } = renderStep();

    fireEvent.change(screen.getByTestId(testId).querySelector("textarea")!, {
      target: { value: "30001846CB" },
    });

    expect(updateDraft).toHaveBeenCalledWith({ [field]: "30001846CB" });
  });

  it.each([
    ["discount-supports-annual", "supportsAnnual"],
    ["discount-supports-3yc", "supportsThreeYc"],
  ])("toggles the %s term", (testId, field) => {
    const { updateDraft } = renderStep();

    fireEvent.click(screen.getByTestId(testId));

    expect(updateDraft).toHaveBeenCalledWith({ [field]: true });
  });

  it("shows the placeholder until an order type is chosen", () => {
    renderStep({ applicableOrderTypes: [] });

    expect(screen.getByText("Select an option")).toBeInTheDocument();
  });

  it("lists the selected order types on the control", () => {
    renderStep({ applicableOrderTypes: ["NEW", "RENEWAL"] });

    expect(screen.getByText("Add seats, Renewal")).toBeInTheDocument();
  });

  it("adds a specific order type to the selection", () => {
    const { updateDraft } = renderStep({ applicableOrderTypes: ["NEW"] });

    openOrderTypes();
    pickOrderType("RENEWAL");

    expect(updateDraft).toHaveBeenCalledWith({ applicableOrderTypes: ["NEW", "RENEWAL"] });
  });

  it("removes an order type that was already selected", () => {
    const { updateDraft } = renderStep({ applicableOrderTypes: ["NEW", "RENEWAL"] });

    openOrderTypes();
    pickOrderType("NEW");

    expect(updateDraft).toHaveBeenCalledWith({ applicableOrderTypes: ["RENEWAL"] });
  });

  it("clears the specific types when Any is picked", () => {
    const { updateDraft } = renderStep({ applicableOrderTypes: ["NEW", "RENEWAL"] });

    openOrderTypes();
    pickOrderType(ANY_ORDER_TYPE);

    expect(updateDraft).toHaveBeenCalledWith({ applicableOrderTypes: [ANY_ORDER_TYPE] });
  });

  it("drops Any when a specific type is picked afterwards", () => {
    const { updateDraft } = renderStep({ applicableOrderTypes: [ANY_ORDER_TYPE] });

    openOrderTypes();
    pickOrderType("NEW");

    expect(updateDraft).toHaveBeenCalledWith({ applicableOrderTypes: ["NEW"] });
  });

  it("updates the draft once per pointer interaction", () => {
    const { updateDraft } = renderStep({ applicableOrderTypes: ["NEW"] });

    openOrderTypes();
    pickOrderType("RENEWAL");

    expect(updateDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps the list open while several boxes are ticked", () => {
    renderStep({ applicableOrderTypes: [] });

    openOrderTypes();
    pickOrderType("NEW");

    expect(screen.getByTestId("order-type-RENEWAL")).toBeInTheDocument();
  });

  it.each([
    ["no target items", { targetItems: "" }, "At least one target item is required."],
    [
      "a malformed part number",
      { targetItems: "30001846-CB" },
      "Adobe part numbers without spaces",
    ],
    [
      "no order type",
      { applicableOrderTypes: [] },
      "At least one applicable order type is required.",
    ],
    [
      "an INTRO discount outside Add seats",
      { category: "INTRO" as const, applicableOrderTypes: ["RENEWAL" as const] },
      "Intro discounts apply to Add seats orders only.",
    ],
  ])("blocks navigation on %s", async (_label, overrides, message) => {
    renderStep(overrides);

    const target = await runNext();

    expect(target).toBe(NAVIGATION.currentStepIndex);
    expect(await screen.findByTestId("validation-error")).toHaveTextContent(message);
  });

  it("advances with a valid scope", async () => {
    renderStep();

    const target = await runNext();

    expect(target).toBe(NAVIGATION.targetStepIndex);
  });
});

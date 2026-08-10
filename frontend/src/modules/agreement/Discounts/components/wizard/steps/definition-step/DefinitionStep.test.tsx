import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { EMPTY_DRAFT } from "../../discountDraft";
import { DefinitionStep } from "./DefinitionStep";

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

const NAVIGATION: StepNavigationProperties = {
  currentStepIndex: 0,
  targetStepIndex: 1,
  steps: [],
} as unknown as StepNavigationProperties;

function renderStep(overrides: Partial<DiscountDraft> = {}) {
  const updateDraft = jest.fn();
  const draft: DiscountDraft = {
    ...EMPTY_DRAFT,
    code: "SUMMER25",
    name: "Summer 2025",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    value: "20",
    ...overrides,
  };

  const view = render(
    <DefinitionStep
      draft={draft}
      updateDraft={updateDraft}
      customerId="1005847693"
      segment="Commercial"
    />,
  );

  return { ...view, draft, updateDraft };
}

// The gate sets the error state, so the call has to run inside act.
async function runNext(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!(NAVIGATION);
  });
  return target;
}

describe("DefinitionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNext = undefined;
  });

  it("names the customer and segment the code will be saved against", () => {
    renderStep();

    expect(
      screen.getByText(
        "Enter the details of the customer's closed discount. This code will be saved for customer, 1005847693, and segment, Commercial.",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["discount-code", "code"],
    ["discount-name", "name"],
    ["discount-description", "description"],
  ])("writes the %s input into the draft", (testId, field) => {
    const { updateDraft } = renderStep();

    fireEvent.change(screen.getByTestId(testId).querySelector("input, textarea")!, {
      target: { value: "typed" },
    });

    expect(updateDraft).toHaveBeenCalledWith({ [field]: "typed" });
  });

  it("blocks navigation and shows the error when the code is missing", async () => {
    renderStep({ code: "" });

    const target = await runNext();

    expect(target).toBe(NAVIGATION.currentStepIndex);
    expect(await screen.findByTestId("validation-error")).toHaveTextContent(
      "A code is required.",
    );
  });

  it("blocks navigation when the percentage falls outside 1-100", async () => {
    renderStep({ discountType: "PERCENTAGE", value: "150" });

    const target = await runNext();

    expect(target).toBe(NAVIGATION.currentStepIndex);
  });

  it("advances when the definition is complete", async () => {
    renderStep();

    const target = await runNext();

    expect(target).toBe(NAVIGATION.targetStepIndex);
    expect(screen.queryByTestId("validation-error")).not.toBeInTheDocument();
  });
});

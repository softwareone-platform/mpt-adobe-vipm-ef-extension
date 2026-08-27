import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { EMPTY_DRAFT } from "../../discountDraft";
import { ValidityStep } from "./ValidityStep";

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

jest.mock("@softwareone-platform/sdk-react-ui-v0/date-picker", () =>
  jest
    .requireActual<typeof import("../../../../../../shared/testing/sdkUiMocks")>(
      "../../../../../../shared/testing/sdkUiMocks",
    )
    .createDatePickerMock(),
);

jest.mock("@softwareone-platform/sdk-react-ui-v0/checkbox", () =>
  jest
    .requireActual<typeof import("../../../../../../shared/testing/sdkUiMocks")>(
      "../../../../../../shared/testing/sdkUiMocks",
    )
    .createCheckboxMock(),
);

const NAVIGATION: StepNavigationProperties = {
  currentStepIndex: 1,
  targetStepIndex: 2,
} as unknown as StepNavigationProperties;

const START = "2026-06-01T00:00:00.000Z";
const END = "2026-08-31T00:00:00.000Z";
const LOCK = "2026-12-31T00:00:00.000Z";

function renderStep(overrides: Partial<DiscountDraft> = {}) {
  const updateDraft = jest.fn();
  const draft: DiscountDraft = {
    ...EMPTY_DRAFT,
    startDate: START,
    endDate: END,
    ...overrides,
  };

  render(
    <ValidityStep
      draft={draft}
      updateDraft={updateDraft}
      customerId="1005847693"
      segment="Commercial"
    />,
  );

  return { draft, updateDraft };
}

// The gate sets the error state, so the call has to run inside act.
async function runNext(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!(NAVIGATION);
  });
  return target;
}

describe("ValidityStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNext = undefined;
  });

  it("renders the validity period and reuse controls", () => {
    renderStep();

    expect(screen.getByText("Validity period")).toBeInTheDocument();
    expect(screen.getByText("Reusable")).toBeInTheDocument();
    expect(screen.getByText("Discount lock end date")).toBeInTheDocument();
  });

  it.each([
    ["discount-start-date", "startDate"],
    ["discount-end-date", "endDate"],
  ])("writes the %s picker into the draft", (testId, field) => {
    const { updateDraft } = renderStep();

    fireEvent.change(screen.getByTestId(testId), { target: { value: LOCK } });

    expect(updateDraft).toHaveBeenCalledWith({ [field]: LOCK });
  });

  it("starts with reusable off and the period empty on a fresh draft", () => {
    render(
      <ValidityStep
        draft={EMPTY_DRAFT}
        updateDraft={jest.fn()}
        customerId="1005847693"
        segment="Commercial"
      />,
    );

    expect(screen.getByTestId("discount-reusable")).not.toBeChecked();
    expect(screen.getByTestId("discount-start-date")).toHaveValue("");
    expect(screen.getByTestId("discount-end-date")).toHaveValue("");
    expect(screen.getByTestId("discount-lock-end-date")).toBeDisabled();
  });

  it("toggles reusable from the checkbox", () => {
    const { updateDraft } = renderStep({ reusable: false });

    fireEvent.click(screen.getByTestId("discount-reusable"));

    expect(updateDraft).toHaveBeenCalledWith({ reusable: true });
  });

  it("turns reusable back off from the checkbox", () => {
    const { updateDraft } = renderStep({ reusable: true });

    fireEvent.click(screen.getByTestId("discount-reusable"));

    expect(updateDraft).toHaveBeenCalledWith({ reusable: false });
  });

  it("disables the lock date until the code is marked reusable", () => {
    renderStep({ reusable: false });

    expect(screen.getByTestId("discount-lock-end-date")).toBeDisabled();
  });

  it("enables the lock date for reusable codes", () => {
    renderStep({ reusable: true });

    expect(screen.getByTestId("discount-lock-end-date")).toBeEnabled();
  });

  it.each([
    ["a missing start date", { startDate: "" }, "A start date is required."],
    ["a missing end date", { endDate: "" }, "An end date is required."],
    [
      "an end date before the start date",
      { startDate: END, endDate: START },
      "The start date must be before the end date.",
    ],
    [
      "a reusable code with no lock date",
      { reusable: true, discountLockEndDate: "" },
      "A discount lock end date is required for reusable discounts.",
    ],
    [
      "a lock date that is not after the end date",
      { reusable: true, discountLockEndDate: END },
      "The discount lock end date must be after the end date.",
    ],
  ])("blocks navigation on %s", async (_label, overrides, message) => {
    renderStep(overrides);

    const target = await runNext();

    expect(target).toBe(NAVIGATION.currentStepIndex);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it.each([
    ["the end date", { startDate: END, endDate: START }, "discount-end-date"],
    [
      "the lock date",
      { reusable: true, discountLockEndDate: END },
      "discount-lock-end-date",
    ],
  ])("hangs the ordering message off %s", async (_label, overrides, testId) => {
    renderStep(overrides);

    await runNext();

    expect(await screen.findByTestId(`${testId}__error`)).toHaveTextContent("must be");
  });

  it("clears the ordering message when the other date is the one edited", async () => {
    renderStep({ startDate: END, endDate: START });
    await runNext();
    expect(await screen.findByTestId("discount-end-date__error")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("discount-start-date"), {
      target: { value: "2026-01-01" },
    });

    expect(screen.queryByTestId("discount-end-date__error")).not.toBeInTheDocument();
  });

  it("drops the lock date message when the code stops being reusable", async () => {
    renderStep({ reusable: true, discountLockEndDate: "" });
    await runNext();
    const message = "A discount lock end date is required for reusable discounts.";
    expect(await screen.findByText(message)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("discount-reusable"));

    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("advances with a valid single-use period", async () => {
    renderStep();

    const target = await runNext();

    expect(target).toBe(NAVIGATION.targetStepIndex);
  });

  it("advances with a valid reusable period", async () => {
    renderStep({ reusable: true, discountLockEndDate: LOCK });

    const target = await runNext();

    expect(target).toBe(NAVIGATION.targetStepIndex);
  });

  it("ignores a lock date left over from unticking reusable", async () => {
    renderStep({ reusable: false, discountLockEndDate: START });

    const target = await runNext();

    expect(target).toBe(NAVIGATION.targetStepIndex);
  });
});

import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ANY_ORDER_TYPE, EMPTY_DRAFT } from "../../discountDraft";
import { ReviewStep } from "./ReviewStep";

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
    <div data-testid="submit-error">{children}</div>
  ),
}));

jest.mock("@softwareone-platform/sdk-react-ui-v0/icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const NAVIGATION: StepNavigationProperties = {
  currentStepIndex: 3,
  targetStepIndex: 4,
} as unknown as StepNavigationProperties;

const FULL_DRAFT: DiscountDraft = {
  ...EMPTY_DRAFT,
  code: "DUMMYCODE1234567890",
  name: "Dummy Discount Name",
  category: "STANDARD",
  discountType: "PERCENTAGE",
  value: "15",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2028-03-01T00:00:00.000Z",
  reusable: true,
  discountLockEndDate: "2026-07-01T00:00:00.000Z",
  targetItems: "ITEM-001, ITEM-002",
  prerequisiteItems: "ITEM-003",
  applicableOrderTypes: [ANY_ORDER_TYPE],
  supportsAnnual: true,
  supportsThreeYc: false,
};

function renderStep(
  overrides: Partial<DiscountDraft> = {},
  props: { onSubmit?: () => Promise<boolean>; errorMessage?: string } = {},
) {
  const onSubmit = props.onSubmit ?? jest.fn().mockResolvedValue(true);

  render(
    <ReviewStep
      draft={{ ...FULL_DRAFT, ...overrides }}
      customerId="1005847693"
      segment="Commercial"
      onSubmit={onSubmit}
      errorMessage={props.errorMessage ?? ""}
    />,
  );

  return { onSubmit };
}

async function runNext(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!(NAVIGATION);
  });
  return target;
}

describe("ReviewStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNext = undefined;
  });

  it("groups the summary under the three earlier steps", () => {
    renderStep();

    for (const section of ["Definition", "Validity", "Scope"]) {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    }
  });

  it("summarizes the definition fields", () => {
    renderStep();

    expect(screen.getByText("DUMMYCODE1234567890")).toBeInTheDocument();
    expect(screen.getByText("Dummy Discount Name")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Percentage discount")).toBeInTheDocument();
    expect(screen.getByText("25% off")).toBeInTheDocument();
  });

  it("summarizes the validity fields with the design's date format", () => {
    renderStep();

    expect(screen.getByText("01 JAN 2026")).toBeInTheDocument();
    expect(screen.getByText("01 APR 2026")).toBeInTheDocument();
    expect(screen.getByText("01 JUL 2026")).toBeInTheDocument();
  });

  it("hides the lock date for a single-use code", () => {
    renderStep({ reusable: false });

    expect(
      screen.queryByText("Discount lock end date"),
    ).not.toBeInTheDocument();
  });

  it("summarizes the scope fields", () => {
    renderStep();

    expect(screen.getByText("ITEM-001, ITEM-002")).toBeInTheDocument();
    expect(screen.getByText("ITEM-003")).toBeInTheDocument();
    expect(screen.getByText("Any")).toBeInTheDocument();
  });

  it("marks the ticked flags with a Yes and the unticked ones with a No", () => {
    renderStep();

    // Reusable and Annual plan are on; 3-year commitment is off.
    expect(screen.getAllByText("Yes")).toHaveLength(2);
    expect(screen.getAllByText("No")).toHaveLength(1);
    expect(screen.getAllByTestId("icon-done")).toHaveLength(2);
    expect(screen.getAllByTestId("icon-close")).toHaveLength(1);
  });

  it("shows the submit error passed down by the container", () => {
    renderStep({}, { errorMessage: "Duplicate code." });

    expect(screen.getByTestId("submit-error")).toHaveTextContent(
      "Duplicate code.",
    );
  });

  it("advances to the summary when the submit succeeds", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    renderStep({}, { onSubmit });

    const target = await runNext();

    expect(onSubmit).toHaveBeenCalled();
    expect(target).toBe(NAVIGATION.targetStepIndex);
  });

  it("stays on the review when the submit fails", async () => {
    const onSubmit = jest.fn().mockResolvedValue(false);
    renderStep({}, { onSubmit });

    const target = await runNext();

    expect(target).toBe(NAVIGATION.currentStepIndex);
  });
});

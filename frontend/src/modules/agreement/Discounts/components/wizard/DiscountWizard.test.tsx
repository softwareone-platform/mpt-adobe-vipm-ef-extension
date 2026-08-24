import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { DiscountWizard } from "./DiscountWizard";
import {
  DISCOUNT_SCREEN_HEIGHT_FACTOR,
  DISCOUNT_SCREEN_WIDTH_FACTOR,
  SCREEN_WIDTH_FACTOR,
} from "../../../../shared/constants";

import type { DiscountWizardStep } from "./DiscountWizard";

jest.mock("@softwareone-platform/sdk-react-ui-v0/wizard", () =>
  jest
    .requireActual<typeof import("../../../../shared/testing/sdkUiMocks")>(
      "../../../../shared/testing/sdkUiMocks",
    )
    .createWizardMock(),
);

const STEPS: DiscountWizardStep[] = [
  { title: "Definition", render: () => <p>definition body</p> },
  { title: "Validity", render: () => <p>validity body</p> },
  { title: "Scope", render: () => <p>scope body</p> },
  { title: "Review", render: () => <p>review body</p> },
  { title: "Summary", render: () => <p>summary body</p> },
];

const SCREEN_KEYS = ["availWidth", "availHeight"] as const;
const originalScreen = SCREEN_KEYS.map((key) =>
  Object.getOwnPropertyDescriptor(window.screen, key),
);

function setScreen(availWidth: number, availHeight: number): void {
  Object.defineProperty(window.screen, "availWidth", { value: availWidth, configurable: true });
  Object.defineProperty(window.screen, "availHeight", { value: availHeight, configurable: true });
}

afterEach(() => {
  SCREEN_KEYS.forEach((key, index) => {
    const descriptor = originalScreen[index];
    if (descriptor) {
      Object.defineProperty(window.screen, key, descriptor);
    } else {
      Reflect.deleteProperty(window.screen, key);
    }
  });
});

function renderWizard(overrides: Partial<Parameters<typeof DiscountWizard>[0]> = {}) {
  const props = {
    title: "Add closed discount",
    steps: STEPS,
    activeStepIndex: 0,
    onActiveStepIndexChange: jest.fn(),
    onClose: jest.fn(),
    onFinish: jest.fn(),
    ...overrides,
  };
  render(<DiscountWizard {...props} />);
  return props;
}

describe("DiscountWizard", () => {
  it("renders the banner title", () => {
    renderWizard();

    expect(screen.getByRole("heading", { name: "Add closed discount" })).toBeInTheDocument();
  });

  it("renders every step in the side rail, in order", () => {
    renderWizard();

    const rail = screen.getByTestId("wizard-steps");
    expect(rail).toHaveTextContent("DefinitionValidityScopeReviewSummary");
  });

  it("renders only the active step body", () => {
    renderWizard();

    expect(screen.getByText("definition body")).toBeInTheDocument();
    expect(screen.queryByText("validity body")).not.toBeInTheDocument();
  });

  it("invokes onClose when the wizard closes", () => {
    const props = renderWizard();

    fireEvent.click(screen.getByTestId("wizard-close"));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("accepts a different title and step set, so the edit flow can reuse it", () => {
    renderWizard({
      title: "Edit discount",
      steps: [{ title: "Only step", render: () => <p>edit body</p> }],
    });

    expect(screen.getByRole("heading", { name: "Edit discount" })).toBeInTheDocument();
    expect(screen.getByTestId("wizard-steps")).toHaveTextContent("Only step");
    expect(screen.getByText("edit body")).toBeInTheDocument();
  });

  it("sizes itself from the discount factors, not the wizard ones", () => {
    setScreen(1000, 1000);

    const { container } = render(
      <DiscountWizard
        title="Add closed discount"
        steps={STEPS}
        activeStepIndex={0}
        onActiveStepIndexChange={jest.fn()}
        onClose={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    const modal = container.querySelector(".discount-wizard") as HTMLElement;
    expect(modal.style.width).toBe(`${Math.round(1000 * DISCOUNT_SCREEN_WIDTH_FACTOR)}px`);
    expect(modal.style.height).toBe(`${Math.round(1000 * DISCOUNT_SCREEN_HEIGHT_FACTOR)}px`);
    expect(DISCOUNT_SCREEN_WIDTH_FACTOR).not.toBe(SCREEN_WIDTH_FACTOR);
  });
});

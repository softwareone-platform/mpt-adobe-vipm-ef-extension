import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { DiscountWizard } from "./DiscountWizard";

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
});

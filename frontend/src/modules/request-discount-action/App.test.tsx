import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { http } from "@mpt-extension/sdk";
import { useMPTContext } from "@mpt-extension/sdk-react";

import App from "./App";

import type { DiscountWizardProps } from "../agreement/Discounts/components/wizard/DiscountWizard";

const mockClose = jest.fn();

jest.mock(
  "@mpt-extension/sdk-react",
  () => ({
    useMPTContext: jest.fn(),
    useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  }),
  { virtual: true },
);

jest.mock(
  "@mpt-extension/sdk",
  () => ({
    http: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
  }),
  { virtual: true },
);

let capturedOnNext: ((props: never) => Promise<number>) | undefined;

jest.mock("@softwareone-platform/sdk-react-ui-v0/wizard", () => ({
  useStepActions: () => ({
    registerOnNextCallback: (callback: (props: never) => Promise<number>) => {
      capturedOnNext = callback;
      return () => undefined;
    },
  }),
}));

// Stands in for the wizard chrome: captures the props the container hands over
// and renders whichever step the container says is active.
let capturedProps: DiscountWizardProps | undefined;

jest.mock("../agreement/Discounts/components/wizard/DiscountWizard", () => ({
  DiscountWizard: (props: DiscountWizardProps) => {
    capturedProps = props;
    return (
      <div data-testid="wizard">
        <h1>{props.title}</h1>
        <ul data-testid="wizard-steps">
          {props.steps.map((step) => (
            <li key={step.title}>{step.title}</li>
          ))}
        </ul>
        {props.steps[props.activeStepIndex]?.render()}
      </div>
    );
  },
}));

const PRODUCT_ID = "PRD-1111-1111";
const mockGet = jest.mocked(http.get);
const mockPost = jest.mocked(http.post);
const mockPut = jest.mocked(http.put);
const mockUseMPTContext = jest.mocked(useMPTContext);

function mockBackend(segment = "COM") {
  mockGet.mockImplementation((url: string) => {
    if (url === "/api/v2/settings") {
      return Promise.resolve({
        data: { data: { products: [{ id: PRODUCT_ID, segment }] } },
      });
    }
    return Promise.resolve({ data: { data: { customerId: "1005847693" } } });
  });
}

function mockAccount(type: string) {
  mockUseMPTContext.mockReturnValue({
    auth: { account: { type } },
    data: {
      agreement: {
        id: "AGR-0000-0000-0000",
        product: { id: PRODUCT_ID },
        price: { currency: "USD" },
      },
      discount: { mode: 'create' },
    },
  });
}

/** The active step registers its gate here, so the test can drive Next. */
async function runStepGate(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!({
      currentStepIndex: 3,
      targetStepIndex: 4,
    } as never);
  });
  return target;
}

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

function codeInput() {
  return screen.getByTestId("discount-code").querySelector("input")!;
}

async function goToStep(index: number) {
  await act(async () => {
    capturedProps!.onActiveStepIndexChange(index);
  });
}

describe("request-discount-action App", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = undefined;
    mockBackend();
    mockAccount("Operations");
  });

  it("titles the wizard with the create header", async () => {
    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Add closed discount" }),
    ).toBeInTheDocument();
  });

  it("declares the five design steps in order", async () => {
    await renderApp();

    expect(screen.getByTestId("wizard-steps")).toHaveTextContent(
      "DefinitionValidityScopeReviewSummary",
    );
  });

  it("names the customer and segment resolved from the agreement", async () => {
    await renderApp();

    expect(
      screen.getByText(/customer, 1005847693, and segment, Commercial/u),
    ).toBeInTheDocument();
  });

  it("falls back to the raw code for a segment with no display name", async () => {
    mockBackend("XYZ");

    await renderApp();

    expect(
      screen.getByText(/customer, 1005847693, and segment, XYZ/u),
    ).toBeInTheDocument();
  });

  it("keeps what the user typed when navigating away from a step and back", async () => {
    await renderApp();

    fireEvent.change(codeInput(), { target: { value: "SUMMER25" } });
    expect(codeInput()).toHaveValue("SUMMER25");

    await goToStep(2);
    expect(screen.queryByTestId("discount-code")).not.toBeInTheDocument();

    await goToStep(0);

    expect(codeInput()).toHaveValue("SUMMER25");
  });

  it("discards the draft when the modal is reopened", async () => {
    await renderApp();
    fireEvent.change(codeInput(), { target: { value: "SUMMER25" } });

    // Reopening mounts a fresh plug, which is what the portal does on close.
    await renderApp();

    const mounted = screen.getAllByTestId("discount-code");
    expect(mounted[mounted.length - 1].querySelector("input")).toHaveValue("");
  });

  it("closes the modal without saving when the wizard finishes", async () => {
    await renderApp();

    await act(async () => {
      await capturedProps!.onFinish();
    });

    expect(mockClose).toHaveBeenCalled();
  });

  it("labels the review action Add discount instead of Next", async () => {
    await renderApp();

    expect(capturedProps!.steps[3].nextButton?.label).toBe("Add discount");
  });

  it("labels the summary action View discounts", async () => {
    await renderApp();

    expect(capturedProps!.steps[4].nextButton?.label).toBe("View discounts");
  });

  it("refuses to POST while the draft is still incomplete", async () => {
    await renderApp();
    await goToStep(3);

    const target = await runStepGate();

    expect(target).toBe(3);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("renders nothing for client accounts", async () => {
    mockAccount("Client");

    await renderApp();

    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
  });
});

describe("request-discount-action App (edit mode)", () => {
  function mockEditAccount(type: string) {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type } },
      data: {
        agreement: {
          id: "AGR-0000-0000-0000",
          product: { id: PRODUCT_ID },
          price: { currency: "USD" },
        },
        discount: { mode: "edit", id: "DSC-0001" },
      },
    });
  }

  const SAMPLE_DISCOUNT = {
    id: "DSC-0001",
    code: "SUMMER25",
    name: "Summer 2025 promo",
    description: "Half off summer skus",
    category: "STANDARD",
    discountType: "PERCENTAGE",
    values: [{ currency: "USD", value: 25 }],
    startDate: "2026-06-01T00:00:00Z",
    endDate: "2026-08-31T23:59:59Z",
    reusable: false,
    targetOfferIds: ["ITEM-001"],
    qualifyingOfferIds: ["ITEM-001"],
    applicableOrderTypes: ["RENEWAL"],
    supportsAnnual: false,
    supports3yc: false,
  };

  function mockEditBackend(
    discount: Record<string, unknown> = SAMPLE_DISCOUNT,
  ) {
    mockGet.mockImplementation((url: string) => {
      if (url === "/api/v2/settings") {
        return Promise.resolve({
          data: { data: { products: [{ id: PRODUCT_ID, segment: "COM" }] } },
        });
      }
      if (url.startsWith("/api/v2/discount-codes/")) {
        return Promise.resolve({ data: { data: discount } });
      }
      return Promise.resolve({ data: { data: { customerId: "1005847693" } } });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = undefined;
    mockEditBackend();
    mockEditAccount("Operations");
  });

  it("titles the wizard with the edit header", async () => {
    await renderApp();

    expect(
      screen.getByRole("heading", { name: "Edit closed discount" }),
    ).toBeInTheDocument();
  });

  it("declares only the three data-entry steps", async () => {
    await renderApp();

    // Scope is the last step: its Next button is the wizard's Save action and
    // the PATCH is wired through the container's onFinish.
    expect(screen.getByTestId("wizard-steps")).toHaveTextContent(
      "DefinitionValidityScope",
    );
    expect(screen.getByTestId("wizard-steps")).not.toHaveTextContent("Review");
    expect(screen.getByTestId("wizard-steps")).not.toHaveTextContent("Summary");
  });

  it("saves and closes from the first step instead of advancing", async () => {
    // Part numbers are alphanumeric, so the shared fixture's "ITEM-001" would
    // fail scope validation before the PATCH is reached.
    const valid = {
      ...SAMPLE_DISCOUNT,
      targetOfferIds: ["65322651CA02A12"],
      qualifyingOfferIds: ["65322651CA02A12"],
    };
    mockEditBackend(valid);
    mockPut.mockResolvedValue({ data: { data: valid } });
    await renderApp();
    await waitFor(() => expect(codeInput()).toHaveValue(SAMPLE_DISCOUNT.code));

    let target: number | undefined;
    await act(async () => {
      target = (await capturedProps!.steps[0].nextButton!.onAction!({
        currentStepIndex: 0,
        targetStepIndex: 1,
        steps: [],
      })) as number;
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v2/discount-codes/DSC-0001",
      expect.any(Object),
      expect.any(Object),
    );
    // -1 keeps the wizard where it is rather than stepping to Validity.
    expect(target).toBe(-1);
    expect(mockClose).toHaveBeenCalledWith(
      expect.objectContaining({ updated: expect.any(Object) }),
    );
  });

  it("locks the code, which the API refuses to change on update", async () => {
    await renderApp();

    await waitFor(() => expect(codeInput()).toHaveValue(SAMPLE_DISCOUNT.code));
    expect(codeInput()).toBeDisabled();
  });

  it("prefills the definition inputs with the fetched discount", async () => {
    await renderApp();

    await waitFor(() => expect(codeInput()).toHaveValue(SAMPLE_DISCOUNT.code));
    expect(
      screen.getByTestId("discount-name").querySelector("input"),
    ).toHaveValue(SAMPLE_DISCOUNT.name);
    expect(
      screen.getByTestId("discount-value").querySelector("input"),
    ).toHaveValue(SAMPLE_DISCOUNT.values[0].value);
    expect(mockGet).toHaveBeenCalledWith(
      "/api/v2/discount-codes/DSC-0001",
      expect.any(Object),
    );
  });
});

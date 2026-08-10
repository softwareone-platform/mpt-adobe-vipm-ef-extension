import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { http } from '@mpt-extension/sdk';
import { useMPTContext } from '@mpt-extension/sdk-react';

import App from './App';

import type { DiscountWizardProps } from '../agreement/Discounts/components/wizard/DiscountWizard';

const mockClose = jest.fn();

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
}), { virtual: true });

jest.mock('@mpt-extension/sdk', () => ({
  http: { get: jest.fn(), post: jest.fn() },
}), { virtual: true });

let capturedOnNext: ((props: never) => Promise<number>) | undefined;

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
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

jest.mock('../agreement/Discounts/components/wizard/DiscountWizard', () => ({
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

const PRODUCT_ID = 'PRD-1111-1111';
const mockGet = jest.mocked(http.get);
const mockPost = jest.mocked(http.post);
const mockUseMPTContext = jest.mocked(useMPTContext);

function mockBackend() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v2/settings') {
      return Promise.resolve({
        data: { data: { products: [{ id: PRODUCT_ID, segment: 'COM' }] } },
      });
    }
    return Promise.resolve({ data: { data: { customerId: '1005847693' } } });
  });
}

function mockAccount(type: string) {
  mockUseMPTContext.mockReturnValue({
    auth: { account: { type } },
    data: {
      agreement: {
        id: 'AGR-0000-0000-0000',
        product: { id: PRODUCT_ID },
        price: { currency: 'USD' },
      },
    },
    discount: { mode: 'create' },
  });
}

/** The active step registers its gate here, so the test can drive Next. */
async function runStepGate(): Promise<number> {
  let target = -1;
  await act(async () => {
    target = await capturedOnNext!({ currentStepIndex: 3, targetStepIndex: 4 } as never);
  });
  return target;
}

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

function codeInput() {
  return screen.getByTestId('discount-code').querySelector('input')!;
}

async function goToStep(index: number) {
  await act(async () => {
    capturedProps!.onActiveStepIndexChange(index);
  });
}

describe('request-discount-action App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = undefined;
    mockBackend();
    mockAccount('Operations');
  });

  it('titles the wizard with the create header', async () => {
    await renderApp();

    expect(screen.getByRole('heading', { name: 'Add closed discount' })).toBeInTheDocument();
  });

  it('declares the five design steps in order', async () => {
    await renderApp();

    expect(screen.getByTestId('wizard-steps')).toHaveTextContent(
      'DefinitionValidityScopeReviewSummary',
    );
  });

  it('names the customer and segment resolved from the agreement', async () => {
    await renderApp();

    expect(screen.getByText(/customer, 1005847693, and segment, COM/u)).toBeInTheDocument();
  });

  it('keeps what the user typed when navigating away from a step and back', async () => {
    await renderApp();

    fireEvent.change(codeInput(), { target: { value: 'SUMMER25' } });
    expect(codeInput()).toHaveValue('SUMMER25');

    await goToStep(2);
    expect(screen.queryByTestId('discount-code')).not.toBeInTheDocument();

    await goToStep(0);

    expect(codeInput()).toHaveValue('SUMMER25');
  });

  it('discards the draft when the modal is reopened', async () => {
    await renderApp();
    fireEvent.change(codeInput(), { target: { value: 'SUMMER25' } });

    // Reopening mounts a fresh plug, which is what the portal does on close.
    await renderApp();

    const mounted = screen.getAllByTestId('discount-code');
    expect(mounted[mounted.length - 1].querySelector('input')).toHaveValue('');
  });

  it('closes the modal without saving when the wizard finishes', async () => {
    await renderApp();

    act(() => capturedProps!.onFinish());

    expect(mockClose).toHaveBeenCalled();
  });

  it('labels the review action Add discount instead of Next', async () => {
    await renderApp();

    expect(capturedProps!.steps[3].nextButton?.label).toBe('Add discount');
  });

  it('labels the summary action View discounts', async () => {
    await renderApp();

    expect(capturedProps!.steps[4].nextButton?.label).toBe('View discounts');
  });

  it('disables the form steps while their required fields are empty', async () => {
    await renderApp();

    // A fresh draft cannot advance past any of the three form steps.
    expect(capturedProps!.steps[0].nextButton?.isDisabled).toBe(true);
    expect(capturedProps!.steps[1].nextButton?.isDisabled).toBe(true);
    expect(capturedProps!.steps[2].nextButton?.isDisabled).toBe(true);
  });

  it('enables the definition step once its fields carry a value', async () => {
    await renderApp();

    fireEvent.change(codeInput(), { target: { value: 'SUMMER25' } });
    fireEvent.change(screen.getByTestId('discount-name').querySelector('input')!, {
      target: { value: 'Summer 2025' },
    });
    fireEvent.change(screen.getByTestId('discount-value').querySelector('input')!, {
      target: { value: '20' },
    });
    await act(async () => {
      capturedProps!.steps[0].render();
    });

    // Category is still unset, so the gate must stay closed.
    expect(capturedProps!.steps[0].nextButton?.isDisabled).toBe(true);
  });

  it('refuses to POST while the draft is still incomplete', async () => {
    await renderApp();
    await goToStep(3);

    const target = await runStepGate();

    expect(target).toBe(3);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('renders nothing for client accounts', async () => {
    mockAccount('Client');

    await renderApp();

    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
  });
});

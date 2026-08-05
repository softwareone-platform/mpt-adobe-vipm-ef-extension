import { act, fireEvent, render } from '@testing-library/react';

import { DetailsStep } from './DetailsStep';
import type { Order } from '../model';
import type { Subscription } from '../../shared/model';

const order: Order = {
  id: 'ORD-1111-1111',
  status: 'New',
  type: 'Change',
  billTo: { id: 'BUY-1111-1111', name: 'Buyer Name' },
};

type NavProps = { currentStepIndex: number; targetStepIndex: number };

let registeredOnNext: ((props: NavProps) => Promise<number>) | undefined;
let registeredOnBack: ((props: NavProps) => Promise<number>) | undefined;
const registerOnNextCallback = jest.fn((cb: (props: NavProps) => Promise<number>) => {
  registeredOnNext = cb;
});
const registerOnBackCallback = jest.fn((cb: (props: NavProps) => Promise<number>) => {
  registeredOnBack = cb;
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback, registerOnBackCallback }),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/text', () => ({
  RegularText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

interface InputProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Input: ({ value, onChange, testId }: InputProps) => (
    <input data-testid={testId} value={value} onChange={onChange} />
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

function renderStep(overrides: Partial<Parameters<typeof DetailsStep>[0]> = {}) {
  const props = {
    subscription: { id: 'SUB-1' } as Subscription,
    order,
    setOrder: jest.fn(),
    ...overrides,
  };
  return { ...render(<DetailsStep {...props} />), props };
}

describe('DetailsStep', () => {
  beforeEach(() => {
    registeredOnNext = undefined;
    registeredOnBack = undefined;
    jest.clearAllMocks();
  });

  it('renders the heading, highlights, and inputs', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Order')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('order-additional-id')).toBeTruthy();
    expect(getByTestId('order-notes')).toBeTruthy();
  });

  it('registers onNext and onBack callbacks', () => {
    renderStep();

    expect(typeof registeredOnNext).toBe('function');
    expect(typeof registeredOnBack).toBe('function');
  });

  it('steps back by one when split billing is not skipped', async () => {
    renderStep();

    const result = await registeredOnBack!({ currentStepIndex: 3, targetStepIndex: 2 });

    expect(result).toBe(2);
  });

  it('steps back by two when split billing is skipped', async () => {
    renderStep({ isSplitBillingStepSkip: true });

    const result = await registeredOnBack!({ currentStepIndex: 3, targetStepIndex: 2 });

    expect(result).toBe(1);
  });

  it('advances without saving when nothing changed', async () => {
    const { props } = renderStep();

    const result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });

    expect(props.setOrder).not.toHaveBeenCalled();
    expect(result).toBe(4);
  });

  it('saves the edited additional id and notes, then advances', async () => {
    const { props, getByTestId } = renderStep();

    fireEvent.change(getByTestId('order-additional-id'), { target: { value: 'CL-ADD-123' } });
    fireEvent.change(getByTestId('order-notes'), { target: { value: 'Some notes' } });

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(props.setOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ORD-1111-1111',
        externalIds: expect.objectContaining({ client: 'CL-ADD-123' }),
        notes: 'Some notes',
      })
    );
    expect(result).toBe(4);
  });
});

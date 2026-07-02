import { act, render } from '@testing-library/react';

import { SplitBillingStep } from './SplitBillingStep';
import type {
  Order,
  SplitBillingAgreement,
  SplitBillingAgreementAllocation,
} from '../../shared/midterm-upgrade';

const agreement: SplitBillingAgreement = {
  id: 'AGR-1111-1111',
  buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
  allocations: [
    { id: 'ALL-1111-1111', buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' }, percentage: 60 },
    { id: 'ALL-2222-2222', buyer: { id: 'BUY-2222-2222', name: 'Second Buyer Name' }, percentage: 40 },
  ],
};

const order: Order = {
  id: 'ORD-1111-1111',
  status: 'New',
  type: 'Change',
  billTo: { id: 'BUY-1111-1111', name: 'Buyer Name' },
};

type NavProps = { currentStepIndex: number; targetStepIndex: number };

let registeredOnNext: ((props: NavProps) => Promise<number>) | undefined;
const registerOnNextCallback = jest.fn((cb: (props: NavProps) => Promise<number>) => {
  registeredOnNext = cb;
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback }),
}));

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

interface AllocateProps {
  agreementBuyerId?: string;
  selectedBuyerId?: string;
  allocations?: SplitBillingAgreementAllocation[];
  onChange: (buyer: SplitBillingAgreementAllocation) => void;
}

let allocateProps: AllocateProps;

jest.mock('../components/allocate-to-buyer/AllocateToBuyer', () => ({
  AllocateToBuyer: (props: AllocateProps) => {
    allocateProps = props;
    return <div data-testid="allocate-to-buyer" />;
  },
}));

function renderStep(overrides: Partial<Parameters<typeof SplitBillingStep>[0]> = {}) {
  const props = {
    agreement,
    order,
    addBuyerToOrder: jest.fn().mockResolvedValue(undefined),
    selectedBuyer: {} as SplitBillingAgreementAllocation,
    onChange: jest.fn(),
    ...overrides,
  };
  return { ...render(<SplitBillingStep {...props} />), props };
}

describe('SplitBillingStep', () => {
  it('renders the heading, highlights, and allocate-to-buyer', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Split Billing')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('allocate-to-buyer')).toBeTruthy();
  });

  it('passes the mock agreement owner, selection, and allocations to allocate-to-buyer', () => {
    renderStep();

    expect(allocateProps.agreementBuyerId).toBe('BUY-1111-1111');
    expect(allocateProps.selectedBuyerId).toBe('BUY-1111-1111');
    expect(allocateProps.allocations).toHaveLength(2);
  });

  it('registers an onNext callback', () => {
    renderStep();

    expect(registerOnNextCallback).toHaveBeenCalled();
    expect(typeof registeredOnNext).toBe('function');
  });

  it('saves the selected buyer and advances on next', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    renderStep({ addBuyerToOrder, selectedBuyer: { id: 'BUY-2222-2222' } });

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 2, targetStepIndex: 3 });
    });

    expect(addBuyerToOrder).toHaveBeenCalledWith({ id: 'BUY-2222-2222' });
    expect(result).toBe(3);
  });

  it('stays on the current step and surfaces the error when the save fails', async () => {
    const addBuyerToOrder = jest.fn().mockRejectedValue(new Error('boom'));
    const { getByText } = renderStep({ addBuyerToOrder });

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 2, targetStepIndex: 3 });
    });

    expect(result).toBe(2);
    expect(getByText('boom')).toBeTruthy();
  });

  it('forwards selection changes to the parent onChange', () => {
    const onChange = jest.fn();
    renderStep({ onChange });
    const selected = { id: 'BUY-2222-2222' };

    act(() => allocateProps.onChange(selected));

    expect(onChange).toHaveBeenCalledWith(selected);
  });

  it('uses the newly selected buyer on next', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    renderStep({ addBuyerToOrder });

    act(() => allocateProps.onChange({ id: 'BUY-2222-2222' }));
    await act(async () => {
      await registeredOnNext!({ currentStepIndex: 2, targetStepIndex: 3 });
    });

    expect(addBuyerToOrder).toHaveBeenCalledWith({ id: 'BUY-2222-2222' });
  });
});

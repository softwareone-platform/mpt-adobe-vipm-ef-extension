import { act, fireEvent, render } from '@testing-library/react';

import { SplitBillingStep } from './SplitBillingStep';
import type { AgreementSplit, AgreementSplitAllocation, Subscription } from '../../shared/model';
import type { Order } from '../model';

const buyerTwo: AgreementSplitAllocation = {
  buyer: { id: 'BUY-2222-2222', name: 'Second Buyer Name' },
  percentage: 40,
  price: { currency: 'USD', SPxY: 800, SPxM: 66.67 },
};

const agreement: AgreementSplit = {
  id: 'SBA-1111-1111',
  revision: 1,
  allocations: [
    {
      buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
      percentage: 60,
      price: { currency: 'USD', SPxY: 1200, SPxM: 100 },
    },
    buyerTwo,
  ],
};

const order: Order = { id: 'ORD-1111-1111', status: 'New', type: 'Change' };

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

jest.mock('../components/split-billing-option/SplitBillingOption', () => ({
  SplitBillingOption: ({ onSelect }: { onSelect: (value: 'percentages' | 'buyer') => void }) => (
    <div data-testid="split-billing-option">
      <button data-testid="pick-percentages" onClick={() => onSelect('percentages')} />
      <button data-testid="pick-buyer" onClick={() => onSelect('buyer')} />
    </div>
  ),
}));

jest.mock('../components/split-billing-allocations/SplitBillingAllocations', () => ({
  SplitBillingAllocations: () => <div data-testid="split-billing-allocations" />,
}));

interface AllocateProps {
  agreementBuyerId?: string;
  selectedBuyerId?: string;
  allocations?: AgreementSplitAllocation[];
  onChange: (buyer: AgreementSplitAllocation) => void;
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
    subscription: { id: 'SUB-1', buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' } } as Subscription,
    splitAgreement: agreement,
    order,
    addBuyerToOrder: jest.fn().mockResolvedValue(undefined),
    selectedBuyer: null,
    onChange: jest.fn(),
    ...overrides,
  };
  return { ...render(<SplitBillingStep {...props} />), props };
}

describe('SplitBillingStep', () => {
  it('renders the heading, highlights, and the option chooser first', () => {
    const { getByText, getByTestId, queryByTestId } = renderStep();

    expect(getByText('Split billing')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('split-billing-option')).toBeTruthy();
    expect(queryByTestId('split-billing-allocations')).toBeNull();
    expect(queryByTestId('allocate-to-buyer')).toBeNull();
  });

  it('shows the allocations table when the percentages option is chosen', () => {
    const { getByTestId, queryByTestId } = renderStep();

    fireEvent.click(getByTestId('pick-percentages'));

    expect(getByTestId('split-billing-allocations')).toBeTruthy();
    expect(queryByTestId('split-billing-option')).toBeNull();
  });

  it('shows the buyer list when the specific-buyer option is chosen', () => {
    const { getByTestId } = renderStep();

    fireEvent.click(getByTestId('pick-buyer'));

    expect(getByTestId('allocate-to-buyer')).toBeTruthy();
    expect(allocateProps.agreementBuyerId).toBe('BUY-1111-1111');
    expect(allocateProps.allocations).toHaveLength(2);
  });

  it('blocks advancing when no option is selected', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    const { getByText } = renderStep({ addBuyerToOrder });

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(result).toBe(3);
    expect(addBuyerToOrder).not.toHaveBeenCalled();
    expect(getByText('Select a split billing option.')).toBeTruthy();
  });

  it('advances without calling addBuyerToOrder when percentages is chosen', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = renderStep({ addBuyerToOrder });
    fireEvent.click(getByTestId('pick-percentages'));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(addBuyerToOrder).not.toHaveBeenCalled();
    expect(result).toBe(4);
  });

  it('blocks advancing when specific-buyer is chosen but no buyer is selected', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    const { getByTestId, getByText } = renderStep({ addBuyerToOrder });
    fireEvent.click(getByTestId('pick-buyer'));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(result).toBe(3);
    expect(addBuyerToOrder).not.toHaveBeenCalled();
    expect(getByText('Select a buyer to allocate billing to.')).toBeTruthy();
  });

  it('saves the selected buyer and advances on next', async () => {
    const addBuyerToOrder = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = renderStep({ addBuyerToOrder });
    fireEvent.click(getByTestId('pick-buyer'));
    act(() => allocateProps.onChange(buyerTwo));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(addBuyerToOrder).toHaveBeenCalledWith({ id: 'BUY-2222-2222' });
    expect(result).toBe(4);
  });

  it('surfaces the error and stays when the save fails', async () => {
    const addBuyerToOrder = jest.fn().mockRejectedValue(new Error('boom'));
    const { getByTestId, getByText } = renderStep({ addBuyerToOrder });
    fireEvent.click(getByTestId('pick-buyer'));
    act(() => allocateProps.onChange(buyerTwo));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(result).toBe(3);
    expect(getByText('boom')).toBeTruthy();
  });

  it('forwards selection changes to the parent onChange', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderStep({ onChange });
    fireEvent.click(getByTestId('pick-buyer'));

    act(() => allocateProps.onChange(buyerTwo));

    expect(onChange).toHaveBeenCalledWith(buyerTwo);
  });

  it('registers an onNext callback', () => {
    renderStep();

    expect(registerOnNextCallback).toHaveBeenCalled();
    expect(typeof registeredOnNext).toBe('function');
  });
});

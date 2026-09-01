import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react';

import { SplitBillingStep } from './SplitBillingStep';
import type { AgreementSplit, AgreementSplitAllocation, Subscription } from '../../shared/model';
import type { Order } from '../model';

const buyerTwo: AgreementSplitAllocation = {
  buyer: { id: 'BUY-2222-2222', name: 'Second Buyer Name' },
  percentage: 40,
  price: { currency: 'USD', SPxY: 800, SPxM: 66.67 },
};

const buyerThree: AgreementSplitAllocation = {
  buyer: { id: 'BUY-3333-3333', name: 'Third Buyer Name' },
  percentage: 0,
  price: { currency: 'USD', SPxY: 0, SPxM: 0 },
};

const subscriptionSplit: AgreementSplit = {
  id: 'SBS-1111-1111',
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

const agreementSplit: AgreementSplit = {
  id: 'SBA-1111-1111',
  revision: 1,
  allocations: [...subscriptionSplit.allocations, buyerThree],
};

const order: Order = { id: 'ORD-1111-1111', status: 'New', type: 'Change' };

type NavProps = { currentStepIndex: number; targetStepIndex: number };

let registeredOnNext: ((props: NavProps) => Promise<number>) | undefined;
const registerOnNextCallback = jest.fn((cb: (props: NavProps) => Promise<number>) => {
  registeredOnNext = cb;
  return () => {};
});

let registeredOnBack: ((props: NavProps) => number) | undefined;
const registerOnBackCallback = jest.fn((cb: (props: NavProps) => number) => {
  registeredOnBack = cb;
  return () => {};
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback, registerOnBackCallback }),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

jest.mock('../components/split-billing-option/SplitBillingOption', () => ({
  SplitBillingOption: ({
    onSelect,
    selectedValue,
  }: {
    onSelect: (value: 'percentages' | 'buyer') => void;
    selectedValue?: 'percentages' | 'buyer' | null;
  }) => (
    <div data-testid="split-billing-option" data-selected={selectedValue ?? ''}>
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

function Parent(props: Omit<Parameters<typeof SplitBillingStep>[0], 'option' | 'onOptionChange'>) {
  const [option, setOption] = useState<'percentages' | 'buyer' | null>(null);
  return <SplitBillingStep {...props} option={option} onOptionChange={setOption} />;
}

function renderStep(overrides: Partial<Parameters<typeof SplitBillingStep>[0]> = {}) {
  const props = {
    subscription: { id: 'SUB-1', buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' } } as Subscription,
    split: subscriptionSplit,
    agreementSplit,
    order,
    addBuyerToOrder: jest.fn().mockResolvedValue(undefined),
    selectedBuyer: null,
    onChange: jest.fn(),
    ...overrides,
  };
  return { ...render(<Parent {...props} />), props };
}

async function confirmOption(
  getByTestId: (id: string) => HTMLElement,
  option: 'percentages' | 'buyer'
) {
  fireEvent.click(getByTestId(`pick-${option}`));
  await act(async () => {
    await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
  });
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

  it('only marks the option as selected on click, leaving the view unchanged', () => {
    const { getByTestId, queryByTestId } = renderStep();

    fireEvent.click(getByTestId('pick-percentages'));

    expect(getByTestId('split-billing-option').dataset.selected).toBe('percentages');
    expect(queryByTestId('split-billing-allocations')).toBeNull();
    expect(queryByTestId('allocate-to-buyer')).toBeNull();
  });

  it('confirms the choice on the first next without leaving the step', async () => {
    const { getByTestId } = renderStep();

    fireEvent.click(getByTestId('pick-percentages'));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(result).toBe(3);
    expect(getByTestId('split-billing-allocations')).toBeTruthy();
  });

  it('shows the allocations table once percentages is confirmed', async () => {
    const { getByTestId, queryByTestId } = renderStep();

    await confirmOption(getByTestId, 'percentages');

    expect(getByTestId('split-billing-allocations')).toBeTruthy();
    expect(queryByTestId('split-billing-option')).toBeNull();
  });

  it('lists every agreement split buyer once the specific-buyer option is confirmed', async () => {
    const { getByTestId } = renderStep();

    await confirmOption(getByTestId, 'buyer');

    expect(getByTestId('allocate-to-buyer')).toBeTruthy();
    expect(allocateProps.agreementBuyerId).toBe('BUY-1111-1111');
    expect(allocateProps.allocations).toEqual(agreementSplit.allocations);
  });

  it('keeps the buyer list even when the subscription has no allocations', async () => {
    const { getByTestId } = renderStep({ split: null });

    await confirmOption(getByTestId, 'buyer');

    expect(allocateProps.allocations).toHaveLength(3);
  });

  it('reports the missing buyers instead of an empty picker', async () => {
    const { getByText, getByTestId, queryByTestId } = renderStep({ agreementSplit: null });

    await confirmOption(getByTestId, 'buyer');

    expect(queryByTestId('allocate-to-buyer')).toBeNull();
    expect(
      getByText('The buyers configured for split billing on this agreement could not be loaded.')
    ).toBeTruthy();
  });

  it('returns from the confirmed view to the option list on back', async () => {
    const { getByTestId, queryByTestId } = renderStep();
    await confirmOption(getByTestId, 'percentages');

    let result: number | undefined;
    act(() => {
      result = registeredOnBack!({ currentStepIndex: 3, targetStepIndex: 2 });
    });

    expect(result).toBe(3);
    expect(getByTestId('split-billing-option')).toBeTruthy();
    expect(queryByTestId('split-billing-allocations')).toBeNull();
  });

  it('keeps the confirmed option when the step is remounted from a later step', async () => {
    const props = {
      subscription: { id: 'SUB-1', buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' } } as Subscription,
      split: subscriptionSplit,
      agreementSplit,
      order,
      addBuyerToOrder: jest.fn().mockResolvedValue(undefined),
      selectedBuyer: null,
      onChange: jest.fn(),
      onOptionChange: jest.fn(),
    };
    const { getByTestId, queryByTestId, rerender } = render(
      <SplitBillingStep {...props} option={null} />
    );

    fireEvent.click(getByTestId('pick-percentages'));
    await act(async () => {
      await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });
    expect(props.onOptionChange).toHaveBeenCalledWith('percentages');

    rerender(<SplitBillingStep {...props} option={'percentages'} />);

    expect(getByTestId('split-billing-allocations')).toBeTruthy();
    expect(queryByTestId('split-billing-option')).toBeNull();
  });

  it('preselects the confirmed option when back returns to the option list', () => {
    const props = {
      subscription: { id: 'SUB-1', buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' } } as Subscription,
      split: subscriptionSplit,
      agreementSplit,
      order,
      addBuyerToOrder: jest.fn().mockResolvedValue(undefined),
      selectedBuyer: null,
      onChange: jest.fn(),
      onOptionChange: jest.fn(),
    };
    const { getByTestId, rerender } = render(<SplitBillingStep {...props} option={'buyer'} />);

    act(() => {
      registeredOnBack!({ currentStepIndex: 3, targetStepIndex: 2 });
    });
    expect(props.onOptionChange).toHaveBeenCalledWith(null);
    rerender(<SplitBillingStep {...props} option={null} />);

    expect(getByTestId('split-billing-option').dataset.selected).toBe('buyer');
  });

  it('leaves the step on back while the option list is showing', () => {
    renderStep();

    const result = registeredOnBack!({ currentStepIndex: 3, targetStepIndex: 2 });

    expect(result).toBe(2);
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
    await confirmOption(getByTestId, 'percentages');

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
    await confirmOption(getByTestId, 'buyer');

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
    await confirmOption(getByTestId, 'buyer');
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
    await confirmOption(getByTestId, 'buyer');
    act(() => allocateProps.onChange(buyerTwo));

    let result: number | undefined;
    await act(async () => {
      result = await registeredOnNext!({ currentStepIndex: 3, targetStepIndex: 4 });
    });

    expect(result).toBe(3);
    expect(getByText('boom')).toBeTruthy();
  });

  it('forwards selection changes to the parent onChange', async () => {
    const onChange = jest.fn();
    const { getByTestId } = renderStep({ onChange });
    await confirmOption(getByTestId, 'buyer');

    act(() => allocateProps.onChange(buyerTwo));

    expect(onChange).toHaveBeenCalledWith(buyerTwo);
  });

  it('registers onNext and onBack callbacks', () => {
    renderStep();

    expect(registerOnNextCallback).toHaveBeenCalled();
    expect(typeof registeredOnNext).toBe('function');
    expect(registerOnBackCallback).toHaveBeenCalled();
    expect(typeof registeredOnBack).toBe('function');
  });
});

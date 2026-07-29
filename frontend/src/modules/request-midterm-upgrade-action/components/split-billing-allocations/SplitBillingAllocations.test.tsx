import { ReactNode } from 'react';

import { render, within } from '@testing-library/react';

import { SplitBillingAllocations } from './SplitBillingAllocations';
import type { AgreementSplitAllocation } from '../../../shared/model';

type Row = AgreementSplitAllocation & { id: string };

interface ListProps {
  columns: { name: string; cell: (row: { data: Row }) => ReactNode }[];
  data: Row[];
}

let capturedListProps: ListProps;

jest.mock('@softwareone-platform/sdk-react-ui-v0/list', () => ({
  List: (props: ListProps) => {
    capturedListProps = props;
    return <div data-testid="list" />;
  },
  useListInMemory: (model: { columns: unknown }) => ({ columns: model.columns }),
}));

jest.mock('../buyer-reference/BuyerReference', () => ({
  BuyerReference: ({ allocation, isOwner }: { allocation: AgreementSplitAllocation; isOwner: boolean }) => (
    <div data-testid="buyer-reference">{`${allocation.buyer.name} ${isOwner ? 'owner' : 'member'}`}</div>
  ),
}));

const allocations: AgreementSplitAllocation[] = [
  { buyer: { id: 'BUY-1', name: 'Owner Co' }, percentage: 80, price: { currency: 'USD', SPxY: 1, SPxM: 1 } },
  { buyer: { id: 'BUY-2', name: 'Zero Co' }, percentage: 0, price: { currency: 'USD', SPxY: 0, SPxM: 0 } },
];

describe('SplitBillingAllocations', () => {
  it('renders the info text and one row per allocation', () => {
    const { getByText } = render(
      <SplitBillingAllocations allocations={allocations} agreementBuyerId="BUY-1" />,
    );

    expect(getByText(/Billing for subscription changes will be allocated between buyers/)).toBeTruthy();
    expect(capturedListProps.data.map((row) => row.id)).toEqual(['BUY-1', 'BUY-2']);
  });

  it('marks the owner and renders the percentage, with a dash for zero', () => {
    render(<SplitBillingAllocations allocations={allocations} agreementBuyerId="BUY-1" />);
    const [buyerColumn, allocationColumn] = capturedListProps.columns;

    const owner = render(<>{buyerColumn.cell({ data: allocations[0] as Row })}</>);
    expect(within(owner.container).getByTestId('buyer-reference').textContent).toBe('Owner Co owner');

    const member = render(<>{buyerColumn.cell({ data: allocations[1] as Row })}</>);
    expect(within(member.container).getByTestId('buyer-reference').textContent).toBe('Zero Co member');

    expect(allocationColumn.cell({ data: allocations[0] as Row })).toBe('80');
    expect(allocationColumn.cell({ data: allocations[1] as Row })).toBe('—');
  });
});

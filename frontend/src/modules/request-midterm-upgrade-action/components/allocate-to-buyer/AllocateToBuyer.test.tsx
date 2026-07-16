import { ReactNode } from 'react';

import { render } from '@testing-library/react';

import { AllocateToBuyer } from './AllocateToBuyer';
import type { AgreementSplitAllocation } from '../../../shared/model';

type Row = AgreementSplitAllocation & { id: string };

interface ListProps {
  columns: { name: string; cell: (row: { data: Row }) => ReactNode }[];
  data: Row[];
  selectedRows: { data: { id?: string }; selected: boolean }[];
  onRowSelectionChange: (rows: Row[]) => void;
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
  { buyer: { id: 'BUY-1', name: 'Buyer One' }, percentage: 60, price: { currency: 'USD', SPxY: 1, SPxM: 1 } },
  { buyer: { id: 'BUY-2', name: 'Buyer Two' }, percentage: 40, price: { currency: 'USD', SPxY: 1, SPxM: 1 } },
];

function renderComponent(overrides: Partial<Parameters<typeof AllocateToBuyer>[0]> = {}) {
  const props = {
    agreementBuyerId: 'BUY-1',
    selectedBuyerId: 'BUY-1',
    onChange: jest.fn(),
    allocations,
    ...overrides,
  };
  return { ...render(<AllocateToBuyer {...props} />), props };
}

describe('AllocateToBuyer', () => {
  it('renders the info text and the list', () => {
    const { getByTestId, getByText } = renderComponent();

    expect(getByTestId('allocate-to-buyer')).toBeTruthy();
    expect(getByTestId('list')).toBeTruthy();
    expect(getByText(/Billing for subscription changes will be allocated between buyers/)).toBeTruthy();
  });

  it('feeds the list one row per allocation with no None row', () => {
    renderComponent();

    expect(capturedListProps.data).toHaveLength(2);
    expect(capturedListProps.data.map((row) => row.id)).toEqual(['BUY-1', 'BUY-2']);
  });

  it('preselects the row matching the selected buyer', () => {
    renderComponent({ selectedBuyerId: 'BUY-2' });

    expect(capturedListProps.selectedRows).toEqual([{ data: { id: 'BUY-2' }, selected: true }]);
  });

  it('selects nothing when no buyer is selected', () => {
    renderComponent({ selectedBuyerId: '' });

    expect(capturedListProps.selectedRows).toEqual([]);
  });

  it('forwards the first selected row to onChange', () => {
    const onChange = jest.fn();
    renderComponent({ onChange });

    capturedListProps.onRowSelectionChange([allocations[1] as Row, allocations[0] as Row]);

    expect(onChange).toHaveBeenCalledWith(allocations[1]);
  });

  it('ignores an empty selection', () => {
    const onChange = jest.fn();
    renderComponent({ onChange });

    capturedListProps.onRowSelectionChange([]);

    expect(onChange).not.toHaveBeenCalled();
  });

  describe('buyer column cell', () => {
    const getCell = () => capturedListProps.columns[0].cell;

    it('marks the agreement owner as owner', () => {
      renderComponent();
      const { getByTestId } = render(
        <>{getCell()({ data: allocations[0] as Row })}</>,
      );

      expect(getByTestId('buyer-reference').textContent).toBe('Buyer One owner');
    });

    it('marks a non-owner buyer as member', () => {
      renderComponent();
      const { getByTestId } = render(
        <>{getCell()({ data: allocations[1] as Row })}</>,
      );

      expect(getByTestId('buyer-reference').textContent).toBe('Buyer Two member');
    });
  });
});

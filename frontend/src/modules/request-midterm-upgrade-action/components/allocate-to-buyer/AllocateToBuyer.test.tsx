import { ReactNode } from 'react';

import { render } from '@testing-library/react';

import { AllocateToBuyer } from './AllocateToBuyer';
import type { SplitBillingAgreementAllocation } from '../../../shared/midtermUpgrade';

type CellData = { id?: string; buyer?: { id?: string; name?: string } };

interface ListProps {
  columns: { name: string; cell: (row: { data: CellData }) => ReactNode }[];
  data: { id?: string }[];
  selectedRows: { data: { id?: string }; selected: boolean }[];
  onRowSelectionChange: (rows: CellData[]) => void;
}

let capturedListProps: ListProps;

jest.mock('@softwareone-platform/sdk-react-ui-v0/list', () => ({
  List: (props: ListProps) => {
    capturedListProps = props;
    return <div data-testid="list" />;
  },
  useListInMemory: (model: { columns: unknown }) => ({ columns: model.columns }),
}));

jest.mock('../link-reference/LinkReference', () => ({
  LinkReference: ({ text }: { text?: string }) => <div data-testid="link-reference">{text}</div>,
}));

jest.mock('../reference-with-chip/ReferenceWithChip', () => ({
  ReferenceWithChip: ({ text, statusLabel }: { text?: string; statusLabel: string }) => (
    <div data-testid="reference-with-chip">{`${text} ${statusLabel}`}</div>
  ),
}));

const allocations: SplitBillingAgreementAllocation[] = [
  { id: 'ALL-1', buyer: { id: 'BUY-1', name: 'Buyer One' }, percentage: 60 },
  { id: 'ALL-2', buyer: { id: 'BUY-2', name: 'Buyer Two' }, percentage: 40 },
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
  it('renders nothing when there are no allocations', () => {
    const { container } = render(
      <AllocateToBuyer
        agreementBuyerId="BUY-1"
        selectedBuyerId="BUY-1"
        onChange={jest.fn()}
        allocations={undefined as unknown as SplitBillingAgreementAllocation[]}
      />,
    );

    expect(container.querySelector('[data-testid="allocate-to-buyer"]')).toBeNull();
  });

  it('renders the info text and the list', () => {
    const { getByTestId, getByText } = renderComponent();

    expect(getByTestId('allocate-to-buyer')).toBeTruthy();
    expect(getByTestId('list')).toBeTruthy();
    expect(getByText(/Allocate order billing to a specific buyer/)).toBeTruthy();
  });

  it('hides the title by default', () => {
    const { queryByText } = renderComponent();

    expect(queryByText('Split billing')).toBeNull();
  });

  it('shows the title when isTitle is set', () => {
    const { getByText } = renderComponent({ isTitle: true });

    expect(getByText('Split billing')).toBeTruthy();
  });

  it('feeds the list each allocation plus a None row', () => {
    renderComponent();

    expect(capturedListProps.data).toHaveLength(3);
    expect(capturedListProps.data.map((row) => row.id)).toEqual(['BUY-1', 'BUY-2', '0']);
  });

  it('preselects the row matching the selected buyer', () => {
    renderComponent({ selectedBuyerId: 'BUY-2' });

    expect(capturedListProps.selectedRows).toEqual([{ data: { id: 'BUY-2' }, selected: true }]);
  });

  it('preselects the None row when no buyer is selected', () => {
    renderComponent({ selectedBuyerId: '' });

    expect(capturedListProps.selectedRows).toEqual([{ data: { id: '0' }, selected: true }]);
  });

  it('forwards the first selected row to onChange', () => {
    const onChange = jest.fn();
    const selected = { id: 'BUY-2', buyer: { id: 'BUY-2', name: 'Buyer Two' } };
    renderComponent({ onChange });

    capturedListProps.onRowSelectionChange([selected, { id: 'BUY-1' }]);

    expect(onChange).toHaveBeenCalledWith(selected);
  });

  it('forwards an empty selection when the None row is selected', () => {
    const onChange = jest.fn();
    renderComponent({ onChange });

    capturedListProps.onRowSelectionChange([{ id: '0' }]);

    expect(onChange).toHaveBeenCalledWith({});
  });

  describe('buyer column cell', () => {
    const getCell = () => capturedListProps.columns[0].cell;

    it('renders the owner buyer with an Owner chip', () => {
      renderComponent();
      const { getByTestId } = render(
        <>{getCell()({ data: { id: 'BUY-1', buyer: { id: 'BUY-1', name: 'Buyer One' } } })}</>,
      );

      expect(getByTestId('reference-with-chip').textContent).toBe('Buyer One Owner');
    });

    it('renders a non-owner buyer as a link reference', () => {
      renderComponent();
      const { getByTestId } = render(
        <>{getCell()({ data: { id: 'BUY-2', buyer: { id: 'BUY-2', name: 'Buyer Two' } } })}</>,
      );

      expect(getByTestId('link-reference').textContent).toBe('Buyer Two');
    });

    it('renders the None row label', () => {
      renderComponent();
      const { getByText } = render(<>{getCell()({ data: { id: '0' } })}</>);

      expect(getByText('None')).toBeTruthy();
    });
  });
});

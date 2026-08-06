import { ReactNode } from 'react';

import { fireEvent, render, within } from '@testing-library/react';

import { ItemsStep } from './ItemsStep';
import type { Agreement, Subscription } from '../../shared/model';
import type { NetNewItem, RenewalQuantities, RenewalSelections } from '../model';

interface TestRow {
  id: string;
}

interface GridColumn {
  name: string;
  title?: string;
  cell?: (row: TestRow) => ReactNode;
}

interface GridConfig {
  id: string;
  columns: GridColumn[];
  paging: { page: number; pageSize: number; total: number };
}

let capturedConfig: GridConfig;

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: ({ data, config }: { data: TestRow[]; config: GridConfig }) => (
    <div data-testid="grid">
      {data.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {config.columns.map((column) => (
            <div key={column.name}>{column.cell?.(row)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useGridInMemory: (data: TestRow[], config: GridConfig) => {
    capturedConfig = config;
    return { data, config };
  },
}));

interface MockButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  isDisabled?: boolean;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick, isDisabled, testId }: MockButtonProps) => (
    <button data-testid={testId} disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

interface MockTextInputCellProps {
  value: string;
  errorMessage?: string;
  onChange?: (value: string) => void;
}

jest.mock('../../shared/components/GridCell/TextInputCell/TextInputCell', () => ({
  TextInputCell: ({ value, errorMessage, onChange }: MockTextInputCellProps) => (
    <div>
      <input value={value} onChange={(event) => onChange?.(event.target.value)} />
      {errorMessage && <span>{errorMessage}</span>}
    </div>
  ),
}));

interface MockLinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
  url?: string | null;
}

jest.mock('../../shared/components/LinkReference/LinkReference', () => ({
  LinkReference: ({ text, secondaryContent, url }: MockLinkReferenceProps) => (
    <div data-url={url}>
      <span>{text}</span>
      <span>{secondaryContent}</span>
    </div>
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  excludedSkus: Set<string>;
  recommendedSkus: Set<string>;
  currency: string;
  onAdd: (items: NetNewItem[]) => void;
}
let dialogProps: DialogProps;

jest.mock('../components/select-items-dialog/SelectItemsDialog', () => ({
  SelectItemsDialog: (props: DialogProps) => {
    dialogProps = props;
    return <div data-testid="select-items-dialog" data-open={props.isOpen} />;
  },
}));

const agreement: Agreement = {
  id: 'AGR-1111-1111',
  name: 'Agreement Name',
  listing: { id: 'LST-2993-3317' },
  price: { billingCurrency: 'USD' },
};

const subscriptions: Subscription[] = [
  {
    id: 'SUB-1',
    name: 'Subscription for Creative Cloud',
    autoRenew: true,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-1',
        quantity: 37,
        item: {
          id: 'ITM-1',
          name: 'Creative Cloud All Apps',
          externalIds: { vendor: '65322587CA01A12' },
        },
        price: { unitSP: 457.2, SPxM: 1409.7, SPxY: 16916.4 },
      },
    ],
  },
  {
    id: 'SUB-2',
    name: 'Subscription for Audition',
    autoRenew: false,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-2',
        quantity: 21,
        item: {
          id: 'ITM-2',
          name: 'Audition for Enterprise',
          externalIds: { vendor: '65322588CA01A12' },
        },
        price: { unitSP: 234, SPxM: 409.5, SPxY: 4914 },
      },
    ],
  },
];

const NET_NEW_ITEM: NetNewItem = {
  itemId: 'ITM-9',
  itemName: 'Premiere Pro for Enterprise',
  sku: '65304578CA',
  terms: { period: '1y', commitment: '1y' },
  unitSP: 234,
  quantity: 5,
  recommended: true,
};

const renderStep = ({
  selections = {},
  quantities = {},
  netNewItems = [],
  recommendedSkus = new Set<string>(),
  onQuantityChange = jest.fn(),
  onNetNewItemsChange = jest.fn(),
  subscriptionList = subscriptions,
  agreementOverride = agreement,
}: {
  selections?: RenewalSelections;
  quantities?: RenewalQuantities;
  netNewItems?: NetNewItem[];
  recommendedSkus?: Set<string>;
  onQuantityChange?: (subscriptionId: string, quantity: number | null) => void;
  onNetNewItemsChange?: (items: NetNewItem[]) => void;
  subscriptionList?: Subscription[];
  agreementOverride?: Agreement;
} = {}) =>
  render(
    <ItemsStep
      agreement={agreementOverride}
      subscriptions={subscriptionList}
      selections={selections}
      quantities={quantities}
      netNewItems={netNewItems}
      recommendedSkus={recommendedSkus}
      onQuantityChange={onQuantityChange}
      onNetNewItemsChange={onNetNewItemsChange}
    />,
  );

describe('ItemsStep', () => {
  it('renders the heading, the highlights, the prompt and the price disclaimer', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Items')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByText(/Modify the renewal quantities of your existing subscriptions/)).toBeTruthy();
    expect(getByText(/These estimated prices include estimates/)).toBeTruthy();
  });

  it('lists only the subscriptions being renewed', () => {
    const { getByTestId, queryByTestId } = renderStep();

    expect(getByTestId('row-SUB-1')).toBeTruthy();
    expect(queryByTestId('row-SUB-2')).toBeNull();
  });

  it('honours the customer renew selections over the standing preference', () => {
    const { getByTestId, queryByTestId } = renderStep({
      selections: { 'SUB-1': false, 'SUB-2': true },
    });

    expect(queryByTestId('row-SUB-1')).toBeNull();
    expect(getByTestId('row-SUB-2')).toBeTruthy();
  });

  it('seeds the renewal quantity from the standing quantity and prices it', () => {
    const { getByTestId } = renderStep();

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('37');
    expect(row.textContent).toContain('457.20');
    expect(row.textContent).toContain('1,409.70');
    expect(row.textContent).toContain('16,916.40');
  });

  it('reprices the subscription from the typed renewal quantity', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 53 } });

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('53');
    expect(row.textContent).toContain('2,019.30');
    expect(row.textContent).toContain('24,231.60');
  });

  it('reports the typed quantity as a number', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '53' },
    });

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', 53);
  });

  it('reports a cleared input as a pending quantity', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '' },
    });

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', null);
  });

  it('ignores non-numeric input', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '3a' },
    });

    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('flags an empty quantity and blanks its prices', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': null } });

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByText('Quantity is required')).toBeTruthy();
    expect(row.textContent).not.toContain('1,409.70');
    expect(row.textContent).not.toContain('16,916.40');
  });

  it('flags a zero quantity', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 0 } });

    expect(
      within(getByTestId('row-SUB-1')).getByText('Quantity must be at least 1'),
    ).toBeTruthy();
  });

  it('keeps the undo action idle until the quantity changes', () => {
    const { getByTestId } = renderStep();

    expect((getByTestId('undo-SUB-1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores the standing quantity on undo', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 53 }, onQuantityChange });

    const undo = getByTestId('undo-SUB-1') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    fireEvent.click(undo);

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', 37);
  });

  it('lists added net-new items as new rows and prices them by quantity', () => {
    const { getByTestId } = renderStep({ netNewItems: [NET_NEW_ITEM] });

    const row = getByTestId('row-ITM-9');
    expect(row.textContent).toContain('Premiere Pro for Enterprise');
    expect(row.textContent).toContain('New');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('5');
    expect(row.textContent).toContain('97.50');
    expect(row.textContent).toContain('1,170.00');
  });

  it('updates the net-new quantity in the added items', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    fireEvent.change(within(getByTestId('row-ITM-9')).getByRole('textbox'), {
      target: { value: '7' },
    });

    expect(onNetNewItemsChange).toHaveBeenCalledWith([{ ...NET_NEW_ITEM, quantity: 7 }]);
  });

  it('removes a net-new item from the plan', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    fireEvent.click(getByTestId('remove-ITM-9'));

    expect(onNetNewItemsChange).toHaveBeenCalledWith([]);
  });

  it('opens the add-items dialog and merges the picked items', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    expect(getByTestId('select-items-dialog').getAttribute('data-open')).toBe('false');

    fireEvent.click(getByTestId('add-items'));

    expect(getByTestId('select-items-dialog').getAttribute('data-open')).toBe('true');
    expect(dialogProps.agreementId).toBe('AGR-1111-1111');
    expect(dialogProps.currency).toBe('USD');

    const added: NetNewItem = { ...NET_NEW_ITEM, itemId: 'ITM-10', sku: '65322600CA' };
    dialogProps.onAdd([NET_NEW_ITEM, added]);

    expect(onNetNewItemsChange).toHaveBeenCalledWith([NET_NEW_ITEM, added]);
  });

  it('keeps held and already added SKUs out of the picker', () => {
    renderStep({ netNewItems: [NET_NEW_ITEM] });

    expect(dialogProps.excludedSkus).toEqual(
      new Set(['65322587CA', '65322588CA', '65304578CA']),
    );
  });

  it('disables adding items when the agreement has no listing', () => {
    renderStep({ agreementOverride: { id: 'AGR-1111-1111' } });

    expect((document.querySelector('[data-testid="add-items"]') as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('tells the customer when nothing renews but still offers adding items', () => {
    const { getByText, getByTestId, queryByTestId } = renderStep({
      selections: { 'SUB-1': false, 'SUB-2': false },
    });

    expect(getByText('No subscriptions to renew')).toBeTruthy();
    expect(queryByTestId('grid')).toBeNull();
    expect((getByTestId('add-items') as HTMLButtonElement).disabled).toBe(false);
  });

  it('pages the grid ten rows at a time', () => {
    renderStep({ netNewItems: [NET_NEW_ITEM] });

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 10, total: 2 });
    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'item',
      'subscription',
      'terms',
      'currentQuantity',
      'renewalQuantity',
      'unitSP',
      'spxM',
      'spxY',
      'actions',
    ]);
  });
});

import { ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import { SelectItemsDialog } from './SelectItemsDialog';
import type { PriceListItem } from '../../../shared/model';

interface TestRow {
  id: string;
  [field: string]: unknown;
}

interface GridColumn {
  name: string;
  title?: string;
  fields?: string[];
  cell?: (row: TestRow) => ReactNode;
}

interface GridConfig {
  id: string;
  columns: GridColumn[];
  fields: { name: string; type?: string }[];
  paging: { page: number; pageSize: number; total: number };
}

let capturedConfig: GridConfig;
let capturedRows: TestRow[];

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
    capturedRows = data;
    return { data, config };
  },
}));

interface MockModalProps {
  isOpen: boolean;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/modal', () => ({
  Modal: ({ isOpen, title, children, actions }: MockModalProps) =>
    isOpen ? (
      <div data-testid="modal">
        <h1>{title}</h1>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
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

interface MockCheckboxProps {
  isChecked?: boolean;
  onChange?: (event: { target: { checked: boolean } }) => void;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/checkbox', () => ({
  Checkbox: ({ isChecked, onChange, testId }: MockCheckboxProps) => (
    <input
      type="checkbox"
      data-testid={testId}
      checked={!!isChecked}
      onChange={() => onChange?.({ target: { checked: !isChecked } })}
    />
  ),
}));

interface MockLinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
}

jest.mock('../../../shared/components/LinkReference/LinkReference', () => ({
  LinkReference: ({ text, secondaryContent }: MockLinkReferenceProps) => (
    <div>
      <span>{text}</span>
      <span>{secondaryContent}</span>
    </div>
  ),
}));

jest.mock('../../../shared/components/Loader/Loader', () => ({
  Loader: () => <div data-testid="loader" />,
}));

const mockRefresh = jest.fn();
let mockPriceListItems: {
  status: string;
  error: string | null;
  data: PriceListItem[];
  refresh: () => void;
};
let lastAgreementId: string | undefined;
let lastRecommendedSkus: Set<string> | undefined;

jest.mock('../../../shared/hooks/usePriceListItems', () => ({
  usePriceListItems: (agreementId: string, recommendedSkus: Set<string>) => {
    lastAgreementId = agreementId;
    lastRecommendedSkus = recommendedSkus;
    return mockPriceListItems;
  },
}));

function priceListItem(
  id: string,
  name: string,
  sku: string,
  overrides: Partial<PriceListItem> = {},
): PriceListItem {
  return {
    id: `PRI-${id}`,
    status: 'ForSale',
    unitLP: 234,
    unitSP: 234,
    SPxM: 19.5,
    SPxY: 234,
    item: {
      id,
      name,
      externalIds: { vendor: sku },
      terms: { model: 'quantity', period: '1y', commitment: '1y' },
    },
    ...overrides,
  };
}

const ITEMS: PriceListItem[] = [
  priceListItem('ITM-1', 'Photoshop for Enterprise', '65322587CA'),
  priceListItem('ITM-2', 'Premiere Pro for Enterprise', '65304578CA', { recommended: true }),
  {
    ...priceListItem('ITM-3', 'Stock Credit Pack', '65322600CA'),
    item: {
      id: 'ITM-3',
      name: 'Stock Credit Pack',
      externalIds: { vendor: '65322600CA' },
      terms: { model: 'one-time', period: 'one-time' },
    },
  },
  priceListItem('ITM-4', 'Held Item', '65322599CA'),
];

const renderDialog = ({
  isOpen = true,
  onClose = jest.fn(),
  onAdd = jest.fn(),
  excludedSkus = new Set(['65322599CA']),
  recommendedSkus = new Set(['65304578CA']),
}: {
  isOpen?: boolean;
  onClose?: () => void;
  onAdd?: (items: unknown[]) => void;
  excludedSkus?: Set<string>;
  recommendedSkus?: Set<string>;
} = {}) =>
  render(
    <SelectItemsDialog
      isOpen={isOpen}
      onClose={onClose}
      agreementId="AGR-1234-5678"
      excludedSkus={excludedSkus}
      recommendedSkus={recommendedSkus}
      currency="USD"
      onAdd={onAdd}
    />,
  );

describe('SelectItemsDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPriceListItems = { status: 'success', error: null, data: ITEMS, refresh: mockRefresh };
    lastAgreementId = undefined;
    lastRecommendedSkus = undefined;
  });

  it('only fetches the price list while open', () => {
    renderDialog({ isOpen: false });

    expect(lastAgreementId).toBe('');

    renderDialog();

    expect(lastAgreementId).toBe('AGR-1234-5678');
    expect(lastRecommendedSkus).toEqual(new Set(['65304578CA']));
  });

  it('shows the picker note and the price list items', () => {
    const { getByText, getByTestId } = renderDialog();

    expect(getByText('Select items')).toBeTruthy();
    expect(getByText(/Your specific conditions will be applied/)).toBeTruthy();
    expect(getByTestId('row-ITM-1')).toBeTruthy();
    expect(getByText('Photoshop for Enterprise')).toBeTruthy();
    expect(getByTestId('row-ITM-1').textContent).toContain('USD 234.00');
    expect(getByTestId('row-ITM-1').textContent).toContain('USD 19.50');
  });

  it('keeps held and one-time items out of the picker', () => {
    const { queryByTestId } = renderDialog();

    expect(queryByTestId('row-ITM-3')).toBeNull();
    expect(queryByTestId('row-ITM-4')).toBeNull();
  });

  it('badges the items Adobe recommends', () => {
    const { getByTestId } = renderDialog();

    expect(getByTestId('row-ITM-2').textContent).toContain('Yes');
    expect(getByTestId('row-ITM-1').textContent).not.toContain('Yes');
  });

  it('adds the selected items with a starting quantity of one', () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = renderDialog({ onAdd, onClose });

    const addButton = getByTestId('select-items-add') as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.click(getByTestId('select-ITM-2'));
    expect((getByTestId('select-items-add') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(getByTestId('select-items-add'));

    expect(onAdd).toHaveBeenCalledWith([
      {
        itemId: 'ITM-2',
        itemName: 'Premiere Pro for Enterprise',
        sku: '65304578CA',
        terms: { model: 'quantity', period: '1y', commitment: '1y' },
        unitSP: 234,
        quantity: 1,
        recommended: true,
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without adding anything', () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = renderDialog({ onAdd, onClose });

    fireEvent.click(getByTestId('select-items-close'));

    expect(onClose).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows the loader while the price list loads', () => {
    mockPriceListItems = { status: 'loading', error: null, data: [], refresh: mockRefresh };
    const { getByTestId, queryByTestId } = renderDialog();

    expect(getByTestId('loader')).toBeTruthy();
    expect(queryByTestId('grid')).toBeNull();
  });

  it('offers a retry when the price list cannot be loaded', () => {
    mockPriceListItems = {
      status: 'error',
      error: 'Marketplace unavailable',
      data: [],
      refresh: mockRefresh,
    };
    const { getByText, getByTestId } = renderDialog();

    expect(getByText('Marketplace unavailable')).toBeTruthy();

    fireEvent.click(getByTestId('select-items-retry'));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('keeps the paging config identity stable across re-renders', () => {
    const { getByTestId } = renderDialog();
    const initialPaging = capturedConfig.paging;

    // Toggling a selection re-renders the dialog; a fresh paging object would
    // make the grid reset to page one and dead-lock the pagination controls.
    fireEvent.click(getByTestId('select-ITM-2'));

    expect(capturedConfig.paging).toBe(initialPaging);
  });

  it('backs every configured grid field with a row property', () => {
    renderDialog();

    // Sorting and filtering resolve fields against the rows by name, so a
    // field without a matching row property fails silently (e.g. the default
    // sort by 'item').
    expect(capturedRows.length).toBeGreaterThan(0);
    for (const field of capturedConfig.fields) {
      for (const row of capturedRows) {
        expect(row).toHaveProperty(field.name);
      }
    }
  });

  it('leaves the checkbox column unheaded and splits the item column', () => {
    renderDialog();

    const columns = Object.fromEntries(
      capturedConfig.columns.map((column) => [column.name, column]),
    );
    expect(columns.select.title).toBe('');
    expect(columns.item.fields).toEqual(['item', 'id', 'sku']);
    expect(columns.terms.fields).toEqual(['terms', 'commitment']);
  });

  it('feeds numeric grid fields with numbers', () => {
    renderDialog();

    const numericFields = capturedConfig.fields.filter((field) => field.type === 'number');
    expect(numericFields.length).toBeGreaterThan(0);
    for (const field of numericFields) {
      for (const row of capturedRows) {
        const value = row[field.name];
        expect(value === null || typeof value === 'number').toBe(true);
      }
    }
  });

  it('pages the picker ten items at a time', () => {
    renderDialog();

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 10, total: 2 });
    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'select',
      'item',
      'recommended',
      'billingModel',
      'terms',
      'unitLP',
      'unitSP',
      'spxM',
      'spxY',
    ]);
  });
});

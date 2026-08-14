import { ReactNode } from 'react';

import { act, render } from '@testing-library/react';

import { ReviewOrderStep } from './ReviewOrderStep';
import type { Agreement, Subscription } from '../../shared/model';
import type {
  NetNewItem,
  OrderDetails,
  RenewalQuantities,
  RenewalSelections,
} from '../model';

interface NavProps {
  currentStepIndex: number;
  targetStepIndex: number;
}

let registeredOnNext: ((props: NavProps) => Promise<number> | number) | undefined;
const registerOnNextCallback = jest.fn((callback: (props: NavProps) => Promise<number> | number) => {
  registeredOnNext = callback;
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback }),
}));

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
  useGridInMemory: (data: TestRow[], config: GridConfig) => ({ data, config }),
}));

interface MockLinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
}

jest.mock('../../shared/components/LinkReference/LinkReference', () => ({
  LinkReference: ({ text, secondaryContent }: MockLinkReferenceProps) => (
    <div>
      <span>{text}</span>
      <span>{secondaryContent}</span>
    </div>
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/tabs', () => {
  const Tab = ({ title, children }: { title: string; children?: ReactNode }) => (
    <div>
      <span>{title}</span>
      {children}
    </div>
  );
  Tab.Content = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Tab,
  };
});

const AGREEMENT: Agreement = {
  id: 'AGR-1',
  name: 'Agreement Name',
};

const SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'SUB-1',
    name: 'Subscription One',
    autoRenew: true,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-1',
        quantity: 10,
        item: { id: 'ITM-1', name: 'Item One', externalIds: { vendor: 'OFFER-1' } },
        price: { unitSP: 120 },
      },
    ],
  },
  {
    id: 'SUB-2',
    name: 'Subscription Two',
    autoRenew: false,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-2',
        quantity: 4,
        item: { id: 'ITM-2', name: 'Item Two', externalIds: { vendor: 'OFFER-2' } },
        price: { unitSP: 60 },
      },
    ],
  },
];

const NET_NEW_ITEM: NetNewItem = {
  itemId: 'ITM-3',
  itemName: 'Item Three',
  sku: 'OFFER-3',
  terms: { period: '1y', commitment: '1y' },
  unitSP: 240,
  quantity: 2,
  recommended: false,
};

const renderStep = ({
  selections = {} as RenewalSelections,
  quantities = {} as RenewalQuantities,
  netNewItems = [] as NetNewItem[],
  details = { externalId: '', notes: '' } as OrderDetails,
  onPlaceOrder = jest.fn().mockResolvedValue(true),
  errorMessage = '',
  isSubmitting = false,
} = {}) =>
  render(
    <ReviewOrderStep
      agreement={AGREEMENT}
      subscriptions={SUBSCRIPTIONS}
      selections={selections}
      quantities={quantities}
      netNewItems={netNewItems}
      details={details}
      onPlaceOrder={onPlaceOrder}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
    />,
  );

describe('ReviewOrderStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registeredOnNext = undefined;
  });

  it('renders the heading, the highlights and the three tabs', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Review order')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByText('Items')).toBeTruthy();
    expect(getByText('Parameters')).toBeTruthy();
    expect(getByText('Details')).toBeTruthy();
  });

  it('prices a renewing subscription from its renewal quantity', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 6 } });

    const row = getByTestId('row-SUB-1');
    expect(row.textContent).toContain('Item One');
    expect(row.textContent).toContain('60.00');
    expect(row.textContent).toContain('720.00');
  });

  it('keeps a lapsing subscription in the grid with an em dash instead of a quantity', () => {
    const { getByTestId } = renderStep();

    const row = getByTestId('row-SUB-2');
    expect(row.textContent).toContain('Item Two');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('240.00');
  });

  it('lists a net-new product as a new line', () => {
    const { getByTestId } = renderStep({ netNewItems: [NET_NEW_ITEM] });

    const row = getByTestId('row-ITM-3');
    expect(row.textContent).toContain('Item Three');
    expect(row.textContent).toContain('New');
    expect(row.textContent).toContain('480.00');
  });

  it('numbers the lines and totals the order in the last row', () => {
    const { getByTestId } = renderStep({
      quantities: { 'SUB-1': 6 },
      netNewItems: [NET_NEW_ITEM],
    });

    expect(getByTestId('row-SUB-1').textContent).toContain('1');
    expect(getByTestId('row-ITM-3').textContent).toContain('3');
    const total = getByTestId('row-order-price');
    expect(total.textContent).toContain('Order price *');
    expect(total.textContent).toContain('Items price *');
    expect(total.textContent).toContain('1,200.00');
  });

  it('totals numerically across values above and below a thousand', () => {
    const { getByTestId } = renderStep({
      quantities: { 'SUB-1': 12 },
      netNewItems: [{ ...NET_NEW_ITEM, unitSP: 5, quantity: 1 }],
    });

    // 12 x 120 yearly plus 1 x 5 yearly, summed as numbers rather than strings.
    expect(getByTestId('row-order-price').textContent).toContain('1,445.00');
  });

  it('shows the captured order details on the details tab', () => {
    const { getByText } = renderStep({
      details: { externalId: 'PO-1', notes: 'Renew everything' },
    });

    expect(getByText('PO-1')).toBeTruthy();
    expect(getByText('Renew everything')).toBeTruthy();
  });

  it('advances once the order is placed', async () => {
    const onPlaceOrder = jest.fn().mockResolvedValue(true);
    renderStep({ onPlaceOrder });

    let target: number | undefined;
    await act(async () => {
      target = await registeredOnNext!({ currentStepIndex: 5, targetStepIndex: 6 });
    });

    expect(onPlaceOrder).toHaveBeenCalled();
    expect(target).toBe(6);
  });

  it('stays on the step when the order is rejected', async () => {
    const onPlaceOrder = jest.fn().mockResolvedValue(false);
    renderStep({ onPlaceOrder });

    let target: number | undefined;
    await act(async () => {
      target = await registeredOnNext!({ currentStepIndex: 5, targetStepIndex: 6 });
    });

    expect(target).toBe(5);
  });

  it('surfaces the submission error and the in-flight notice', () => {
    const { getByTestId } = renderStep({
      errorMessage: 'The renewal would breach your three-year commitment.',
      isSubmitting: true,
    });

    expect(getByTestId('review-order-step-error').textContent).toContain(
      'The renewal would breach your three-year commitment.',
    );
    expect(getByTestId('review-order-step-submitting')).toBeTruthy();
  });
});

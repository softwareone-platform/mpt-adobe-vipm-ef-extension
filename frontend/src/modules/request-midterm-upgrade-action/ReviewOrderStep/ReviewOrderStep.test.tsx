import { ReactNode } from 'react';

import { render } from '@testing-library/react';

import { ReviewOrderStep } from './ReviewOrderStep';
import { Order, TargetSubscription } from '../model';

interface CapturedConfig {
  id: string;
  columns: { name: string }[];
  fields: { name: string }[];
  paging: { page: number; pageSize: number; total: number };
}

let capturedRows: TargetSubscription[];
let capturedConfig: CapturedConfig;
let registeredOnNext: ((properties: { currentStepIndex: number; targetStepIndex: number }) => number) | undefined;

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: () => <div data-testid="grid" />,
  GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useGridInMemory: (rows: TargetSubscription[], config: CapturedConfig) => {
    capturedRows = rows;
    capturedConfig = config;
    return { rows, config };
  },
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({
    registerOnNextCallback: (callback: typeof registeredOnNext) => {
      registeredOnNext = callback;
    },
  }),
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

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

const order: Order = { id: 'ORD-1111-1111' };

const subscriptions: TargetSubscription[] = [
  {
    id: 'SUB-1525-6036-0087',
    name: 'Subscription for Illustrator',
    status: 'Active',
    item: { id: 'ITM-0520-2723-0405', name: 'Illustrator for Teams', externalId: 'AO03.25470.MN | 30002000CB' },
    recommended: true,
    currentQuantity: 7,
    newQuantity: 7,
    delta: 0,
    unitSP: '179.88',
    spxM: '104.93',
    spxY: '1,259.16',
    terms: 'Yearly billing',
    commitment: '1 year commitment',
  },
  {
    id: null,
    name: null,
    status: '',
    item: { id: 'ITM-0520-2723-0406', name: 'Illustrator for Enterprise', externalId: 'AO03.25471.MN | 30002000CC' },
    recommended: false,
    currentQuantity: 0,
    newQuantity: 7,
    delta: 7,
    unitSP: '234.00',
    spxM: '136.50',
    spxY: '1,638.00',
    terms: 'Yearly billing',
    commitment: '1 year commitment',
  },
];

describe('ReviewOrderStep', () => {
  it('renders the heading, highlights and grid', () => {
    const { getByText, getByTestId } = render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    expect(getByText('Review order')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('grid')).toBeTruthy();
  });

  it('renders the Items, Parameters and Details tabs', () => {
    const { getByText } = render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    expect(getByText('Items')).toBeTruthy();
    expect(getByText('Parameters')).toBeTruthy();
    expect(getByText('Details')).toBeTruthy();
    expect(getByText('No parameters to display.')).toBeTruthy();
  });

  it('feeds the grid the subscriptions followed by an order price total row', () => {
    render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    expect(capturedRows).toHaveLength(subscriptions.length + 1);
    expect(capturedRows[0]).toMatchObject({ id: 'SUB-1525-6036-0087' });

    const total = capturedRows[capturedRows.length - 1];
    expect(total).toMatchObject({
      id: 'order-price',
      isSummary: true,
      summaryTitle: 'Order price *',
      summarySubtitle: 'Items price *',
      spxM: '241.43',
      spxY: '2,897.16',
    });
  });

  it('configures the expected columns and pages all rows on one page', () => {
    render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'rowNumber',
      'item',
      'subscription',
      'terms',
      'delta',
      'unitSP',
      'spxM',
      'spxY',
    ]);
    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 3, total: 3 });
  });

  it('advances to the next step when placing the order', () => {
    render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    expect(registeredOnNext).toBeDefined();
    expect(registeredOnNext!({ currentStepIndex: 4, targetStepIndex: 5 })).toBe(5);
  });
});

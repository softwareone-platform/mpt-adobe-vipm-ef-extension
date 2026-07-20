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
let registeredOnNext:
  | ((properties: { currentStepIndex: number; targetStepIndex: number }) => Promise<number> | number)
  | undefined;

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

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ status, children }: { status: string; children?: ReactNode }) => (
    <div data-testid={`notification-${status}`}>{children}</div>
  ),
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

  it('shows the order additional id and notes in the Details tab', () => {
    const detailedOrder: Order = {
      id: 'ORD-1111-1111',
      externalIds: { client: 'PO-12345' },
      notes: 'Please expedite',
    };
    const { getByText } = render(
      <ReviewOrderStep subscription={{ id: 'SUB-1' }} order={detailedOrder} subscriptions={subscriptions} />,
    );

    expect(getByText('Additional ID')).toBeTruthy();
    expect(getByText('PO-12345')).toBeTruthy();
    expect(getByText('Notes')).toBeTruthy();
    expect(getByText('Please expedite')).toBeTruthy();
  });

  it('falls back to an em dash when the order has no additional id or notes', () => {
    const { getAllByText } = render(
      <ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />,
    );

    expect(getAllByText('—')).toHaveLength(2);
  });

  it('lists the non-hidden agreement ordering parameters in the Parameters tab', () => {
    const subscription = {
      id: 'SUB-1',
      agreement: {
        id: 'AGR-1',
        parameters: {
          ordering: [
            { id: 'PAR-1', name: 'Company Name', displayValue: 'Dummy Company', constraints: { hidden: false } },
            { id: 'PAR-2', name: 'Agreement type', displayValue: 'New' },
            { id: 'PAR-3', name: '3-year commitment' },
            { id: 'PAR-4', name: 'MembershipId', displayValue: 'MEM-9', constraints: { hidden: true } },
          ],
        },
      },
    };
    const { getByText, queryByText, getAllByText } = render(
      <ReviewOrderStep subscription={subscription} order={order} subscriptions={subscriptions} />,
    );

    expect(getByText('Company Name')).toBeTruthy();
    expect(getByText('Dummy Company')).toBeTruthy();
    expect(getByText('Agreement type')).toBeTruthy();
    expect(getByText('New')).toBeTruthy();
    expect(getByText('3-year commitment')).toBeTruthy();
    expect(getAllByText('—').length).toBeGreaterThan(0);
    expect(queryByText('MembershipId')).toBeNull();
    expect(queryByText('No parameters to display.')).toBeNull();
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

  it('advances to the next step when the order is placed successfully', async () => {
    const onPlaceOrder = jest.fn().mockResolvedValue(true);
    render(
      <ReviewOrderStep
        subscription={{ id: 'SUB-1' }}
        order={order}
        subscriptions={subscriptions}
        onPlaceOrder={onPlaceOrder}
      />,
    );

    expect(registeredOnNext).toBeDefined();
    await expect(registeredOnNext!({ currentStepIndex: 4, targetStepIndex: 5 })).resolves.toBe(5);
    expect(onPlaceOrder).toHaveBeenCalledTimes(1);
  });

  it('stays on the review step when placing the order fails', async () => {
    const onPlaceOrder = jest.fn().mockResolvedValue(false);
    render(
      <ReviewOrderStep
        subscription={{ id: 'SUB-1' }}
        order={order}
        subscriptions={subscriptions}
        onPlaceOrder={onPlaceOrder}
      />,
    );

    await expect(registeredOnNext!({ currentStepIndex: 4, targetStepIndex: 5 })).resolves.toBe(4);
  });

  it('advances without submitting when no place-order handler is wired', async () => {
    render(<ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />);

    await expect(registeredOnNext!({ currentStepIndex: 4, targetStepIndex: 5 })).resolves.toBe(5);
  });

  it('shows the error notification when an error message is provided', () => {
    const { getByTestId, getByText } = render(
      <ReviewOrderStep
        subscription={{ id: 'SUB-1' }}
        order={order}
        subscriptions={subscriptions}
        errorMessage="Adobe rejected the switch preview."
      />,
    );

    expect(getByTestId('notification-error')).toBeTruthy();
    expect(getByText('Adobe rejected the switch preview.')).toBeTruthy();
  });

  it('hides the error notification when there is no error message', () => {
    const { queryByTestId } = render(
      <ReviewOrderStep subscription={{ id: 'SUB-1' }} order={order} subscriptions={subscriptions} />,
    );

    expect(queryByTestId('notification-error')).toBeNull();
  });

  it('shows the submitting indicator while the order is being placed', () => {
    const { getByTestId } = render(
      <ReviewOrderStep
        subscription={{ id: 'SUB-1' }}
        order={order}
        subscriptions={subscriptions}
        isSubmitting
      />,
    );

    expect(getByTestId('review-order-step-submitting')).toBeTruthy();
  });
});

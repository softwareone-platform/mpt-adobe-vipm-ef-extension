import { ReactNode } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import App from './App';

const mockClose = jest.fn();
let mockActiveStepIndex = 0;

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  useMPTContext: () => ({
    auth: { account: { type: 'Client' } },
    data: { subscription: { id: 'SUB-1' } },
  }),
}), { virtual: true });

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn().mockResolvedValue({
      data: {
        data: {
          id: 'SUB-1',
          splitStatus: 'Active',
          split: {
            id: 'SBS-1111-1111',
            revision: 1,
            allocations: [
              {
                buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
                percentage: 100,
                price: { currency: 'USD', SPxY: 100, SPxM: 10 },
              },
            ],
          },
          agreement: {
            id: 'AGR-1',
            split: {
              id: 'SBA-1111-1111',
              revision: 1,
              allocations: [
                {
                  buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
                  percentage: 100,
                  price: { currency: 'USD', SPxY: 100, SPxM: 10 },
                },
                {
                  buyer: { id: 'BUY-2222-2222', name: 'Second Buyer Name' },
                  percentage: 0,
                  price: { currency: 'USD', SPxY: 0, SPxM: 0 },
                },
              ],
            },
          },
          product: { id: 'PRD-1' },
          lines: [{ quantity: 10 }],
        },
      },
    }),
    get: jest.fn().mockResolvedValue({
      data: { data: { products: [{ id: 'PRD-1', segment: 'COM' }] } },
    }),
  },
}), { virtual: true });

const defaultOfferData = {
  productUpgrades: [
    {
      targetList: [
        { targetBaseOfferId: '65322651CA02A12', sequence: 1, switchType: 'PARTIAL_ALLOWED' },
      ],
    },
  ],
};
const mockOfferResult: { status: string; error: string | null; data: unknown; refresh: () => void } = {
  status: 'success',
  error: null,
  data: defaultOfferData,
  refresh: () => {},
};
jest.mock('../shared/hooks/useAdobeOffer', () => ({
  useAdobeOffer: () => mockOfferResult,
}));

let mockRecommendation: { status: string; error: string | null; data: unknown; refresh: () => void } = {
  status: 'idle',
  error: null,
  data: null,
  refresh: () => {},
};
jest.mock('../shared/hooks/useAdobeRecommendation', () => ({
  useAdobeRecommendation: () => mockRecommendation,
}));

interface MockChildren {
  children?: ReactNode | ((args: { activeStepIndex: number }) => ReactNode);
}
interface MockWizardProps extends MockChildren {
  onClose?: () => void;
  isToDisableSideNavigation?: boolean;
}
let wizardProps: MockWizardProps;

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => {
  const Wizard = (props: MockWizardProps) => {
    wizardProps = props;
    const { children, onClose } = props;
    return (
      <div>
        {children as ReactNode}
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
  Wizard.Header = ({ children }: MockChildren) => <div>{children as ReactNode}</div>;
  const Content = ({ children }: MockChildren) => <div>{children as ReactNode}</div>;
  Content.Steps = () => <div />;
  Content.StepContent = ({ children }: MockChildren) => (
    <div>
      {typeof children === 'function' ? children({ activeStepIndex: mockActiveStepIndex }) : children}
    </div>
  );
  Wizard.Content = Content;
  Wizard.Actions = () => <div />;
  return { Wizard };
});

jest.mock('./UpgradeFromStep', () => ({
  UpgradeFromStep: () => <div>Upgrade from step</div>,
}));

interface UpgradeToProps {
  subscriptions: unknown;
  onSubscriptionsChange: (subscriptions: unknown[]) => void;
  onSelectedTargetChange: (target: unknown) => void;
}
let upgradeToProps: UpgradeToProps;

jest.mock('./UpgradeToStep', () => ({
  UpgradeToStep: (props: UpgradeToProps) => {
    upgradeToProps = props;
    return <div>Upgrade to step</div>;
  },
}));

interface SplitBillingProps {
  addBuyerToOrder: (buyer: { id?: string }) => Promise<void>;
  selectedBuyer: unknown;
  onChange: (buyer: unknown) => void;
  split: { id?: string; allocations?: unknown[] } | null;
  agreementSplit: { id?: string; allocations?: unknown[] } | null;
  order: { billTo?: { id?: string; name?: string } | null };
}
let splitBillingProps: SplitBillingProps;

jest.mock('./SplitBillingStep', () => ({
  SplitBillingStep: (props: SplitBillingProps) => {
    splitBillingProps = props;
    return <div>Split billing step</div>;
  },
}));

interface DetailsProps {
  order: unknown;
  setOrder: (order: unknown) => void;
}
let detailsProps: DetailsProps;

jest.mock('./DetailsStep', () => ({
  DetailsStep: (props: DetailsProps) => {
    detailsProps = props;
    return <div>Details step</div>;
  },
}));

interface ReviewOrderProps {
  order: unknown;
  subscriptions: unknown;
  onPlaceOrder: () => Promise<boolean>;
  errorMessage?: string;
}
let reviewOrderProps: ReviewOrderProps;

jest.mock('./ReviewOrderStep', () => ({
  ReviewOrderStep: (props: ReviewOrderProps) => {
    reviewOrderProps = props;
    return <div>Review order step</div>;
  },
}));

interface SummaryProps {
  order: unknown;
}
let summaryProps: SummaryProps;

jest.mock('./SummaryStep', () => ({
  SummaryStep: (props: SummaryProps) => {
    summaryProps = props;
    return <div>Summary step</div>;
  },
}));

jest.mock('../shared/components/Loader/Loader', () => ({
  Loader: () => <div data-testid="loader" />,
}));

interface MockButtonProps {
  children: ReactNode;
  onClick?: () => void;
}
interface MockNotificationProps {
  status: string;
  children: ReactNode;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick }: MockButtonProps) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ status, children }: MockNotificationProps) => (
    <div data-testid={`notification-${status}`}>{children}</div>
  ),
}));

describe('request-midterm-upgrade-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    (http.post as jest.Mock).mockClear();
    mockActiveStepIndex = 0;
    mockOfferResult.data = defaultOfferData;
    mockRecommendation = { status: 'idle', error: null, data: null, refresh: jest.fn() };
  });

  it('renders the wizard header and the upgrade-from step once loaded', async () => {
    render(<App />);

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.getByText('Upgrade from step')).toBeTruthy();
  });

  it('renders the upgrade-to step on the second step and wires its subscriptions', async () => {
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    expect(screen.queryByText('Upgrade from step')).toBeNull();
    expect(upgradeToProps.subscriptions).toBeDefined();
  });

  it('renders the split-billing step on the third step and wires its props', async () => {
    mockActiveStepIndex = 2;
    render(<App />);

    expect(await screen.findByText('Split billing step')).toBeTruthy();
    expect(typeof splitBillingProps.addBuyerToOrder).toBe('function');
    expect(typeof splitBillingProps.onChange).toBe('function');
    expect(splitBillingProps.selectedBuyer).toBeDefined();
    expect(splitBillingProps.split?.id).toBe('SBS-1111-1111');
    expect(splitBillingProps.agreementSplit?.id).toBe('SBA-1111-1111');
    expect(splitBillingProps.agreementSplit?.allocations).toHaveLength(2);
  });

  it('bills the order to a buyer the subscription has no allocation for', async () => {
    mockActiveStepIndex = 2;
    render(<App />);
    await screen.findByText('Split billing step');

    await act(async () => {
      await splitBillingProps.addBuyerToOrder({ id: 'BUY-2222-2222' });
    });

    expect(splitBillingProps.order.billTo).toEqual({
      id: 'BUY-2222-2222',
      name: 'Second Buyer Name',
    });
  });

  it('skips the split-billing step when split billing is disabled', async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      data: { data: { id: 'SUB-1', splitStatus: 'Disabled', product: { id: 'PRD-1' } } },
    });
    mockActiveStepIndex = 2;
    render(<App />);

    expect(await screen.findByText('Details step')).toBeTruthy();
    expect(screen.queryByText('Split billing step')).toBeNull();
  });

  it('renders the details step on the fourth step and wires its props', async () => {
    mockActiveStepIndex = 3;
    render(<App />);

    expect(await screen.findByText('Details step')).toBeTruthy();
    expect(detailsProps.order).toBeDefined();
    expect(typeof detailsProps.setOrder).toBe('function');
  });

  it('renders the review-order step on the fifth step and wires its props', async () => {
    mockActiveStepIndex = 4;
    render(<App />);

    expect(await screen.findByText('Review order step')).toBeTruthy();
    expect(reviewOrderProps.order).toBeDefined();
    expect(reviewOrderProps.subscriptions).toBeDefined();
  });

  it('applies the subscription terms to the target rows', async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      data: {
        data: {
          id: 'SUB-1',
          splitStatus: 'Active',
          agreement: { id: 'AGR-1' },
          product: { id: 'PRD-1' },
          terms: { period: '1y', commitment: '1y' },
          lines: [{ quantity: 10 }],
        },
      },
    });
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    await waitFor(() => {
      const rows = upgradeToProps.subscriptions as { terms: string; commitment: string }[];
      expect(rows[0]).toMatchObject({ terms: 'Yearly billing', commitment: '1 year commitment' });
    });
  });

  it('falls back to an em dash for missing or unknown term codes', async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      data: {
        data: {
          id: 'SUB-1',
          splitStatus: 'Active',
          agreement: { id: 'AGR-1' },
          product: { id: 'PRD-1' },
          terms: { period: 'unknown', commitment: null },
          lines: [{ quantity: 10 }],
        },
      },
    });
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    await waitFor(() => {
      const rows = upgradeToProps.subscriptions as { terms: string; commitment: string }[];
      expect(rows[0]).toMatchObject({ terms: '—', commitment: '—' });
    });
  });

  it('assigns a target already held on the agreement to its existing subscription', async () => {
    mockOfferResult.data = {
      productUpgrades: [
        {
          targetList: [
            {
              targetBaseOfferId: '65322651CA02A12',
              sequence: 1,
              switchType: 'PARTIAL_ALLOWED',
              item: { id: 'ITM-TARGET', name: 'Target Item', externalId: '65322651CA', unitSP: 200 },
              subscription: { id: 'SUB-EXISTING', name: 'Existing sub', status: 'Active', quantity: 20 },
            },
          ],
        },
      ],
    };
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    await waitFor(() => {
      const rows = upgradeToProps.subscriptions as Array<Record<string, unknown>>;
      expect(rows[0]).toMatchObject({
        id: 'SUB-EXISTING',
        name: 'Existing sub',
        status: 'Active',
        currentQuantity: 20,
        newQuantity: 30,
        delta: 10,
      });
    });
  });

  it('sends the switched quantity, not the topped-up total, when the target subscription exists', async () => {
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();

    const selectedTarget = {
      id: 'SUB-EXISTING',
      name: 'Existing sub',
      status: 'Active',
      item: { id: 'ITM-TARGET', name: 'Creative Cloud All Apps', externalId: '65322651CA' },
      targetBaseOfferId: '65322651CA02A12',
      recommended: false,
      currentQuantity: 20,
      newQuantity: 26,
      delta: 6,
      unitSP: '',
      spxM: '',
      spxY: '',
      terms: '',
      commitment: '',
    };
    act(() => {
      upgradeToProps.onSubscriptionsChange([selectedTarget]);
      upgradeToProps.onSelectedTargetChange(selectedTarget);
    });
    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewOrderProps.onPlaceOrder();
    });

    expect(placed).toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions/SUB-1/upgrade-order',
      {
        targetOfferId: '65322651CA02A12',
        quantity: 6,
        recommendationTrackerId: '',
        notes: '',
        externalIds: { client: '' },
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('prepends a source subscription row decremented by the moved quantity', async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      data: {
        data: {
          id: 'SUB-1',
          name: 'Source Subscription',
          status: 'Active',
          splitStatus: 'Active',
          agreement: { id: 'AGR-1' },
          product: { id: 'PRD-1' },
          terms: { period: '1y', commitment: '1y' },
          lines: [
            {
              quantity: 10,
              item: { id: 'ITM-1', name: 'Source Item', externalIds: { vendor: 'SKU-1' } },
              price: { unitSP: 100 },
            },
          ],
        },
      },
    });
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();

    const target = {
      id: null,
      name: null,
      status: '',
      item: { id: 'ITM-2', name: 'Target Item', externalId: 'SKU-2' },
      targetBaseOfferId: 'OFFER-1',
      recommended: false,
      currentQuantity: 0,
      newQuantity: 8,
      delta: 8,
      unitSP: '200.00',
      spxM: '133.33',
      spxY: '1,600.00',
      terms: 'Yearly billing',
      commitment: '1 year commitment',
    };
    act(() => {
      upgradeToProps.onSubscriptionsChange([target]);
      upgradeToProps.onSelectedTargetChange(target);
    });
    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    const rows = reviewOrderProps.subscriptions as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'SUB-1',
      item: { id: 'ITM-1', name: 'Source Item', externalId: 'SKU-1' },
      currentQuantity: 10,
      newQuantity: 2,
      delta: -8,
      unitSP: '100.00',
      spxM: '-66.67',
      spxY: '-800.00',
      terms: 'Yearly billing',
      commitment: '1 year commitment',
    });
    expect(rows[1]).toMatchObject({ item: { id: 'ITM-2' }, delta: 8 });
  });

  it('places the upgrade order with the selection and the recommendation tracker id', async () => {
    mockRecommendation = {
      status: 'success',
      error: null,
      data: { productRecommendations: { upsells: [], crossSells: [], addOns: [] }, xRecommendationTrackerId: 'TRACKER-1' },
      refresh: jest.fn(),
    };
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();

    const selectedTarget = {
      id: null,
      name: null,
      status: '',
      item: { id: 'ITM-TARGET', name: 'Creative Cloud All Apps', externalId: '65322651CA' },
      targetBaseOfferId: '65322651CA02A12',
      recommended: true,
      currentQuantity: 0,
      newQuantity: 6,
      delta: 6,
      unitSP: '',
      spxM: '',
      spxY: '',
      terms: '',
      commitment: '',
    };
    act(() => {
      upgradeToProps.onSubscriptionsChange([selectedTarget]);
      upgradeToProps.onSelectedTargetChange(selectedTarget);
    });
    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewOrderProps.onPlaceOrder();
    });

    expect(placed).toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions/SUB-1/upgrade-order',
      {
        targetOfferId: '65322651CA02A12',
        quantity: 6,
        recommendationTrackerId: 'TRACKER-1',
        notes: '',
        externalIds: { client: '' },
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('places the upgrade order with the notes and additional id entered in the details step', async () => {
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();

    const selectedTarget = {
      id: null,
      name: null,
      status: '',
      item: { id: 'ITM-TARGET', name: 'Creative Cloud All Apps', externalId: '65322651CA' },
      targetBaseOfferId: '65322651CA02A12',
      recommended: false,
      currentQuantity: 0,
      newQuantity: 6,
      delta: 6,
      unitSP: '',
      spxM: '',
      spxY: '',
      terms: '',
      commitment: '',
    };
    act(() => {
      upgradeToProps.onSubscriptionsChange([selectedTarget]);
      upgradeToProps.onSelectedTargetChange(selectedTarget);
    });
    mockActiveStepIndex = 3;
    rerender(<App />);
    expect(await screen.findByText('Details step')).toBeTruthy();
    act(() => {
      detailsProps.setOrder({
        ...(detailsProps.order as object),
        notes: 'Upgrade for the design team',
        externalIds: { client: '234234234' },
      });
    });
    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewOrderProps.onPlaceOrder();
    });

    expect(placed).toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions/SUB-1/upgrade-order',
      {
        targetOfferId: '65322651CA02A12',
        quantity: 6,
        recommendationTrackerId: '',
        notes: 'Upgrade for the design team',
        externalIds: { client: '234234234' },
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('blocks placing the order and surfaces an error when no target is selected', async () => {
    mockActiveStepIndex = 4;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewOrderProps.onPlaceOrder();
    });
    rerender(<App />);

    expect(placed).toBe(false);
    expect(reviewOrderProps.errorMessage).toBe(
      'Select an item to continue.',
    );
    const upgradeOrderCalls = (http.post as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes('/upgrade-order'),
    );
    expect(upgradeOrderCalls).toHaveLength(0);
  });

  it('surfaces the backend error detail when order creation fails', async () => {
    (http.post as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'SUB-1',
            splitStatus: 'Active',
            agreement: { id: 'AGR-1' },
            product: { id: 'PRD-1' },
            lines: [{ quantity: 10 }],
          },
        },
      })
      .mockRejectedValueOnce({
        response: { data: { detail: 'Adobe rejected the switch preview.' } },
      });
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();

    const selectedTarget = {
      id: null,
      name: null,
      status: '',
      item: { id: 'ITM-TARGET', name: 'Creative Cloud All Apps', externalId: '65322651CA' },
      targetBaseOfferId: '65322651CA02A12',
      recommended: false,
      currentQuantity: 0,
      newQuantity: 6,
      delta: 6,
      unitSP: '',
      spxM: '',
      spxY: '',
      terms: '',
      commitment: '',
    };
    act(() => {
      upgradeToProps.onSubscriptionsChange([selectedTarget]);
      upgradeToProps.onSelectedTargetChange(selectedTarget);
    });
    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewOrderProps.onPlaceOrder();
    });
    rerender(<App />);

    expect(placed).toBe(false);
    expect(reviewOrderProps.errorMessage).toBe('Adobe rejected the switch preview.');
  });

  it('never allows side navigation, so only back and next move the wizard', async () => {
    mockActiveStepIndex = 1;
    const { rerender } = render(<App />);
    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    expect(wizardProps.isToDisableSideNavigation).toBe(true);

    mockActiveStepIndex = 4;
    rerender(<App />);
    expect(await screen.findByText('Review order step')).toBeTruthy();
    expect(wizardProps.isToDisableSideNavigation).toBe(true);
  });

  it('renders the summary step on the sixth step and wires its order', async () => {
    mockActiveStepIndex = 5;
    render(<App />);

    expect(await screen.findByText('Summary step')).toBeTruthy();
    expect(summaryProps.order).toBeDefined();
  });

  it('renders no step content for an unknown step index', async () => {
    mockActiveStepIndex = 6;
    render(<App />);

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.queryByText('Upgrade from step')).toBeNull();
    expect(screen.queryByText('Upgrade to step')).toBeNull();
    expect(screen.queryByText('Split billing step')).toBeNull();
    expect(screen.queryByText('Details step')).toBeNull();
    expect(screen.queryByText('Review order step')).toBeNull();
    expect(screen.queryByText('Summary step')).toBeNull();
  });

  it('closes when the wizard close action is clicked', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Close'));

    expect(mockClose).toHaveBeenCalled();
  });

  it('shows the error state when no subscription is returned', async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({ data: { data: null } });
    render(<App />);

    expect(await screen.findByTestId('notification-error')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.queryByTestId('loader')).toBeNull();
  });

  it('surfaces a sync error and recovers on retry', async () => {
    (http.post as jest.Mock).mockRejectedValueOnce(new Error('Sync boom'));
    render(<App />);

    expect(await screen.findByTestId('notification-error')).toBeTruthy();
    expect(screen.getByText('Sync boom')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.queryByTestId('notification-error')).toBeNull();
  });

  it('shows an error state when settings fail to load and recovers on retry', async () => {
    (http.get as jest.Mock).mockRejectedValueOnce(new Error('Settings boom'));
    render(<App />);

    expect(await screen.findByText('Settings could not be loaded.')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.queryByText('Settings could not be loaded.')).toBeNull();
  });
});

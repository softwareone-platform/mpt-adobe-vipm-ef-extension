import { ReactNode } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import App from './App';
import type { RenewalPathState } from '../shared/model';

const mockClose = jest.fn();
let mockActiveStepIndex = 0;
let mockAccountType = 'Client';

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  useMPTContext: () => ({
    auth: { account: { type: mockAccountType } },
    data: { agreement: { id: 'AGR-1' } },
  }),
}), { virtual: true });

const AGREEMENT = {
  id: 'AGR-1',
  name: 'Agreement Name',
  status: 'Active',
  product: { id: 'PRD-1', name: 'Adobe VIP Marketplace for Education' },
  parameters: {
    fulfillment: [
      { id: 'PAR-1', externalId: 'cotermDate', name: 'Anniversary date', value: '2027-06-02' },
    ],
  },
};

const SUBSCRIPTIONS = [
  {
    id: 'SUB-1',
    name: 'Subscription One',
    autoRenew: true,
    lines: [
      {
        id: 'ALI-1',
        quantity: 37,
        item: { id: 'ITM-1', name: 'Item One', externalIds: { vendor: '65322587CA' } },
      },
    ],
  },
  {
    id: 'SUB-2',
    name: 'Subscription Two',
    autoRenew: false,
    lines: [
      {
        id: 'ALI-2',
        quantity: 21,
        item: { id: 'ITM-2', name: 'Item Two', externalIds: { vendor: '65322588CA' } },
      },
    ],
  },
];

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
    get: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);
const mockGet = jest.mocked(http.get);

const AUTO_RENEW_SUPPORT_URL = '/api/v2/agreements/AGR-1/renewal-order/auto-renew-support';
const AUTO_RENEW_SUPPORTED = { '65322587CA': true, '65322588CA': true };
const PATH_STATE_URL = '/api/v2/agreements/AGR-1/renewal-order/path-state';
const PATH_STATE: RenewalPathState = {
  anniversaryDate: '2026-08-20',
  windowOpen: true,
  windowOpensDays: 30,
  windowClosesDays: 3,
  hasActiveSubscriptions: true,
  lockedPath: null,
};

function respondTo(url: string, pathState: RenewalPathState = PATH_STATE) {
  if (url === '/api/v2/settings') {
    return Promise.resolve({ data: { data: { products: [{ id: 'PRD-1', segment: 'COM' }] } } });
  }
  if (url === PATH_STATE_URL) {
    return Promise.resolve({ data: { data: pathState } });
  }
  return Promise.resolve({ data: { data: SUBSCRIPTIONS } });
}

function respondToPost(url: string, support = AUTO_RENEW_SUPPORTED) {
  if (url === AUTO_RENEW_SUPPORT_URL) {
    return Promise.resolve({ data: { data: { skus: support } } });
  }
  return Promise.resolve({ data: { data: AGREEMENT } });
}

interface MockChildren {
  children?: ReactNode | ((args: { activeStepIndex: number }) => ReactNode);
}
interface WizardStep {
  title: string;
  nextButton?: { isDisabled?: boolean };
}
interface MockWizardProps extends MockChildren {
  onClose?: () => void;
  stepsProps?: WizardStep[];
  isToDisableSideNavigation?: boolean;
}
let wizardSteps: WizardStep[] = [];
let wizardProps: MockWizardProps;

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => {
  const Wizard = (props: MockWizardProps) => {
    const { children, onClose, stepsProps } = props;
    wizardProps = props;
    wizardSteps = stepsProps ?? [];
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

interface TimingProps {
  renewalDate?: string;
  path: string;
  onPathChange: (path: string) => void;
  pathState: RenewalPathState | null;
}
let timingProps: TimingProps;

jest.mock('./TimingStep', () => ({
  TimingStep: (props: TimingProps) => {
    timingProps = props;
    return <div>Timing step</div>;
  },
}));

interface RenewalStepProps {
  subscriptions: { id: string }[];
  selections: Record<string, boolean>;
  onRenewChange: (subscriptionId: string, renew: boolean) => void;
}
let renewalProps: RenewalStepProps;

jest.mock('./RenewalStep', () => ({
  RenewalStep: (props: RenewalStepProps) => {
    renewalProps = props;
    return <div>Renewal step</div>;
  },
}));

interface ItemsStepProps {
  subscriptions: { id: string }[];
  selections: Record<string, boolean>;
  quantities: Record<string, number | null>;
  netNewItems: { itemId: string }[];
  recommendedSkus: Set<string>;
  path: string;
  onQuantityChange: (subscriptionId: string, quantity: number | null) => void;
  onNetNewItemsChange: (items: { itemId: string }[]) => void;
}
let itemsProps: ItemsStepProps;

jest.mock('./ItemsStep', () => ({
  ItemsStep: (props: ItemsStepProps) => {
    itemsProps = props;
    return <div>Items step</div>;
  },
}));

interface PromotionsStepProps {
  discountSelections: Record<string, string>;
  path: string;
  onDiscountChange: (rowId: string, code: string) => void;
}
let promotionsProps: PromotionsStepProps;

jest.mock('./PromotionsStep', () => ({
  PromotionsStep: (props: PromotionsStepProps) => {
    promotionsProps = props;
    return <div>Promotions step</div>;
  },
}));

interface DetailsStepProps {
  details: { externalId: string; notes: string };
  onDetailsChange: (details: { externalId: string; notes: string }) => void;
}
let detailsProps: DetailsStepProps;

jest.mock('./DetailsStep', () => ({
  DetailsStep: (props: DetailsStepProps) => {
    detailsProps = props;
    return <div>Details step</div>;
  },
}));

interface ReviewOrderStepProps {
  subscriptions: { id: string }[];
  details: { externalId: string; notes: string };
  onPlaceOrder: () => Promise<boolean>;
  errorMessage?: string;
  isSubmitting?: boolean;
}
let reviewProps: ReviewOrderStepProps;

jest.mock('./ReviewOrderStep', () => ({
  ReviewOrderStep: (props: ReviewOrderStepProps) => {
    reviewProps = props;
    return <div>Review step</div>;
  },
}));

interface SummaryStepProps {
  order: { id?: string | null } | null;
}
let summaryProps: SummaryStepProps;

jest.mock('./SummaryStep', () => ({
  SummaryStep: (props: SummaryStepProps) => {
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

describe('request-renewal-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockActiveStepIndex = 0;
    mockAccountType = 'Client';
    mockPost.mockReset();
    mockGet.mockReset();
    mockPost.mockImplementation((url: string) => respondToPost(url));
    mockGet.mockImplementation((url: string) => respondTo(url));
  });

  it('renders the wizard header for the renewed product and the timing step', async () => {
    render(<App />);

    expect(await screen.findByText('Renew Adobe VIP Marketplace for Education')).toBeTruthy();
    expect(screen.getByText('Timing step')).toBeTruthy();
  });

  it('lays out the seven renewal steps in order', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(wizardSteps.map((step) => step.title)).toEqual([
      'Timing',
      'Renewal',
      'Items',
      'Promotions',
      'Details',
      'Review order',
      'Summary',
    ]);
  });

  it('loads the agreement and its subscriptions on open', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1/sync');
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('asks which held SKUs can renew at the anniversary', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        AUTO_RENEW_SUPPORT_URL,
        { skus: ['65322587CA', '65322588CA'] },
        expect.objectContaining({ signal: expect.anything() }),
      ),
    );
  });

  it('keeps a subscription whose SKU cannot auto-renew out of the plan', async () => {
    mockActiveStepIndex = 1;
    mockPost.mockImplementation((url: string) =>
      respondToPost(url, { '65322587CA': true, '65322588CA': false }),
    );
    render(<App />);

    expect(await screen.findByText('Renewal step')).toBeTruthy();
    await waitFor(() =>
      expect(renewalProps.subscriptions.map((subscription) => subscription.id)).toEqual(['SUB-1']),
    );
  });

  it('carries a subscription that cannot auto-renew on the early path', async () => {
    mockPost.mockImplementation((url: string) =>
      respondToPost(url, { '65322587CA': true, '65322588CA': false }),
    );
    const { rerender } = render(<App />);

    await screen.findByText('Timing step');
    act(() => timingProps.onPathChange('now'));
    await waitFor(() => expect(timingProps.path).toBe('now'));

    mockActiveStepIndex = 1;
    rerender(<App />);
    await screen.findByText('Renewal step');

    expect(renewalProps.subscriptions.map((subscription) => subscription.id)).toEqual([
      'SUB-1',
      'SUB-2',
    ]);
  });

  it('keeps the anniversary path on offer when no held SKU can auto-renew', async () => {
    mockPost.mockImplementation((url: string) =>
      respondToPost(url, { '65322587CA': false, '65322588CA': false }),
    );
    render(<App />);

    await screen.findByText('Timing step');
    expect(timingProps.path).toBe('anniversary');
    expect(timingProps.pathState?.lockedPath).toBeNull();
  });

  it('surfaces a failed auto-renewal support lookup with a retry', async () => {
    mockPost.mockImplementation((url: string) =>
      url === AUTO_RENEW_SUPPORT_URL
        ? Promise.reject(new Error('Airtable unavailable'))
        : respondToPost(url),
    );
    render(<App />);

    expect(await screen.findByText('Airtable unavailable')).toBeTruthy();
    expect(screen.queryByText('Timing step')).toBeNull();
  });

  it('hands the renewal date and the selected path to the timing step', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(timingProps.renewalDate).toBe('2027-06-02');
    expect(timingProps.path).toBe('anniversary');
    expect(typeof timingProps.onPathChange).toBe('function');
  });

  it('carries the picked early-renewal path into the later steps and onto the order', async () => {
    mockPost.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/renewal-order'
        ? Promise.resolve({ data: { data: { id: 'ORD-1', status: 'Processing' } } })
        : respondToPost(url),
    );
    const { rerender } = render(<App />);

    await screen.findByText('Timing step');
    act(() => timingProps.onPathChange('now'));
    await waitFor(() => expect(timingProps.path).toBe('now'));

    mockActiveStepIndex = 2;
    rerender(<App />);
    await screen.findByText('Items step');
    expect(itemsProps.path).toBe('now');

    mockActiveStepIndex = 3;
    rerender(<App />);
    await screen.findByText('Promotions step');
    expect(promotionsProps.path).toBe('now');

    mockActiveStepIndex = 5;
    rerender(<App />);
    await screen.findByText('Review step');
    await act(async () => {
      await reviewProps.onPlaceOrder();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/renewal-order',
      expect.objectContaining({ renewalPath: 'now' }),
    );
  });

  it('hands the subscriptions and the seeded renew preferences to the renewal step', async () => {
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Renewal step')).toBeTruthy();
    expect(renewalProps.subscriptions).toEqual(SUBSCRIPTIONS);
    await waitFor(() =>
      expect(renewalProps.selections).toEqual({ 'SUB-1': true, 'SUB-2': false }),
    );
    expect(typeof renewalProps.onRenewChange).toBe('function');
  });

  it('stores the renew choice in the wizard state when a toggle changes', async () => {
    mockActiveStepIndex = 1;
    render(<App />);

    await screen.findByText('Renewal step');
    act(() => renewalProps.onRenewChange('SUB-1', false));

    await waitFor(() =>
      expect(renewalProps.selections).toEqual({ 'SUB-1': false, 'SUB-2': false }),
    );
  });

  it('hands the subscriptions, selections and quantities to the items step', async () => {
    mockActiveStepIndex = 2;
    render(<App />);

    expect(await screen.findByText('Items step')).toBeTruthy();
    expect(itemsProps.subscriptions).toEqual(SUBSCRIPTIONS);
    await waitFor(() =>
      expect(itemsProps.selections).toEqual({ 'SUB-1': true, 'SUB-2': false }),
    );
    expect(itemsProps.quantities).toEqual({});
    expect(typeof itemsProps.onQuantityChange).toBe('function');
  });

  it('stores the renewal quantity in the wizard state when it changes', async () => {
    mockActiveStepIndex = 2;
    render(<App />);

    await screen.findByText('Items step');
    act(() => itemsProps.onQuantityChange('SUB-1', 53));

    await waitFor(() => expect(itemsProps.quantities).toEqual({ 'SUB-1': 53 }));
  });

  it('stores the added net-new items in the wizard state', async () => {
    mockActiveStepIndex = 2;
    render(<App />);

    await screen.findByText('Items step');
    expect(itemsProps.netNewItems).toEqual([]);

    act(() => itemsProps.onNetNewItemsChange([{ itemId: 'ITM-9' }]));

    await waitFor(() => expect(itemsProps.netNewItems).toEqual([{ itemId: 'ITM-9' }]));
  });

  it('stores the applied discount codes in the wizard state', async () => {
    mockActiveStepIndex = 3;
    render(<App />);

    await screen.findByText('Promotions step');
    expect(promotionsProps.discountSelections).toEqual({});

    act(() => promotionsProps.onDiscountChange('SUB-1', 'CODE-ONE'));

    await waitFor(() =>
      expect(promotionsProps.discountSelections).toEqual({ 'SUB-1': 'CODE-ONE' }),
    );
  });

  it('stores the order details in the wizard state', async () => {
    mockActiveStepIndex = 4;
    render(<App />);

    await screen.findByText('Details step');
    expect(detailsProps.details).toEqual({ externalId: '', notes: '' });

    act(() => detailsProps.onDetailsChange({ externalId: 'PO-1', notes: 'Renew everything' }));

    await waitFor(() =>
      expect(detailsProps.details).toEqual({ externalId: 'PO-1', notes: 'Renew everything' }),
    );
  });

  it('hands the plan and the applied codes to the review step', async () => {
    mockActiveStepIndex = 5;
    render(<App />);

    expect(await screen.findByText('Review step')).toBeTruthy();
    expect(reviewProps.subscriptions).toEqual(SUBSCRIPTIONS);
    expect(reviewProps.details).toEqual({ externalId: '', notes: '' });
    expect(reviewProps.isSubmitting).toBe(false);
  });

  it('places the renewal order with the plan, the codes and the tracker id', async () => {
    mockActiveStepIndex = 5;
    mockPost.mockImplementation((url: string) => {
      if (url === '/api/v2/agreements/AGR-1/recommendations') {
        return Promise.resolve({
          data: {
            data: {
              productRecommendations: { upsells: [], crossSells: [], addOns: [] },
              xRecommendationTrackerId: 'TRACKER-1',
            },
          },
        });
      }
      if (url === '/api/v2/agreements/AGR-1/renewal-order') {
        return Promise.resolve({ data: { data: { id: 'ORD-1', status: 'Processing' } } });
      }
      return respondToPost(url);
    });
    render(<App />);

    await screen.findByText('Review step');
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v2/agreements/AGR-1/recommendations',
        expect.anything(),
      ),
    );
    await act(async () => {});

    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewProps.onPlaceOrder();
    });

    expect(placed).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1/renewal-order', {
      renewalPath: 'anniversary',
      subscriptions: [
        { id: 'SUB-1', offerId: '65322587CA', renew: true, renewalQuantity: 37 },
        { id: 'SUB-2', offerId: '65322588CA', renew: false, renewalQuantity: 0 },
      ],
      netNewItems: [],
      flexDiscountCodes: [],
      recommendationTrackerId: 'TRACKER-1',
      notes: '',
      externalIds: { client: '' },
    });
  });

  it('locks the side navigation once the order is placed', async () => {
    mockActiveStepIndex = 5;
    mockPost.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/renewal-order'
        ? Promise.resolve({ data: { data: { id: 'ORD-1', status: 'Processing' } } })
        : respondToPost(url),
    );
    render(<App />);

    await screen.findByText('Review step');
    expect(wizardProps.isToDisableSideNavigation).toBe(false);

    await act(async () => {
      await reviewProps.onPlaceOrder();
    });

    await waitFor(() => expect(wizardProps.isToDisableSideNavigation).toBe(true));
  });

  it('surfaces a rejected renewal order on the review step', async () => {
    mockActiveStepIndex = 5;
    mockPost.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/renewal-order'
        ? Promise.reject({ response: { data: { detail: 'Adobe rejected the plan.' } } })
        : respondToPost(url),
    );
    render(<App />);

    await screen.findByText('Review step');
    let placed: boolean | undefined;
    await act(async () => {
      placed = await reviewProps.onPlaceOrder();
    });

    expect(placed).toBe(false);
    await waitFor(() => expect(reviewProps.errorMessage).toBe('Adobe rejected the plan.'));
  });

  it('hands no order to the summary step before placement', async () => {
    mockActiveStepIndex = 6;
    render(<App />);

    expect(await screen.findByText('Summary step')).toBeTruthy();
    expect(summaryProps.order).toBeNull();
  });

  it('requests Adobe recommendations for the whole subscription estate', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1/recommendations', {
        offers: [
          { offerId: '65322587CA', quantity: 37 },
          { offerId: '65322588CA', quantity: 21 },
        ],
      }),
    );
  });

  it('shows the loader until the agreement is loaded', async () => {
    render(<App />);

    expect(screen.getByTestId('loader')).toBeTruthy();

    await screen.findByText('Timing step');
    expect(screen.queryByTestId('loader')).toBeNull();
  });

  it('offers a retry when the agreement cannot be loaded', async () => {
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));
    render(<App />);

    expect(await screen.findByTestId('notification-error')).toBeTruthy();
    expect(screen.getByText('Marketplace unavailable')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() =>
      expect(
        mockPost.mock.calls.filter(([url]) => url === '/api/v2/agreements/AGR-1/sync'),
      ).toHaveLength(2),
    );
  });

  it('offers a retry when the agreement subscriptions cannot be loaded', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/subscriptions'
        ? Promise.reject(new Error('Subscriptions unavailable'))
        : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Subscriptions unavailable')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() =>
      expect(
        mockGet.mock.calls.filter(([url]) => url === '/api/v2/agreements/AGR-1/subscriptions'),
      ).toHaveLength(2),
    );
  });

  it('reports settings failures', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/settings' ? Promise.reject(new Error('nope')) : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Settings could not be loaded.')).toBeTruthy();
  });

  it('keeps the wizard from non-client accounts', async () => {
    mockAccountType = 'Operations';
    render(<App />);

    expect(await screen.findByText('Not available')).toBeTruthy();
    expect(screen.queryByText('Timing step')).toBeNull();
  });

  it('tells a restricted account it cannot renew even when the subscriptions fail', async () => {
    mockAccountType = 'Operations';
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/subscriptions'
        ? Promise.reject(new Error('Subscriptions unavailable'))
        : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Not available')).toBeTruthy();
    expect(screen.queryByText('Subscriptions unavailable')).toBeNull();
  });

  it('reports a path state failure and recovers on retry', async () => {
    let failed = false;
    mockGet.mockImplementation((url: string) => {
      if (url === PATH_STATE_URL && !failed) {
        failed = true;
        return Promise.reject(new Error('Adobe unavailable'));
      }
      return respondTo(url);
    });
    render(<App />);

    fireEvent.click(await screen.findByText('Retry'));

    expect(await screen.findByText('Timing step')).toBeTruthy();
  });

  it('blocks the first step outside the renewal window', async () => {
    mockGet.mockImplementation((url: string) =>
      respondTo(url, { ...PATH_STATE, windowOpen: false }),
    );
    render(<App />);

    await screen.findByText('Timing step');
    expect(wizardSteps[0].nextButton?.isDisabled).toBe(true);
  });

  it('runs the wizard on the established early path', async () => {
    mockGet.mockImplementation((url: string) => respondTo(url, { ...PATH_STATE, lockedPath: 'now' }));
    render(<App />);

    await screen.findByText('Timing step');
    await waitFor(() => expect(timingProps.path).toBe('now'));
    expect(wizardSteps[0].nextButton?.isDisabled).toBe(false);
  });

  it('closes the modal from the wizard', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Close'));

    expect(mockClose).toHaveBeenCalled();
  });
});

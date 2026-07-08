import { ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import {
  TargetSubscriptionGrid,
  getCurrentQuantityCell,
  getDeltaCell,
  getNewQuantityCell,
  getRecommendedCell,
  getSubscriptionCell,
} from './TargetSubscriptionGrid';
import { AdobeOfferSwitchPath } from '../../../shared/model';

interface CapturedConfig {
  id: string;
  columns: { name: string; title?: string }[];
  fields: { name: string; title: string }[];
  sort: { field: string; direction: string }[];
  paging: { page: number; pageSize: number; total: number };
  plugins: unknown[];
}

let capturedData: { id: string | null }[];
let capturedConfig: CapturedConfig;
const radioPlugin = { id: 'radio' };

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: () => <div data-testid="grid" />,
  GridCellHeader: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  GridCellRadio: () => <input type="radio" />,
  GridCellSimple: ({ children }: { children?: ReactNode }) => (
    <div data-testid="grid-cell-simple">{children}</div>
  ),
  useGridInMemory: (data: typeof capturedData, config: CapturedConfig) => {
    capturedData = data;
    capturedConfig = config;
    return { data, config };
  },
  useRadioPlugin: () => ({ plugin: radioPlugin }),
}));

type Subscription = Parameters<typeof getRecommendedCell>[0];

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'SUB-1525-6036-0087',
    name: 'Subscription for Illustrator',
    item: {
      id: 'ITM-0520-2723-0405',
      name: 'Illustrator for Teams',
      externalId: 'AO03.25470.MN | 30002000CB',
    },
    recommended: 'Yes',
    currentQuantity: 7,
    newQuantity: 7,
    delta: 0,
    unitSP: '179.88',
    spxM: '104.93',
    spxY: '1,259.16',
    terms: 'Yearly billing',
    commitment: '1 year commitment',
    ...overrides,
  };
}

const subscriptions = [makeSubscription(), makeSubscription({ id: null, name: null })];

const offerPaths: AdobeOfferSwitchPath[] = [
  {
    totalCount: 1,
    count: 1,
    offset: 0,
    limit: 1,
    productUpgrades: [
      {
        sourceBaseOfferId: 'AO03.25470.MN | 30002000CB',
        targetList: [
          { targetBaseOfferId: 'AO03.25470.MN | 30002000CB', sequence: 1, switchType: 'PARTIAL_ALLOWED' },
          { targetBaseOfferId: 'AO03.25471.MN | 30002000CC', sequence: 2, switchType: 'FULL_ONLY' },
        ],
      },
    ],
  },
];

const onSubscriptionsChange = jest.fn();

beforeEach(() => {
  onSubscriptionsChange.mockReset();
});

describe('TargetSubscriptionGrid', () => {
  it('renders the grid', () => {
    const { getByTestId } = render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    expect(getByTestId('grid')).toBeTruthy();
  });

  it('feeds the grid both target subscriptions', () => {
    render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    expect(capturedData).toHaveLength(2);
    expect(capturedData[0]).toMatchObject({ id: 'SUB-1525-6036-0087' });
    expect(capturedData[1]).toMatchObject({ id: null });
  });

  it('configures the expected columns', () => {
    render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'select',
      'name',
      'subscription',
      'recommended',
      'currentQuantity',
      'newQuantity',
      'delta',
      'unitSP',
      'spxM',
      'spxY',
    ]);
  });

  it('configures the expected fields and default sort', () => {
    render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    expect(capturedConfig.fields.map((field) => field.name)).toEqual([
      'name',
      'subscription',
      'recommended',
      'currentQuantity',
      'unitSP',
      'spxM',
      'spxY',
    ]);
    expect(capturedConfig.sort).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('pages all rows on a single page and registers the radio plugin', () => {
    render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 2, total: 2 });
    expect(capturedConfig.plugins).toEqual([radioPlugin]);
  });

  it('propagates quantity changes to the parent instead of keeping local state', () => {
    render(<TargetSubscriptionGrid subscriptions={subscriptions} offerPaths={offerPaths} onSubscriptionsChange={onSubscriptionsChange} />);

    const column = capturedConfig.columns.find((c) => c.name === 'newQuantity') as unknown as {
      cell: (item: Subscription) => ReactNode;
    };
    const { getByRole } = render(<>{column.cell(subscriptions[0])}</>);
    fireEvent.change(getByRole('spinbutton'), { target: { value: '10' } });

    expect(onSubscriptionsChange).toHaveBeenCalledTimes(1);
    expect(onSubscriptionsChange.mock.calls[0][0][0]).toMatchObject({ newQuantity: 10, delta: 3 });
  });
});

describe('getSubscriptionCell', () => {
  it('renders a popover for an existing subscription', () => {
    const { getByText } = render(<>{getSubscriptionCell(makeSubscription())}</>);

    expect(getByText('Subscription for Illustrator')).toBeTruthy();
  });

  it('renders a "New" chip when there is no subscription', () => {
    const { getByText } = render(<>{getSubscriptionCell(makeSubscription({ id: null, name: null }))}</>);

    expect(getByText('New')).toBeTruthy();
  });
});

describe('getRecommendedCell', () => {
  it('renders "Yes" with an icon when recommended', () => {
    const { getByText, container } = render(<>{getRecommendedCell(makeSubscription({ recommended: 'Yes' }))}</>);

    expect(getByText('Yes')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders a dash when not recommended', () => {
    const { getByText } = render(<>{getRecommendedCell(makeSubscription({ recommended: 'No' }))}</>);

    expect(getByText('—')).toBeTruthy();
  });
});

describe('getCurrentQuantityCell', () => {
  it('renders the quantity when positive', () => {
    const { getByText } = render(<>{getCurrentQuantityCell(makeSubscription({ currentQuantity: 7 }))}</>);

    expect(getByText('7')).toBeTruthy();
  });

  it('renders a dash when zero', () => {
    const { getByText } = render(<>{getCurrentQuantityCell(makeSubscription({ currentQuantity: 0 }))}</>);

    expect(getByText('—')).toBeTruthy();
  });
});

describe('getDeltaCell', () => {
  it('renders a positive delta with a plus sign', () => {
    const { getByText } = render(<>{getDeltaCell(makeSubscription({ delta: 7 }))}</>);

    expect(getByText('+7')).toBeTruthy();
  });

  it('renders a negative delta as-is', () => {
    const { getByText } = render(<>{getDeltaCell(makeSubscription({ delta: -3 }))}</>);

    expect(getByText('-3')).toBeTruthy();
  });

  it('renders a dash when there is no change', () => {
    const { getByText } = render(<>{getDeltaCell(makeSubscription({ delta: 0 }))}</>);

    expect(getByText('—')).toBeTruthy();
  });
});

describe('getNewQuantityCell', () => {
  it('enables the input and forwards changes for a PARTIAL_ALLOWED target', () => {
    const onChange = jest.fn();
    const subscription = makeSubscription({ recommended: 'Yes', newQuantity: 7 });
    const { getByRole } = render(<>{getNewQuantityCell(subscription, offerPaths, [subscription], onChange)}</>);

    const input = getByRole('spinbutton');
    expect(input).toBeEnabled();
    expect(input).toHaveValue(7);

    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith(subscription, '12');
  });

  it('disables the input when not recommended', () => {
    const { getByRole } = render(
      <>{getNewQuantityCell(makeSubscription({ recommended: 'No' }), offerPaths, subscriptions, jest.fn())}</>,
    );

    expect(getByRole('spinbutton')).toBeDisabled();
  });

  it('disables the input for a FULL_ONLY target', () => {
    const subscription = makeSubscription({
      recommended: 'Yes',
      item: { id: 'ITM-2', name: 'Creative Cloud', externalId: 'AO03.25471.MN | 30002000CC' },
    });
    const { getByRole } = render(
      <>{getNewQuantityCell(subscription, offerPaths, subscriptions, jest.fn())}</>,
    );

    expect(getByRole('spinbutton')).toBeDisabled();
  });
});

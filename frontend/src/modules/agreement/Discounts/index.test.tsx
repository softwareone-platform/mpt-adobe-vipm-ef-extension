import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { http } from '@mpt-extension/sdk';
import { useMPTContext } from '@mpt-extension/sdk-react';

import { Discounts } from '.';

const mockOpen = jest.fn();

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
  useMPTModal: () => ({ open: mockOpen, close: jest.fn() }),
}), { virtual: true });

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
  },
}), { virtual: true });

jest.mock('@softwareone-platform/sdk-react-ui-v0/text', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const renderText = ({
    as = 'span',
    children,
  }: {
    as?: string;
    children?: import('react').ReactNode;
  }) => React.createElement(as, null, children);

  return {
    BoldText: renderText,
    MediumText: renderText,
    RegularText: renderText,
  };
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/chip', () =>
  jest
    .requireActual<typeof import('../../shared/testing/sdkUiMocks')>(
      '../../shared/testing/sdkUiMocks',
    )
    .createChipMock(),
);

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () =>
  jest
    .requireActual<typeof import('../../shared/testing/sdkUiMocks')>(
      '../../shared/testing/sdkUiMocks',
    )
    .createButtonMock(),
);

// Captures every useGridAsync config so tests can drive grid events (paging)
// and renders rows through the real column cell definitions.
const mockGridConfigs: Array<Record<string, unknown>> = [];

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () =>
  jest
    .requireActual<typeof import('../../shared/testing/sdkUiMocks')>(
      '../../shared/testing/sdkUiMocks',
    )
    .createGridMock((config) => mockGridConfigs.push(config)),
);

const mockUseMPTContext = jest.mocked(useMPTContext);
const mockGet = jest.mocked(http.get);

const DISCOUNTS = [
  {
    id: 'rec1',
    code: 'DISCOUNT-CODE-1',
    name: 'Sample Percentage Discount Promotion - Add Seats',
    source: 'Open',
    status: 'ACTIVE',
    discountType: 'PERCENTAGE',
    startDate: '2026-02-01T00:00:00+00:00',
    endDate: '2026-10-29T00:00:00+00:00',
    applicableOrderTypes: ['NEW'],
    values: [{ country: 'US', currency: 'USD', value: 15 }],
    redeemedAt: '2026-03-14T00:00:00+00:00',
  },
  {
    id: 'rec2',
    code: 'DISCOUNT-CODE-2',
    name: 'Sample Fixed Discount Promotion',
    source: 'Closed',
    status: 'EXPIRED',
    discountType: 'FIXED_DISCOUNT',
    startDate: '2026-01-01T00:00:00+00:00',
    endDate: '2026-05-29T00:00:00+00:00',
    discountLockEndDate: '2026-12-31T00:00:00+00:00',
    applicableOrderTypes: [],
    values: [{ country: 'US', currency: 'USD', value: 20 }],
    redeemedAt: null,
  },
];

const PRODUCT_ID = 'PRD-1111-1111';
const DISCOUNTS_URL = '/api/v2/discount-codes';

// The view fetches both the discount page and the settings that gate the
// "Add closed discount" action, so the stub answers per endpoint.
function mockBackend(data: unknown[] = DISCOUNTS, total: number = data.length) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v2/settings') {
      return Promise.resolve({
        data: { data: { products: [{ id: PRODUCT_ID, segment: 'COM' }] } },
      });
    }
    return Promise.resolve({
      data: { data, $meta: { pagination: { offset: 0, limit: 10, total } } },
    });
  });
}

function discountRequests() {
  return mockGet.mock.calls.filter(([url]) => url === DISCOUNTS_URL);
}

function mockAccount(type: string) {
  mockUseMPTContext.mockReturnValue({
    auth: { account: { type } },
    data: {
      agreement: { id: 'AGR-0000-0000-0000', product: { id: PRODUCT_ID } },
    },
  });
}

async function renderDiscounts() {
  render(<Discounts />);
  await act(async () => {});
}

describe('Discounts view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGridConfigs.length = 0;
    mockBackend();
    mockAccount('Operations');
  });

  it('fetches the first page of discounts scoped to the agreement', async () => {
    await renderDiscounts();

    expect(mockGet).toHaveBeenCalledWith(
      DISCOUNTS_URL,
      expect.objectContaining({
        params: { agreement: 'AGR-0000-0000-0000', limit: 10, offset: 0 },
      }),
    );
  });

  it('renders the section title and the column headers', async () => {
    await renderDiscounts();

    expect(screen.getByRole('heading', { name: 'Discounts' })).toBeInTheDocument();
    for (const header of ['Code', 'Source', 'Type', 'Value', 'Valid', 'Order types', 'Redeemed']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it('renders the discount rows returned by the backend', async () => {
    await renderDiscounts();

    expect(screen.getByText('DISCOUNT-CODE-1')).toBeInTheDocument();
    expect(
      screen.getByText('Sample Percentage Discount Promotion - Add Seats'),
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Percentage')).toBeInTheDocument();
    expect(screen.getByText('15% off')).toBeInTheDocument();
    expect(screen.getByText('2026-02-01 - 2026-10-29')).toBeInTheDocument();
    expect(screen.getByText('Add seats')).toBeInTheDocument();
    expect(screen.getByText('2026-03-14')).toBeInTheDocument();
  });

  it('renders expired closed codes with the lock date and the Any order type', async () => {
    await renderDiscounts();

    expect(screen.getByText('DISCOUNT-CODE-2')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Fixed Discount')).toBeInTheDocument();
    expect(screen.getByText('$20.00 off')).toBeInTheDocument();
    expect(screen.getByText('Discount lock until: 2026-12-31')).toBeInTheDocument();
    expect(screen.getByText('Any')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('fetches the next page when the grid paging changes', async () => {
    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1] as {
      onConfigChange: (config: { paging: { page: number; pageSize: number } }) => void;
    };

    act(() => {
      lastConfig.onConfigChange({ paging: { page: 2, pageSize: 10 } });
    });

    await waitFor(() => expect(discountRequests()).toHaveLength(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      DISCOUNTS_URL,
      expect.objectContaining({
        params: { agreement: 'AGR-0000-0000-0000', limit: 10, offset: 10 },
      }),
    );
  });

  it('passes the fetch state through to the grid', async () => {
    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1];
    expect(lastConfig.total).toBe(DISCOUNTS.length);
    expect(lastConfig.isLoading).toBe(false);
    expect(lastConfig.error).toBeUndefined();
  });

  it('surfaces fetch errors to the grid', async () => {
    mockGet.mockRejectedValue(new Error('Airtable unavailable'));

    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1];
    expect(lastConfig.error).toBe('Airtable unavailable');
  });

  it('renders the add action inside the grid toolbar for editor accounts', async () => {
    await renderDiscounts();

    const button = screen.getByRole('button', { name: 'Add closed discount' });
    expect(button).toBeInTheDocument();
    expect(screen.getByTestId('grid__toolbar')).toContainElement(button);
  });

  it.each(['Vendor', 'Operations'])('offers the add action to %s accounts', async (type) => {
    mockAccount(type);

    await renderDiscounts();

    expect(screen.getByRole('button', { name: 'Add closed discount' })).toBeInTheDocument();
  });

  it('hides the add action from client accounts', async () => {
    mockAccount('Client');

    await renderDiscounts();

    expect(screen.queryByRole('button', { name: 'Add closed discount' })).not.toBeInTheDocument();
  });

  it('opens the discount wizard plug with the create mode on the context', async () => {
    await renderDiscounts();

    fireEvent.click(screen.getByRole('button', { name: 'Add closed discount' }));

    expect(mockOpen).toHaveBeenCalledWith(
      'request-discount-action',
      expect.objectContaining({
        context: expect.objectContaining({ discount: { mode: 'create' } }),
      }),
    );
  });

  it('refreshes the grid when the wizard closes', async () => {
    await renderDiscounts();

    fireEvent.click(screen.getByRole('button', { name: 'Add closed discount' }));
    const { onClose } = mockOpen.mock.calls[0][1] as { onClose: () => Promise<void> };
    await act(async () => {
      await onClose();
    });

    await waitFor(() => expect(discountRequests()).toHaveLength(2));
  });

  it('hides the add action when the agreement product is not served by the extension', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Operations' } },
      data: {
        agreement: { id: 'AGR-0000-0000-0000', product: { id: 'PRD-9999-9999' } },
      },
    });

    await renderDiscounts();

    expect(screen.queryByRole('button', { name: 'Add closed discount' })).not.toBeInTheDocument();
  });
});

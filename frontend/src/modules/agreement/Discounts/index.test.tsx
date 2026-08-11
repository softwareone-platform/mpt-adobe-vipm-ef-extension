import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { http } from '@mpt-extension/sdk';
import { useMPTContext } from '@mpt-extension/sdk-react';

import { Discounts } from '.';

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({
    children,
    onClick,
    isDisabled,
  }: {
    children?: import('react').ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={isDisabled}>
      {children}
    </button>
  ),
}));

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

function mockBackend(data: unknown[] = DISCOUNTS, total: number = data.length) {
  mockGet.mockResolvedValue({
    data: { data, $meta: { pagination: { offset: 0, limit: 10, total } } },
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
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Vendor' } },
      data: { agreement: { id: 'AGR-0000-0000-0000' } },
    });
  });

  it('fetches the first page of discounts scoped to the agreement', async () => {
    await renderDiscounts();

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-0000-0000-0000', limit: 10, offset: 0 }),
      }),
    );
  });

  it('renders the section title and the column headers', async () => {
    await renderDiscounts();

    expect(screen.getByRole('heading', { name: 'Discounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add closed discount' })).toBeInTheDocument();
    for (const header of [
      'Code',
      'Source',
      'Type',
      'Value',
      'Valid',
      'Order types',
      'Redeemed',
      'Actions',
    ]) {
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
    expect(screen.getAllByText('Edit')).toHaveLength(2);
  });

  it('hides Actions and Add closed discount for client actors', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Client' } },
      data: { agreement: { id: 'AGR-0000-0000-0000' } },
    });

    await renderDiscounts();

    expect(screen.queryByRole('button', { name: 'Add closed discount' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('shows Actions and Add closed discount for operations actors', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Operations' } },
      data: { agreement: { id: 'AGR-0000-0000-0000' } },
    });

    await renderDiscounts();

    expect(screen.getByRole('button', { name: 'Add closed discount' })).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getAllByText('Edit')).toHaveLength(1);
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

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-0000-0000-0000', limit: 10, offset: 10 }),
      }),
    );
  });

  it('re-fetches with sort and filters when the grid config changes', async () => {
    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1] as {
      onConfigChange: (config: {
        paging: { page: number; pageSize: number };
        sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
        filters?: unknown;
      }) => void;
    };
    const filters = {
      type: 'and',
      expressions: [{ type: 'binary', field: 'source', operator: 'eq', value: 'Open' }],
    };

    act(() => {
      lastConfig.onConfigChange({
        paging: { page: 1, pageSize: 10 },
        sort: [{ field: 'source', direction: 'desc' }],
        filters,
      });
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({
          agreement: 'AGR-0000-0000-0000',
          limit: 10,
          offset: 0,
          sortBy: 'source',
          sortDir: 'desc',
          filters: JSON.stringify(filters),
        }),
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

  it('configures fields and default sort so filter and sort controls can render inputs', async () => {
    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1] as {
      fields?: Array<{ name: string }>;
      sort?: Array<{ field: string; direction: string }>;
    };

    expect(lastConfig.fields?.map((field) => field.name)).toEqual([
      'code',
      'source',
      'status',
      'discountType',
      'startDate',
      'endDate',
      'applicableOrderTypes',
      'redeemedAt',
    ]);
    expect(lastConfig.sort).toEqual([{ field: 'code', direction: 'asc' }]);
  });

  it('surfaces fetch errors to the grid', async () => {
    mockGet.mockRejectedValue(new Error('Airtable unavailable'));

    await renderDiscounts();

    const lastConfig = mockGridConfigs[mockGridConfigs.length - 1];
    expect(lastConfig.error).toBe('Airtable unavailable');
  });
});

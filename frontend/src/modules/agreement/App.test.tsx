import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { http } from '@mpt-extension/sdk';
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';

import App from './App';

const mockOpen = jest.fn();

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
  useMPTModal: jest.fn(),
}), { virtual: true });

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn().mockResolvedValue({ data: { data: { products: [] } } }),
  },
}), { virtual: true });

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Button: ({
      children,
      isBusy,
      isDisabled,
      onClick,
    }: {
      children?: import('react').ReactNode;
      isBusy?: boolean;
      isDisabled?: boolean;
      onClick?: () => void;
    }) => React.createElement('button', { disabled: isDisabled || isBusy, onClick }, children),
  };
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    InlineNotification: ({ children }: { children?: import('react').ReactNode }) =>
      React.createElement('div', null, children),
  };
});

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

jest.mock('@softwareone-platform/sdk-react-ui-v0/icon', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Icon: ({ name }: { name?: string }) => React.createElement('span', { 'data-icon': name }),
  };
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/chip', () =>
  jest
    .requireActual<typeof import('../shared/testing/sdkUiMocks')>('../shared/testing/sdkUiMocks')
    .createChipMock(),
);

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () =>
  jest
    .requireActual<typeof import('../shared/testing/sdkUiMocks')>('../shared/testing/sdkUiMocks')
    .createGridMock(),
);

jest.mock('@softwareone-platform/sdk-react-ui-v0/status-indicator', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    StatusIndicator: ({
      isActive,
      yesLabel = 'Yes',
      noLabel = 'No',
    }: {
      isActive?: boolean;
      yesLabel?: string;
      noLabel?: string;
    }) => React.createElement('span', null, isActive ? yesLabel : noLabel),
  };
});

const mockUseMPTContext = jest.mocked(useMPTContext);
const mockUseMPTModal = jest.mocked(useMPTModal);
const mockGet = jest.mocked(http.get);

const NAV_LABELS = ['3-year commitment', 'Linked membership', 'Global customer', 'Discounts'];

const SETTINGS_PAYLOAD = { products: [{ id: 'PRD-1111-1111', segment: 'COM' }] };

// Adobe customer payload returned by the backend's /customer endpoint. The 3YC
// section renders entirely from this, so the displayed values live here.
const ADOBE_CUSTOMER = {
  customerId: 'P1005419036',
  status: '1000',
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      commitment: {
        status: 'COMMITTED',
        startDate: '2024-01-01',
        endDate: '2027-01-01',
        minimumQuantities: [
          { offerType: 'LICENSE', quantity: 100 },
          { offerType: 'CONSUMABLES', quantity: 100 },
        ],
      },
      commitmentRequest: {
        status: 'REQUESTED',
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        minimumQuantities: [{ offerType: 'LICENSE', quantity: 100 }],
      },
      recommitmentRequest: null,
    },
  ],
};

// Paginated discounts payload returned by the backend's /discount-codes endpoint.
const DISCOUNTS_PAGE = {
  data: [
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
  ],
  $meta: { pagination: { offset: 0, limit: 10, total: 1 } },
};

// Routes the shared http.get mock by endpoint: the settings fetch returns the
// product allowlist, the customer fetch returns the Adobe 3YC payload and the
// discount-codes fetch returns a paginated discounts page.
function mockBackend(customer: unknown = ADOBE_CUSTOMER, settings: unknown = SETTINGS_PAYLOAD) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/discount-codes')) {
      return Promise.resolve({ data: DISCOUNTS_PAGE });
    }
    const payload = url.endsWith('/customer') ? customer : settings;
    return Promise.resolve({ data: { data: payload } });
  });
}

// Renders App and flushes the async useSettings fetch so its state update is wrapped in act().
async function renderApp() {
  render(<App />);
  await act(async () => {});
}

describe('agreement plug app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/');
    mockBackend();
    mockUseMPTModal.mockReturnValue({ open: mockOpen, close: jest.fn() });
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Vendor' } },
      data: { agreement: { id: 'AGR-1234-5678-9012', product: { id: 'PRD-1111-1111' } } },
    });
  });

  it('renders the manage-account navigation', async () => {
    await renderApp();

    expect(screen.getByText('Manage account')).toBeInTheDocument();
    for (const label of NAV_LABELS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('opens on the 3-year commitment section by default', async () => {
    await renderApp();

    expect(screen.getByRole('link', { name: '3-year commitment' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    expect(screen.getByText('Current commitment')).toBeInTheDocument();
    expect(screen.getByText('Commitment request')).toBeInTheDocument();
    expect(screen.getByText('Recommitment request')).toBeInTheDocument();
  });

  it('switches the active section when a nav item is clicked', async () => {
    await renderApp();

    expect(screen.getByText('Current commitment')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    await act(async () => {});

    expect(screen.getByRole('link', { name: 'Linked membership' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: '3-year commitment' })).not.toHaveAttribute(
      'aria-current'
    );
    // Leaving the section unmounts the 3-year commitment content.
    expect(screen.queryByText('Current commitment')).not.toBeInTheDocument();
  });

  it('shows the Create linked membership button for an operations account on a supported product', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    // The section mounts on navigation and refetches settings; flush that fetch
    // so the gating (which depends on the product allowlist) can resolve.
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Create linked membership' })).toBeInTheDocument();
  });

  it('hides the Create linked membership button for a client account', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Client' } },
      data: { agreement: { id: 'AGR-1234-5678-9012', product: { id: 'PRD-1111-1111' } } },
    });

    await renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    await act(async () => {});

    expect(
      screen.queryByRole('button', { name: 'Create linked membership' }),
    ).not.toBeInTheDocument();
  });

  it('shows the Create linked membership button when the product segment is LGA', async () => {
    // Unlike 3YC, linked membership is available for the LGA segment.
    mockBackend(ADOBE_CUSTOMER, { products: [{ id: 'PRD-1111-1111', segment: 'LGA' }] });

    await renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    await act(async () => {});

    expect(
      screen.getByRole('button', { name: 'Create linked membership' }),
    ).toBeInTheDocument();
  });

  it('disables the Create linked membership button when the customer has a 3-year commitment', async () => {
    // ADOBE_CUSTOMER carries a COMMITTED 3YC commitment.
    await renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Create linked membership' })).toBeDisabled();
    expect(
      screen.getByText('This customer has a 3-year commitment and cannot create a linked membership.'),
    ).toBeInTheDocument();
  });

  it('enables the Create linked membership button when the customer has no 3-year commitment', async () => {
    mockBackend({ customerId: 'P1', status: '1000', benefits: [] });

    await renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Create linked membership' })).toBeEnabled();
  });

  it('renders commitment values pulled from the Adobe customer payload', async () => {
    await renderApp();

    // Commitment status comes from the Adobe benefit, not agreement parameters.
    expect(screen.getByText('COMMITTED')).toBeInTheDocument();
    // Minimum license/consumable quantities from the benefit.
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
    // Commitment request start/end dates.
    expect(screen.getAllByText('2026-01-01').length).toBeGreaterThan(0);
    // The recommitment request is null, so its fields fall back to em dashes.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('enables Request commitment when an agreement id is present', async () => {
    await renderApp();

    expect(screen.getByRole('button', { name: 'Request commitment' })).toBeEnabled();
  });

  it('opens the request-commitment modal plug when the button is clicked', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Request commitment' }));

    expect(mockOpen).toHaveBeenCalledWith(
      'request-commitment-action',
      expect.objectContaining({ onClose: expect.any(Function) }),
    );
  });

  it('disables Request commitment when the agreement id is missing', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Vendor' } },
      data: { agreement: { product: { id: 'PRD-1111-1111' } } },
    });

    await renderApp();

    expect(screen.getByRole('button', { name: 'Request commitment' })).toBeDisabled();
  });

  it('hides Request commitment for a client account', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Client' } },
      data: { agreement: { id: 'AGR-1234-5678-9012' } },
    });

    await renderApp();

    expect(screen.queryByRole('button', { name: 'Request commitment' })).not.toBeInTheDocument();
  });

  it('shows Request commitment for an operations account', async () => {
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Operations' } },
      data: { agreement: { id: 'AGR-1234-5678-9012', product: { id: 'PRD-1111-1111' } } },
    });

    await renderApp();

    expect(screen.getByRole('button', { name: 'Request commitment' })).toBeInTheDocument();
  });

  it('hides Request commitment when the product segment is LGA', async () => {
    mockBackend(ADOBE_CUSTOMER, { products: [{ id: 'PRD-1111-1111', segment: 'LGA' }] });
    mockUseMPTContext.mockReturnValue({
      auth: { account: { type: 'Vendor' } },
      data: { agreement: { id: 'AGR-1234-5678-9012', product: { id: 'PRD-1111-1111' } } },
    });

    await renderApp();

    expect(screen.queryByRole('button', { name: 'Request commitment' })).not.toBeInTheDocument();
  });

  describe('discounts section', () => {
    async function openDiscounts() {
      await renderApp();
      fireEvent.click(screen.getByRole('link', { name: 'Discounts' }));
      // The section mounts on navigation and fetches the first discounts page;
      // flush that fetch so the grid rows can resolve.
      await act(async () => {});
    }

    it('activates the Discounts nav item and renders the section title', async () => {
      await openDiscounts();

      expect(screen.getByRole('link', { name: 'Discounts' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('heading', { name: 'Discounts' })).toBeInTheDocument();
    });

    it('fetches the first discounts page scoped to the agreement', async () => {
      await openDiscounts();

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v2/discount-codes',
        expect.objectContaining({
          params: expect.objectContaining({ agreement: 'AGR-1234-5678-9012', limit: 10, offset: 0 }),
        }),
      );
    });

    it('renders the discounts returned by the backend', async () => {
      await openDiscounts();

      expect(screen.getByText('DISCOUNT-CODE-1')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('15% off')).toBeInTheDocument();
      expect(screen.getByText('2026-02-01 - 2026-10-29')).toBeInTheDocument();
    });
  });

  describe('global customer section', () => {
    async function openGlobalCustomer() {
      await renderApp();
      fireEvent.click(screen.getByRole('link', { name: 'Global customer' }));
      // The section mounts on navigation and refetches settings/customer; flush
      // those fetches so the gating and status can resolve.
      await act(async () => {});
    }

    it('renders the global customer status from the Adobe payload', async () => {
      // ADOBE_CUSTOMER has no globalSalesEnabled flag, so the status is Disabled.
      await openGlobalCustomer();

      expect(screen.getByText('Current global customer status')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('renders an Enabled status when global sales is enabled', async () => {
      mockBackend({ ...ADOBE_CUSTOMER, globalSalesEnabled: true });

      await openGlobalCustomer();

      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('shows the Update global customer button for a vendor account on a supported product', async () => {
      await openGlobalCustomer();

      expect(
        screen.getByRole('button', { name: 'Update global customer' }),
      ).toBeInTheDocument();
    });

    it('hides the Update global customer button for a client account', async () => {
      mockUseMPTContext.mockReturnValue({
        auth: { account: { type: 'Client' } },
        data: { agreement: { id: 'AGR-1234-5678-9012', product: { id: 'PRD-1111-1111' } } },
      });

      await openGlobalCustomer();

      expect(
        screen.queryByRole('button', { name: 'Update global customer' }),
      ).not.toBeInTheDocument();
    });

    it('enables the Update global customer button when global sales is disabled', async () => {
      await openGlobalCustomer();

      expect(screen.getByRole('button', { name: 'Update global customer' })).toBeEnabled();
    });

    it('disables the Update global customer button when global sales is already enabled', async () => {
      mockBackend({ ...ADOBE_CUSTOMER, globalSalesEnabled: true });

      await openGlobalCustomer();

      expect(screen.getByRole('button', { name: 'Update global customer' })).toBeDisabled();
      expect(
        screen.getByText(
          'This customer is already enabled as a global customer and cannot be changed.',
        ),
      ).toBeInTheDocument();
    });

    it('opens the request-global-customer modal plug when the button is clicked', async () => {
      await openGlobalCustomer();

      fireEvent.click(screen.getByRole('button', { name: 'Update global customer' }));

      expect(mockOpen).toHaveBeenCalledWith(
        'request-global-customer-action',
        expect.objectContaining({ onClose: expect.any(Function) }),
      );
    });
  });
});

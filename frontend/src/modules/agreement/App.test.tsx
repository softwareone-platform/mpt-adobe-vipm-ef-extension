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
    RegularText: renderText,
  };
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/icon', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Icon: ({ name }: { name?: string }) => React.createElement('span', { 'data-icon': name }),
  };
});

const mockUseMPTContext = jest.mocked(useMPTContext);
const mockUseMPTModal = jest.mocked(useMPTModal);
const mockGet = jest.mocked(http.get);

const NAV_LABELS = ['Sync account', '3-year commitment', 'Linked membership', 'Global customer'];

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

// Routes the shared http.get mock by endpoint: the settings fetch returns the
// product allowlist, the customer fetch returns the Adobe 3YC payload.
function mockBackend(customer: unknown = ADOBE_CUSTOMER, settings: unknown = SETTINGS_PAYLOAD) {
  mockGet.mockImplementation((url: string) => {
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
    expect(screen.getByRole('link', { name: 'Sync account' })).not.toHaveAttribute('aria-current');

    expect(screen.getByText('Current commitment')).toBeInTheDocument();
    expect(screen.getByText('Commitment request')).toBeInTheDocument();
    expect(screen.getByText('Recommitment request')).toBeInTheDocument();
  });

  it('switches the active section when a nav item is clicked', async () => {
    await renderApp();

    expect(screen.getByText('Current commitment')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Linked membership' }));

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
});

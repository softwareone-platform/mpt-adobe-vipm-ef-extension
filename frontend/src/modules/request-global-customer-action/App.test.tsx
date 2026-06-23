import { ReactNode } from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import App from './App';
import type { AdobeCustomerData } from '../shared/model';
import type { Status } from '../shared/hooks/useAgreementSync';

const mockClose = jest.fn();
let mockStatus: Status = 'idle';
let mockError = '';
let mockSubmit: jest.Mock;
let mockCustomerData: AdobeCustomerData | null = null;

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  useMPTContext: () => ({
    auth: { account: { type: 'Operations' } },
    data: { agreement: { product: { id: 'PRD-1' } } },
  }),
}), { virtual: true });

jest.mock('../shared/hooks/useSettings', () => ({
  useSettings: () => ({ products: [{ id: 'PRD-1', segment: 'COM' }] }),
}));

jest.mock('../shared/hooks/useAgreementId', () => ({
  useAgreementId: () => 'AGR-1234-5678-9012',
}));

jest.mock('../shared/hooks/useAdobeCustomer', () => ({
  useAdobeCustomer: () => ({
    status: 'success',
    error: null,
    data: mockCustomerData,
    update: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('../shared/hooks/useGlobalSalesRequest', () => ({
  useGlobalSalesRequest: () => ({
    error: mockError,
    status: mockStatus,
    submitRequest: mockSubmit,
    reset: jest.fn(),
  }),
}));

interface MockButtonProps {
  children: ReactNode;
  onClick?: () => void;
  isDisabled?: boolean;
  isBusy?: boolean;
}
interface MockNotificationProps {
  status: string;
  children: ReactNode;
}
interface MockTextProps {
  children: ReactNode;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick, isDisabled, isBusy }: MockButtonProps) => (
    <button onClick={onClick} disabled={isDisabled || isBusy}>
      {children}
    </button>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ status, children }: MockNotificationProps) => (
    <div data-testid={`notification-${status}`}>{children}</div>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/text', () => ({
  BoldText: ({ children }: MockTextProps) => <span>{children}</span>,
  RegularText: ({ children }: MockTextProps) => <span>{children}</span>,
}));

function setup() {
  return render(<App />);
}

const clickUpdate = (utils: ReturnType<typeof setup>) =>
  fireEvent.click(utils.getByRole('button', { name: 'Update global customer' }));

describe('request-global-customer-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockSubmit = jest
      .fn()
      .mockResolvedValue({ globalSalesEnabled: true } as AdobeCustomerData);
    mockStatus = 'idle';
    mockError = '';
    mockCustomerData = null;
  });

  const enabledCustomer: AdobeCustomerData = { globalSalesEnabled: true };

  it('renders the title and the confirm action', () => {
    const utils = setup();
    // The title and the confirm button share the same label.
    expect(utils.getAllByText('Update global customer').length).toBeGreaterThanOrEqual(2);
  });

  it('submits the request and closes with the updated customer', async () => {
    const utils = setup();

    clickUpdate(utils);

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockClose).toHaveBeenCalledWith({ customer: { globalSalesEnabled: true } }),
    );
  });

  it('does not close when submission fails', async () => {
    mockSubmit = jest.fn().mockResolvedValue(false);
    const utils = setup();

    clickUpdate(utils);

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('shows the backend error when status is error', () => {
    mockStatus = 'error';
    mockError = 'Adobe rejected the request.';
    const utils = setup();
    expect(utils.getByText('Adobe rejected the request.')).toBeTruthy();
  });

  it('shows a success notification when status is success', () => {
    mockStatus = 'success';
    const utils = setup();
    expect(utils.getByText('The global customer status has been updated on Adobe.')).toBeTruthy();
  });

  it('closes without data when Close is clicked', () => {
    const utils = setup();
    fireEvent.click(utils.getByText('Close'));
    expect(mockClose).toHaveBeenCalledWith();
  });

  it('disables the action and warns when global sales is already enabled', () => {
    mockCustomerData = enabledCustomer;
    const utils = setup();

    expect(utils.getByText('This customer is already enabled as a global customer.')).toBeTruthy();
    expect(
      (utils.getByRole('button', { name: 'Update global customer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not submit when global sales is already enabled', () => {
    mockCustomerData = enabledCustomer;
    const utils = setup();

    clickUpdate(utils);

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

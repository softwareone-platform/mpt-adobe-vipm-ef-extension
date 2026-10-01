import { ChangeEvent, ReactNode } from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import App from './App';
import type { AdobeCustomerData } from '../shared/model';
import type { Status } from '../shared/model';

const mockClose = jest.fn();
const mockRefresh = jest.fn();
let mockCustomerData: AdobeCustomerData | null = null;
let mockCustomerStatus: Status = 'success';
let mockCustomerError: string | null = null;
let mockStatus: Status = 'idle';
let mockError = '';
let mockSubmit: jest.Mock;

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
    status: mockCustomerStatus,
    error: mockCustomerError,
    data: mockCustomerData,
    update: jest.fn(),
    refresh: mockRefresh,
  }),
}));

jest.mock('../shared/components/Loader/Loader', () => ({
  Loader: () => <div data-testid="loader" />,
}));

jest.mock('../shared/hooks/useThreeYearCommitmentRequest', () => ({
  useThreeYearCommitmentRequest: () => ({
    error: mockError,
    status: mockStatus,
    submitRequest: mockSubmit,
    reset: jest.fn(),
  }),
}));

interface MockOption {
  label: string;
  value: string;
  disabled?: boolean;
}
interface MockSelectItem {
  label: string;
  value: string;
  isDisabled?: boolean;
}
interface MockButtonProps {
  children: ReactNode;
  onClick?: () => void;
  isDisabled?: boolean;
  isBusy?: boolean;
}
interface MockSelectProps {
  controlLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: MockSelectItem[];
}
interface MockSwitcherProps {
  name: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: MockOption[];
}
interface MockInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isDisabled?: boolean;
  htmlInputType?: string;
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/select', () => ({
  Select: ({ controlLabel, value, onChange, options }: MockSelectProps) => (
    <select aria-label={controlLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" />
      {options.map((option, index) => (
        <option key={index} value={option.value} disabled={option.isDisabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/switcher', () => ({
  Switcher: ({ name, label, value, onChange, options }: MockSwitcherProps) => (
    <select aria-label={label} data-testid={`switcher-${name}`} value={value} onChange={onChange}>
      {options.map((option, index) => (
        <option key={index} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/input', () => ({
  Input: ({ label, name, value, onChange, isDisabled, htmlInputType }: MockInputProps) => (
    <input
      aria-label={label}
      data-testid={`input-${name}`}
      type={htmlInputType}
      value={value}
      disabled={isDisabled}
      onChange={onChange}
    />
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ status, children }: MockNotificationProps) => (
    <div data-testid={`notification-${status}`}>{children}</div>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/text', () => ({
  MediumText: ({ children }: MockTextProps) => <span>{children}</span>,
  RegularText: ({ children }: MockTextProps) => <span>{children}</span>,
}));

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface CommittedCustomerOptions {
  licenses?: number;
  consumables?: number;
  endsInDays?: number;
  pendingRequest?: boolean;
  acceptedRecommitment?: boolean;
  pendingRecommitment?: boolean;
}

function committedCustomer({
  licenses,
  consumables,
  endsInDays = 400,
  pendingRequest = false,
  acceptedRecommitment = false,
  pendingRecommitment = false,
}: CommittedCustomerOptions = {}): AdobeCustomerData {
  const minimumQuantities = [
    ...(licenses != null ? [{ offerType: 'LICENSE' as const, quantity: licenses }] : []),
    ...(consumables != null ? [{ offerType: 'CONSUMABLES' as const, quantity: consumables }] : []),
  ];
  return {
    benefits: [
      {
        type: 'THREE_YEAR_COMMIT',
        commitment: {
          status: 'COMMITTED',
          endDate: isoDateFromToday(endsInDays),
          minimumQuantities,
        },
        commitmentRequest: pendingRequest
          ? { status: 'REQUESTED', minimumQuantities: [{ offerType: 'LICENSE', quantity: 100 }] }
          : null,
        recommitmentRequest:
          acceptedRecommitment || pendingRecommitment
            ? {
                status: acceptedRecommitment ? 'ACCEPTED' : 'REQUESTED',
                minimumQuantities: [{ offerType: 'LICENSE', quantity: 10 }],
              }
            : null,
      },
    ],
  };
}

function setup() {
  const utils = render(<App />);
  return utils;
}

const selectLicenses = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Discount level'), { target: { value } });

const selectConsumables = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Discount tier'), { target: { value } });

const setRequestType = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByTestId('switcher-request-type'), { target: { value } });

const setCustomLicenses = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByTestId('input-customLicenses'), { target: { value } });

const optionLabelled = (utils: ReturnType<typeof setup>, label: string) =>
  utils.getByRole('option', { name: label }) as HTMLOptionElement;

const clickSend = (utils: ReturnType<typeof setup>) =>
  fireEvent.click(utils.getByText('Send invitation'));

describe('request-commitment-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockRefresh.mockReset();
    mockSubmit = jest.fn().mockResolvedValue({ customerId: 'P1' } as AdobeCustomerData);
    mockCustomerData = null;
    mockCustomerStatus = 'success';
    mockCustomerError = null;
    mockStatus = 'idle';
    mockError = '';
  });

  it.each<Status>(['idle', 'loading'])(
    'shows the loader instead of the form while the customer read is %s',
    (customerStatus) => {
      mockCustomerStatus = customerStatus;
      const utils = setup();

      expect(utils.getByTestId('loader')).toBeTruthy();
      expect(utils.queryByText('Send invitation')).toBeNull();
      expect(mockSubmit).not.toHaveBeenCalled();
    },
  );

  it('offers a retry instead of the form when the customer read fails', () => {
    mockCustomerStatus = 'error';
    mockCustomerError = 'Failed to load Adobe customer data.';
    const utils = setup();

    expect(utils.getByText('Failed to load Adobe customer data.')).toBeTruthy();
    expect(utils.queryByText('Send invitation')).toBeNull();

    fireEvent.click(utils.getByText('Retry'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('falls back to the load message when the failed read reports no message', () => {
    mockCustomerStatus = 'error';
    mockCustomerError = '';
    const utils = setup();

    expect(utils.getByText('Failed to load Adobe customer data.')).toBeTruthy();
    expect(utils.queryByText('Send invitation')).toBeNull();
  });

  it('renders the title', () => {
    const utils = setup();
    expect(utils.getByText('Request 3-year commitment')).toBeTruthy();
  });

  it('blocks submission and shows an error when no quantity is selected', () => {
    const utils = setup();

    clickSend(utils);

    expect(utils.getByText('At least one quantity is required.')).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('submits a commitment payload and closes with the returned customer', async () => {
    const utils = setup();

    selectLicenses(utils, '10');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            commitmentRequest: {
              minimumQuantities: [{ offerType: 'LICENSE', quantity: 10 }],
            },
          },
        ],
      }),
    );
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith({ customer: { customerId: 'P1' } }));
  });

  it('submits a recommitment payload inside the recommitment window', async () => {
    mockCustomerData = committedCustomer({ licenses: 10, endsInDays: 20 });
    const utils = setup();

    setRequestType(utils, 'recommitment');
    selectConsumables(utils, '1000');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            recommitmentRequest: {
              minimumQuantities: [{ offerType: 'CONSUMABLES', quantity: 1000 }],
            },
          },
        ],
      }),
    );
  });

  it('includes both offer types when licenses and consumables are selected', async () => {
    const utils = setup();

    selectLicenses(utils, '10');
    selectConsumables(utils, '1000');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            commitmentRequest: {
              minimumQuantities: [
                { offerType: 'LICENSE', quantity: 10 },
                { offerType: 'CONSUMABLES', quantity: 1000 },
              ],
            },
          },
        ],
      }),
    );
  });

  it('defaults a committed customer to an uplevel through a commitment request', async () => {
    mockCustomerData = committedCustomer({ licenses: 10 });
    const utils = setup();

    selectLicenses(utils, '50');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            commitmentRequest: {
              minimumQuantities: [{ offerType: 'LICENSE', quantity: 50 }],
            },
          },
        ],
      }),
    );
  });

  it('disables levels below the committed minimum and marks the current one', () => {
    mockCustomerData = committedCustomer({ licenses: 50 });
    const utils = setup();

    expect(optionLabelled(utils, 'Keep current (50)')).toBeTruthy();
    expect(optionLabelled(utils, 'Level 12 (10 licenses)').disabled).toBe(true);
    expect(optionLabelled(utils, 'Level 13 (50 licenses) (current)').disabled).toBe(false);
    expect(optionLabelled(utils, 'Level 14 (100 licenses)').disabled).toBe(false);
  });

  it('offers every level again when recommitment is selected', () => {
    mockCustomerData = committedCustomer({ licenses: 50, endsInDays: 20 });
    const utils = setup();

    setRequestType(utils, 'recommitment');

    expect(optionLabelled(utils, 'Level 12 (10 licenses)').disabled).toBe(false);
    expect(utils.queryByRole('option', { name: 'Keep current (50)' })).toBeNull();
  });

  it('keeps the committed licenses when only consumables are added', async () => {
    mockCustomerData = committedCustomer({ licenses: 10 });
    const utils = setup();

    selectConsumables(utils, '1000');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            commitmentRequest: {
              minimumQuantities: [
                { offerType: 'LICENSE', quantity: 10 },
                { offerType: 'CONSUMABLES', quantity: 1000 },
              ],
            },
          },
        ],
      }),
    );
  });

  it('accepts an uplevel request at the current committed minimum', async () => {
    mockCustomerData = committedCustomer({ licenses: 10 });
    const utils = setup();

    selectLicenses(utils, '10');
    clickSend(utils);

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
  });

  it('rejects a custom license count below the committed minimum', () => {
    mockCustomerData = committedCustomer({ licenses: 50 });
    const utils = setup();

    selectLicenses(utils, 'custom');
    setCustomLicenses(utils, '20');
    clickSend(utils);

    expect(
      utils.getByText('Licenses cannot be lower than the current committed minimum of 50.'),
    ).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('clears the minimum error once the custom count is corrected, without a Send', () => {
    mockCustomerData = committedCustomer({ licenses: 50 });
    const utils = setup();
    const belowMinimum = 'Licenses cannot be lower than the current committed minimum of 50.';
    selectLicenses(utils, 'custom');
    setCustomLicenses(utils, '20');
    clickSend(utils);

    setCustomLicenses(utils, '30');
    const stillBelow = utils.queryByText(belowMinimum);
    setCustomLicenses(utils, '50');

    expect(stillBelow).toBeTruthy();
    expect(utils.queryByText(belowMinimum)).toBeNull();
    expect(utils.queryByTestId('notification-error')).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('clears the minimum error once a level at or above it is chosen', () => {
    mockCustomerData = committedCustomer({ licenses: 50 });
    const utils = setup();
    selectLicenses(utils, 'custom');
    setCustomLicenses(utils, '20');
    clickSend(utils);

    selectLicenses(utils, '100');

    expect(utils.queryByTestId('notification-error')).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('shows no minimum error before the first Send', () => {
    mockCustomerData = committedCustomer({ licenses: 50 });
    const utils = setup();

    selectLicenses(utils, 'custom');
    setCustomLicenses(utils, '20');

    expect(utils.queryByTestId('notification-error')).toBeNull();
  });

  it('rejects consumables below the committed minimum', () => {
    mockCustomerData = committedCustomer({ consumables: 2500 });
    const utils = setup();

    selectConsumables(utils, 'custom');
    fireEvent.change(utils.getByTestId('input-customConsumables'), { target: { value: '1000' } });
    clickSend(utils);

    expect(
      utils.getByText('Consumables cannot be lower than the current committed minimum of 2500.'),
    ).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('closes recommitment outside the window and says when it opens', () => {
    mockCustomerData = committedCustomer({ licenses: 10, endsInDays: 400 });
    const utils = setup();

    const opensOn = isoDateFromToday(370);
    const endDate = isoDateFromToday(400);
    expect(optionLabelled(utils, 'recommitment').disabled).toBe(true);
    expect(
      utils.getByText(
        `Recommitment opens on ${opensOn}, 30 days before the commitment ends on ${endDate}.`,
      ),
    ).toBeTruthy();
  });

  it('closes recommitment for a customer without an active commitment', () => {
    const utils = setup();

    expect(optionLabelled(utils, 'recommitment').disabled).toBe(true);
    expect(
      utils.getByText(
        'Recommitment is available only to customers with an active three-year commitment.',
      ),
    ).toBeTruthy();
  });

  it('refuses a recommitment the customer is not eligible for', () => {
    const utils = setup();

    setRequestType(utils, 'recommitment');
    selectLicenses(utils, '10');
    clickSend(utils);

    expect(utils.getByText('Recommitment is not available for this customer.')).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('lets a pending request be replaced, and says so', async () => {
    mockCustomerData = committedCustomer({ licenses: 10, pendingRequest: true });
    const utils = setup();

    expect(utils.getByTestId('notification-info').textContent).toContain(
      'A commitment request for 100 licenses is awaiting acceptance in the Adobe Admin Console. Sending a new commitment request replaces it.',
    );
    expect((utils.getByText('Send invitation') as HTMLButtonElement).disabled).toBe(false);

    selectLicenses(utils, '50');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            commitmentRequest: {
              minimumQuantities: [{ offerType: 'LICENSE', quantity: 50 }],
            },
          },
        ],
      }),
    );
  });

  it.each([
    ['accepted', { acceptedRecommitment: true }],
    ['pending', { pendingRecommitment: true }],
  ])('blocks a commitment request while a recommitment is %s', (_state, options) => {
    mockCustomerData = committedCustomer({ licenses: 10, ...options });
    const utils = setup();

    expect(
      utils.getAllByTestId('notification-info').some((notice) =>
        (notice.textContent ?? '').includes('has a recommitment request in place'),
      ),
    ).toBe(true);
    expect((utils.getByText('Send invitation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets a pending recommitment be replaced through the recommitment path', async () => {
    mockCustomerData = committedCustomer({ licenses: 10, endsInDays: 20, pendingRecommitment: true });
    const utils = setup();

    setRequestType(utils, 'recommitment');
    selectLicenses(utils, '50');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            recommitmentRequest: {
              minimumQuantities: [{ offerType: 'LICENSE', quantity: 50 }],
            },
          },
        ],
      }),
    );
  });


  it('allows a recommitment below the current committed minimum', async () => {
    mockCustomerData = committedCustomer({ licenses: 50, endsInDays: 20 });
    const utils = setup();

    setRequestType(utils, 'recommitment');
    selectLicenses(utils, '10');
    clickSend(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        benefits: [
          {
            type: 'THREE_YEAR_COMMIT',
            recommitmentRequest: {
              minimumQuantities: [{ offerType: 'LICENSE', quantity: 10 }],
            },
          },
        ],
      }),
    );
  });

  it('does not close when submission fails', async () => {
    mockSubmit = jest.fn().mockResolvedValue(false);
    const utils = setup();

    selectLicenses(utils, '10');
    clickSend(utils);

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
    expect(utils.getByText('The 3YC request has been submitted to Adobe.')).toBeTruthy();
  });

  it('closes without data when Close is clicked', () => {
    const utils = setup();
    fireEvent.click(utils.getByText('Close'));
    expect(mockClose).toHaveBeenCalledWith();
  });
});

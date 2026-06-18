import { ChangeEvent, ReactNode } from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import App from './App';
import type { AdobeCustomerData } from '../agreement/model';
import type { Status } from '../agreement/hooks/useAgreementSync';

const mockClose = jest.fn();
let mockCustomerData: AdobeCustomerData | null = null;
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

jest.mock('../agreement/hooks/useSettings', () => ({
  useSettings: () => ({ products: [{ id: 'PRD-1', segment: 'COM' }] }),
}));

jest.mock('../agreement/hooks/useAgreementId', () => ({
  useAgreementId: () => 'AGR-1234-5678-9012',
}));

jest.mock('../agreement/hooks/useAdobeCustomer', () => ({
  useAdobeCustomer: () => ({
    status: 'success',
    error: null,
    data: mockCustomerData,
    update: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('../agreement/hooks/useThreeYearCommitmentRequest', () => ({
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
  options: MockOption[];
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
        <option key={index} value={option.value} disabled={option.disabled}>
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

function committedCustomer(minimumLicenses?: number): AdobeCustomerData {
  return {
    benefits: [
      {
        type: 'THREE_YEAR_COMMIT',
        commitment: {
          status: 'COMMITTED',
          minimumQuantities:
            minimumLicenses != null
              ? [{ offerType: 'LICENSE', quantity: minimumLicenses }]
              : [],
        },
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

const clickSend = (utils: ReturnType<typeof setup>) =>
  fireEvent.click(utils.getByText('Send invitation'));

describe('request-commitment-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockSubmit = jest.fn().mockResolvedValue({ customerId: 'P1' } as AdobeCustomerData);
    mockCustomerData = null;
    mockStatus = 'idle';
    mockError = '';
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

  it('submits a recommitment payload when recommitment is selected', async () => {
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

  it('rejects a commitment when the customer is already committed', () => {
    mockCustomerData = committedCustomer();
    const utils = setup();

    setRequestType(utils, 'commitment');
    selectLicenses(utils, '10');
    clickSend(utils);

    expect(
      utils.getByText('The customer is already committed. Select recommitment instead.'),
    ).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a quantity that is not above the current minimum', () => {
    mockCustomerData = committedCustomer(50);
    const utils = setup();

    setRequestType(utils, 'recommitment');
    selectLicenses(utils, '10');
    clickSend(utils);

    expect(
      utils.getByText('Licenses must be greater than the current minimum (50).'),
    ).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
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

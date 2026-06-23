import { ChangeEvent, ReactNode } from 'react';

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

jest.mock('../shared/hooks/useLinkedMembershipRequest', () => ({
  useLinkedMembershipRequest: () => ({
    error: mockError,
    status: mockStatus,
    submitRequest: mockSubmit,
    reset: jest.fn(),
  }),
}));

interface MockOption {
  label: ReactNode;
  value: string;
}
interface MockButtonProps {
  children: ReactNode;
  onClick?: () => void;
  isDisabled?: boolean;
  isBusy?: boolean;
}
interface MockRadioGroupProps {
  name?: string;
  label: ReactNode;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  options: MockOption[];
}
interface MockInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isDisabled?: boolean;
  description?: string;
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/radio', () => ({
  RadioButtonGroup: ({ name, value, onChange, options }: MockRadioGroupProps) => (
    <select
      aria-label="Linked membership type"
      data-testid={`radio-${name}`}
      value={value}
      onChange={(event) => onChange(event as unknown as ChangeEvent<HTMLInputElement>)}
    >
      {options.map((option, index) => (
        <option key={index} value={option.value}>
          {option.value}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/input', () => ({
  Input: ({ label, name, value, onChange, isDisabled }: MockInputProps) => (
    <input
      aria-label={label}
      data-testid={`input-${name}`}
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
  BoldText: ({ children }: MockTextProps) => <span>{children}</span>,
  RegularText: ({ children }: MockTextProps) => <span>{children}</span>,
}));

function setup() {
  return render(<App />);
}

const setName = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Linked membership name'), { target: { value } });

const setType = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Linked membership type'), { target: { value } });

const clickCreate = (utils: ReturnType<typeof setup>) =>
  fireEvent.click(utils.getByText('Create'));

describe('request-linked-membership-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockSubmit = jest.fn().mockResolvedValue({ customerId: 'P1' } as AdobeCustomerData);
    mockStatus = 'idle';
    mockError = '';
    mockCustomerData = null;
  });

  const committedCustomer: AdobeCustomerData = {
    benefits: [
      {
        type: 'THREE_YEAR_COMMIT',
        commitment: { status: 'COMMITTED', minimumQuantities: [] },
      },
    ],
  };

  it('renders the title', () => {
    const utils = setup();
    expect(utils.getByText('Create linked membership')).toBeTruthy();
  });

  it('blocks submission and shows an error when no name is provided', () => {
    const utils = setup();

    clickCreate(utils);

    expect(utils.getByText('A linked membership name is required.')).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('submits the name with the default Standard type and closes with the customer', async () => {
    const utils = setup();

    setName(utils, 'S.H.I.E.L.D. Linked Membership');
    clickCreate(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        name: 'S.H.I.E.L.D. Linked Membership',
        type: 'STANDARD',
      }),
    );
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith({ customer: { customerId: 'P1' } }));
  });

  it('submits the selected Consortium type', async () => {
    const utils = setup();

    setType(utils, 'CONSORTIUM');
    setName(utils, 'Avengers Consortium');
    clickCreate(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        name: 'Avengers Consortium',
        type: 'CONSORTIUM',
      }),
    );
  });

  it('trims whitespace from the name before submitting', async () => {
    const utils = setup();

    setName(utils, '   Padded Name   ');
    clickCreate(utils);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({ name: 'Padded Name', type: 'STANDARD' }),
    );
  });

  it('does not close when submission fails', async () => {
    mockSubmit = jest.fn().mockResolvedValue(false);
    const utils = setup();

    setName(utils, 'My Group');
    clickCreate(utils);

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
    expect(utils.getByText('The linked membership request has been submitted to Adobe.')).toBeTruthy();
  });

  it('closes without data when Close is clicked', () => {
    const utils = setup();
    fireEvent.click(utils.getByText('Close'));
    expect(mockClose).toHaveBeenCalledWith();
  });

  it('disables Create and warns when the customer has a 3-year commitment', () => {
    mockCustomerData = committedCustomer;
    const utils = setup();

    expect(
      utils.getByText(
        'This customer has a 3-year commitment and cannot create a linked membership.',
      ),
    ).toBeTruthy();
    expect((utils.getByText('Create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not submit when the customer has a 3-year commitment', () => {
    mockCustomerData = committedCustomer;
    const utils = setup();

    setName(utils, 'Blocked Membership');
    clickCreate(utils);

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

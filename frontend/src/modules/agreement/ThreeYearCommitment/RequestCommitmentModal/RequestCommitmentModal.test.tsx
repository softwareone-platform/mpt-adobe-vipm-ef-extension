import { ChangeEvent, ReactNode } from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import { RequestCommitmentModal } from './RequestCommitmentModal';

// Minimal prop shapes for the mocked SDK components. Only the props the modal
// actually passes are typed; everything is erased at runtime.
interface MockOption {
  label: string;
  value: string;
  disabled?: boolean;
}
interface MockModalProps {
  isOpen: boolean;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/modal', () => ({
  Modal: ({ isOpen, title, children, actions }: MockModalProps) =>
    isOpen ? (
      <div data-testid="modal">
        <div>{title}</div>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
}));

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
  BoldText: ({ children }: MockTextProps) => <span>{children}</span>,
  RegularText: ({ children }: MockTextProps) => <span>{children}</span>,
}));

function setup(overrides: Partial<Parameters<typeof RequestCommitmentModal>[0]> = {}) {
  const onSubmit = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();
  const utils = render(
    <RequestCommitmentModal
      currentEnrollStatus={null}
      currentMinimumConsumables={null}
      currentMinimumLicenses={null}
      disableCommitmentOption={false}
      error=""
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      status="idle"
      {...overrides}
    />,
  );
  return { ...utils, onSubmit, onClose };
}

const selectLicenses = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Discount level'), { target: { value } });

const selectConsumables = (utils: ReturnType<typeof setup>, value: string) =>
  fireEvent.change(utils.getByLabelText('Discount tier'), { target: { value } });

const clickSend = (utils: ReturnType<typeof setup>) =>
  fireEvent.click(utils.getByText('Send invitation'));

describe('RequestCommitmentModal', () => {
  it('renders the title when open', () => {
    const utils = setup();
    expect(utils.getByText('Request 3-year commitment')).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    const utils = setup({ isOpen: false });
    expect(utils.queryByTestId('modal')).toBeNull();
  });

  it('blocks submission and shows an error when no quantity is selected', () => {
    const utils = setup();

    clickSend(utils);

    expect(utils.getByText('At least one quantity is required.')).toBeTruthy();
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('submits a commitment payload and closes on success', async () => {
    const utils = setup();

    selectLicenses(utils, '10');
    clickSend(utils);

    await waitFor(() =>
      expect(utils.onSubmit).toHaveBeenCalledWith({
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
    await waitFor(() => expect(utils.onClose).toHaveBeenCalled());
  });

  it('submits a recommitment payload when recommitment is selected', async () => {
    const utils = setup();

    fireEvent.change(utils.getByTestId('switcher-request-type'), {
      target: { value: 'recommitment' },
    });
    selectConsumables(utils, '1000');
    clickSend(utils);

    await waitFor(() =>
      expect(utils.onSubmit).toHaveBeenCalledWith({
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
      expect(utils.onSubmit).toHaveBeenCalledWith({
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
    const utils = setup({ currentEnrollStatus: 'COMMITTED' });

    selectLicenses(utils, '10');
    clickSend(utils);

    expect(
      utils.getByText('The customer is already committed. Select recommitment instead.'),
    ).toBeTruthy();
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a quantity that is not above the current minimum', () => {
    const utils = setup({ currentMinimumLicenses: 50 });

    selectLicenses(utils, '10');
    clickSend(utils);

    expect(
      utils.getByText('Licenses must be greater than the current minimum (50).'),
    ).toBeTruthy();
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the modal open when submission fails', async () => {
    const utils = setup();
    utils.onSubmit.mockResolvedValue(false);

    selectLicenses(utils, '10');
    clickSend(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    expect(utils.onClose).not.toHaveBeenCalled();
  });

  it('shows the backend error when status is error', () => {
    const utils = setup({ status: 'error', error: 'Adobe rejected the request.' });
    expect(utils.getByText('Adobe rejected the request.')).toBeTruthy();
  });

  it('shows a success notification when status is success', () => {
    const utils = setup({ status: 'success' });
    expect(utils.getByText('The 3YC request has been submitted to Adobe.')).toBeTruthy();
  });

  it('closes when the Close button is clicked', () => {
    const utils = setup();
    fireEvent.click(utils.getByText('Close'));
    expect(utils.onClose).toHaveBeenCalled();
  });
});

import { ReactNode } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import App from './App';

const mockClose = jest.fn();
let mockActiveStepIndex = 0;
let mockAccountType = 'Client';

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  useMPTContext: () => ({
    auth: { account: { type: mockAccountType } },
    data: { agreement: { id: 'AGR-1' } },
  }),
}), { virtual: true });

const AGREEMENT = {
  id: 'AGR-1',
  name: 'Agreement Name',
  status: 'Active',
  product: { id: 'PRD-1', name: 'Adobe VIP Marketplace for Education' },
  parameters: {
    fulfillment: [
      { id: 'PAR-1', externalId: 'cotermDate', name: 'Anniversary date', value: '2027-06-02' },
    ],
  },
};

const SUBSCRIPTIONS = [{ id: 'SUB-1', name: 'Subscription One' }];

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
    get: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);
const mockGet = jest.mocked(http.get);

function respondTo(url: string) {
  if (url === '/api/v2/settings') {
    return Promise.resolve({ data: { data: { products: [{ id: 'PRD-1', segment: 'COM' }] } } });
  }
  return Promise.resolve({ data: { data: SUBSCRIPTIONS } });
}

interface MockChildren {
  children?: ReactNode | ((args: { activeStepIndex: number }) => ReactNode);
}
interface MockWizardProps extends MockChildren {
  onClose?: () => void;
  stepsProps?: { title: string }[];
}
let wizardSteps: { title: string }[] = [];

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => {
  const Wizard = ({ children, onClose, stepsProps }: MockWizardProps) => {
    wizardSteps = stepsProps ?? [];
    return (
      <div>
        {children as ReactNode}
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
  Wizard.Header = ({ children }: MockChildren) => <div>{children as ReactNode}</div>;
  const Content = ({ children }: MockChildren) => <div>{children as ReactNode}</div>;
  Content.Steps = () => <div />;
  Content.StepContent = ({ children }: MockChildren) => (
    <div>
      {typeof children === 'function' ? children({ activeStepIndex: mockActiveStepIndex }) : children}
    </div>
  );
  Wizard.Content = Content;
  Wizard.Actions = () => <div />;
  return { Wizard };
});

interface TimingProps {
  renewalDate?: string;
  path: string;
  onPathChange: (path: string) => void;
}
let timingProps: TimingProps;

jest.mock('./TimingStep', () => ({
  TimingStep: (props: TimingProps) => {
    timingProps = props;
    return <div>Timing step</div>;
  },
}));

jest.mock('../shared/components/Loader/Loader', () => ({
  Loader: () => <div data-testid="loader" />,
}));

interface MockButtonProps {
  children: ReactNode;
  onClick?: () => void;
}
interface MockNotificationProps {
  status: string;
  children: ReactNode;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick }: MockButtonProps) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ status, children }: MockNotificationProps) => (
    <div data-testid={`notification-${status}`}>{children}</div>
  ),
}));

describe('request-renewal-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockActiveStepIndex = 0;
    mockAccountType = 'Client';
    mockPost.mockReset();
    mockGet.mockReset();
    mockPost.mockResolvedValue({ data: { data: AGREEMENT } });
    mockGet.mockImplementation((url: string) => respondTo(url));
  });

  it('renders the wizard header for the renewed product and the timing step', async () => {
    render(<App />);

    expect(await screen.findByText('Renew Adobe VIP Marketplace for Education')).toBeTruthy();
    expect(screen.getByText('Timing step')).toBeTruthy();
  });

  it('lays out the seven renewal steps in order', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(wizardSteps.map((step) => step.title)).toEqual([
      'Timing',
      'Renewal',
      'Items',
      'Promotions',
      'Details',
      'Review order',
      'Summary',
    ]);
  });

  it('loads the agreement and its subscriptions on open', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1/sync');
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/agreements/AGR-1/subscriptions',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('hands the renewal date and the selected path to the timing step', async () => {
    render(<App />);

    await screen.findByText('Timing step');
    expect(timingProps.renewalDate).toBe('2027-06-02');
    expect(timingProps.path).toBe('anniversary');
    expect(typeof timingProps.onPathChange).toBe('function');
  });

  it('shows the loader until the agreement is loaded', async () => {
    render(<App />);

    expect(screen.getByTestId('loader')).toBeTruthy();

    await screen.findByText('Timing step');
    expect(screen.queryByTestId('loader')).toBeNull();
  });

  it('offers a retry when the agreement cannot be loaded', async () => {
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));
    render(<App />);

    expect(await screen.findByTestId('notification-error')).toBeTruthy();
    expect(screen.getByText('Marketplace unavailable')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
  });

  it('offers a retry when the agreement subscriptions cannot be loaded', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/subscriptions'
        ? Promise.reject(new Error('Subscriptions unavailable'))
        : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Subscriptions unavailable')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() =>
      expect(
        mockGet.mock.calls.filter(([url]) => url === '/api/v2/agreements/AGR-1/subscriptions'),
      ).toHaveLength(2),
    );
  });

  it('reports settings failures', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/settings' ? Promise.reject(new Error('nope')) : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Settings could not be loaded.')).toBeTruthy();
  });

  it('keeps the wizard from non-client accounts', async () => {
    mockAccountType = 'Operations';
    render(<App />);

    expect(await screen.findByText('Not available')).toBeTruthy();
    expect(screen.queryByText('Timing step')).toBeNull();
  });

  it('tells a restricted account it cannot renew even when the subscriptions fail', async () => {
    mockAccountType = 'Operations';
    mockGet.mockImplementation((url: string) =>
      url === '/api/v2/agreements/AGR-1/subscriptions'
        ? Promise.reject(new Error('Subscriptions unavailable'))
        : respondTo(url),
    );
    render(<App />);

    expect(await screen.findByText('Not available')).toBeTruthy();
    expect(screen.queryByText('Subscriptions unavailable')).toBeNull();
  });

  it('closes the modal from the wizard', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Close'));

    expect(mockClose).toHaveBeenCalled();
  });
});

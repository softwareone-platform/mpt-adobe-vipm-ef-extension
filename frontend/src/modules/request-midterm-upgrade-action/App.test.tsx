import { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import App from './App';

const mockClose = jest.fn();
let mockActiveStepIndex = 0;

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTModal: () => ({ open: jest.fn(), close: mockClose }),
  useMPTContext: () => ({}),
}), { virtual: true });

interface MockChildren {
  children?: ReactNode | ((args: { activeStepIndex: number }) => ReactNode);
}
interface MockWizardProps extends MockChildren {
  onClose?: () => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => {
  const Wizard = ({ children, onClose }: MockWizardProps) => (
    <div>
      {children as ReactNode}
      <button onClick={onClose}>Close</button>
    </div>
  );
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

jest.mock('./UpgradeFromStep', () => ({
  UpgradeFromStep: () => <div>Upgrade from step</div>,
}));

jest.mock('./UpgradeToStep', () => ({
  UpgradeToStep: () => <div>Upgrade to step</div>,
}));

interface SplitBillingProps {
  addBuyerToOrder: (buyer: { id?: string }) => Promise<void>;
  selectedBuyer: unknown;
  onChange: (buyer: unknown) => void;
}
let splitBillingProps: SplitBillingProps;

jest.mock('./SplitBillingStep', () => ({
  SplitBillingStep: (props: SplitBillingProps) => {
    splitBillingProps = props;
    return <div>Split billing step</div>;
  },
}));

interface DetailsProps {
  order: unknown;
  setOrder: (order: unknown) => void;
}
let detailsProps: DetailsProps;

jest.mock('./DetailsStep', () => ({
  DetailsStep: (props: DetailsProps) => {
    detailsProps = props;
    return <div>Details step</div>;
  },
}));

jest.mock('./components/loader/Loader', () => ({
  Loader: () => <div data-testid="loader" />,
}));

describe('request-midterm-upgrade-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockActiveStepIndex = 0;
  });

  it('renders the wizard header and the upgrade-from step once loaded', async () => {
    render(<App />);

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.getByText('Upgrade from step')).toBeTruthy();
  });

  it('renders the upgrade-to step on the second step', async () => {
    mockActiveStepIndex = 1;
    render(<App />);

    expect(await screen.findByText('Upgrade to step')).toBeTruthy();
    expect(screen.queryByText('Upgrade from step')).toBeNull();
  });

  it('renders the split-billing step on the third step and wires its props', async () => {
    mockActiveStepIndex = 2;
    render(<App />);

    expect(await screen.findByText('Split billing step')).toBeTruthy();
    expect(typeof splitBillingProps.addBuyerToOrder).toBe('function');
    expect(typeof splitBillingProps.onChange).toBe('function');
    expect(splitBillingProps.selectedBuyer).toBeDefined();
  });

  it('renders the details step on the fourth step and wires its props', async () => {
    mockActiveStepIndex = 3;
    render(<App />);

    expect(await screen.findByText('Details step')).toBeTruthy();
    expect(detailsProps.order).toBeDefined();
    expect(typeof detailsProps.setOrder).toBe('function');
  });

  it('renders no step content for an unknown step index', async () => {
    mockActiveStepIndex = 4;
    render(<App />);

    expect(await screen.findByText('Upgrade subscription')).toBeTruthy();
    expect(screen.queryByText('Upgrade from step')).toBeNull();
    expect(screen.queryByText('Upgrade to step')).toBeNull();
    expect(screen.queryByText('Split billing step')).toBeNull();
    expect(screen.queryByText('Details step')).toBeNull();
  });

  it('closes when the wizard close action is clicked', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Close'));

    expect(mockClose).toHaveBeenCalled();
  });
});

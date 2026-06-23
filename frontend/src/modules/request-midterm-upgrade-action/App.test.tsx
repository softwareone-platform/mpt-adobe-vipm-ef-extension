import { ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

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

jest.mock('@softwareone-platform/sdk-react-ui-v0/text', () => ({
  MediumText: ({ children }: MockChildren) => <span>{children as ReactNode}</span>,
  RegularText: ({ children }: MockChildren) => <span>{children as ReactNode}</span>,
}));

describe('request-midterm-upgrade-action App', () => {
  beforeEach(() => {
    mockClose.mockReset();
    mockActiveStepIndex = 0;
  });

  it('renders the wizard header and the upgrade-from step', () => {
    const utils = render(<App />);

    expect(utils.getByText('Request mid-term upgrade')).toBeTruthy();
    expect(utils.getByText('Upgrade from.')).toBeTruthy();
  });

  it('renders no step content for an unknown step index', () => {
    mockActiveStepIndex = 1;
    const utils = render(<App />);

    expect(utils.queryByText('Upgrade from.')).toBeNull();
  });

  it('closes when the wizard close action is clicked', () => {
    const utils = render(<App />);

    fireEvent.click(utils.getByText('Close'));

    expect(mockClose).toHaveBeenCalled();
  });
});

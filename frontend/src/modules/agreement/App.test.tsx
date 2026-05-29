import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { http } from '@mpt-extension/sdk';
import { useMPTContext } from '@mpt-extension/sdk-react';

import App from './App';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: jest.fn(),
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/chip', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Chip: ({ label }: { label?: string }) => React.createElement('span', null, label),
  };
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/divider', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Divider: () => React.createElement('hr', null),
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

jest.mock('@softwareone-platform/sdk-react-ui-v0/utils', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    DesignSystemOptionsProvider: ({ children }: { children?: import('react').ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const mockPost = jest.mocked(http.post);
const mockUseMPTContext = jest.mocked(useMPTContext);

describe('agreement plug app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the sync as successful after a successful request', async () => {
    mockUseMPTContext.mockReturnValue({ data: { agreement: { id: 'AGR-1234-5678-9012' } } });
    mockPost.mockResolvedValue({ data: { data: {} } });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v2/agreements/AGR-1234-5678-9012/sync');
    });
    expect(await screen.findAllByText('Success')).not.toHaveLength(0);
  });

  it('disables synchronization when the agreement context is missing', () => {
    mockUseMPTContext.mockReturnValue({});

    render(<App />);

    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
    expect(screen.getByText('Agreement context was not provided by Marketplace.')).toBeInTheDocument();
  });

  it('renders synchronization errors', async () => {
    mockUseMPTContext.mockReturnValue({ data: { agreement: { id: 'AGR-1234-5678-9012' } } });
    mockPost.mockRejectedValue(new Error('Marketplace unavailable'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByText('Marketplace unavailable')).toBeInTheDocument();
  });
});

import { ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import { ProgressModal } from './ProgressModal';

interface ModalProps {
  isOpen: boolean;
  children?: ReactNode;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/modal', () => ({
  Modal: ({ isOpen, children, testId }: ModalProps) =>
    isOpen ? <div data-testid={testId}>{children}</div> : null,
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="spinner" />,
}));

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick, testId }: ButtonProps) => (
    <button data-testid={testId} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('ProgressModal', () => {
  it('shows the spinner and what is in progress', () => {
    const { getByTestId, getByText } = render(
      <ProgressModal isOpen label="Validating" onCancel={jest.fn()} />,
    );

    expect(getByTestId('progress-modal')).toBeTruthy();
    expect(getByTestId('spinner')).toBeTruthy();
    expect(getByText('Validating')).toBeTruthy();
  });

  it('stays out of the way while nothing is in flight', () => {
    const { queryByTestId } = render(
      <ProgressModal isOpen={false} label="Validating" onCancel={jest.fn()} />,
    );

    expect(queryByTestId('progress-modal')).toBeNull();
  });

  it('reports the customer cancelling', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <ProgressModal isOpen label="Placing order" onCancel={onCancel} />,
    );

    fireEvent.click(getByTestId('progress-modal-cancel'));

    expect(onCancel).toHaveBeenCalled();
  });
});

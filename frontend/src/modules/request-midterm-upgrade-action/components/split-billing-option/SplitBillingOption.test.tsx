import { ChangeEvent, ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import { SplitBillingOption } from './SplitBillingOption';

interface SelectionBoxProps {
  value?: string;
  title?: ReactNode;
  children?: ReactNode;
  isDisabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/selection-box', () => ({
  SelectionBox: ({ value, title, children, isDisabled, onChange }: SelectionBoxProps) => (
    <button
      data-testid={`box-${value}`}
      disabled={isDisabled}
      onClick={() => onChange?.({ target: { value } } as ChangeEvent<HTMLInputElement>)}
    >
      <span>{title}</span>
      <span>{children}</span>
    </button>
  ),
}));

describe('SplitBillingOption', () => {
  it('renders both options with their descriptions', () => {
    const { getByTestId, getByText } = render(<SplitBillingOption onSelect={jest.fn()} />);

    expect(getByTestId('box-percentages')).toBeTruthy();
    expect(getByTestId('box-buyer')).toBeTruthy();
    expect(getByText('Allocate billing in line with current billing split percentages')).toBeTruthy();
    expect(getByText('Allocate billing to specific buyer')).toBeTruthy();
  });

  it('disables the buyer option when there are no buyers to pick', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(<SplitBillingOption onSelect={onSelect} isBuyerDisabled />);

    fireEvent.click(getByTestId('box-buyer'));

    expect((getByTestId('box-buyer') as HTMLButtonElement).disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect with the chosen option value', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(<SplitBillingOption onSelect={onSelect} />);

    fireEvent.click(getByTestId('box-buyer'));
    fireEvent.click(getByTestId('box-percentages'));

    expect(onSelect).toHaveBeenNthCalledWith(1, 'buyer');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'percentages');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

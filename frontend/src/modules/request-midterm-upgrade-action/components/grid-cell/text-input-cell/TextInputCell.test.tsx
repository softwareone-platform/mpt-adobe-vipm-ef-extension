import { fireEvent, render } from '@testing-library/react';

import { TextInputCell } from './TextInputCell';

describe('TextInputCell', () => {
  it('renders the input inside a grid cell', () => {
    const { getByTestId, getByRole } = render(<TextInputCell value="7" />);

    expect(getByTestId('grid-cell-simple')).toBeTruthy();
    expect(getByRole('textbox')).toHaveValue('7');
  });

  it('is enabled by default', () => {
    const { getByRole } = render(<TextInputCell value="7" />);

    expect(getByRole('textbox')).toBeEnabled();
  });

  it('disables the input when not enabled', () => {
    const { getByRole } = render(<TextInputCell value="7" enabled={false} />);

    expect(getByRole('textbox')).toBeDisabled();
  });

  it('calls onChange with the new value', () => {
    const onChange = jest.fn();
    const { getByRole } = render(<TextInputCell value="7" onChange={onChange} />);

    fireEvent.change(getByRole('textbox'), { target: { value: '12' } });

    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('does not throw when onChange is omitted', () => {
    const { getByRole } = render(<TextInputCell value="7" />);

    expect(() => fireEvent.change(getByRole('textbox'), { target: { value: '12' } })).not.toThrow();
  });
});

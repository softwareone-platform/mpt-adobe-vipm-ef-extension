import { fireEvent, render } from '@testing-library/react';

import { CodeCombobox } from './CodeCombobox';

interface MockDropdownProps {
  options: { label: string; value: string }[];
  isOpen: boolean;
  isOpenChange: (isOpen: boolean) => void;
  onItemSelected: (value: string) => void;
  headerContent: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}

interface MockInputProps {
  value: string;
  placeholder?: string;
  testId?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onKeyDown?: (event: { key: string }) => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/dropdown', () => ({
  Dropdown: ({
    options,
    isOpen,
    isOpenChange,
    onItemSelected,
    headerContent,
    children,
    testId,
  }: MockDropdownProps) => (
    <div data-testid={testId}>
      <button type="button" data-testid="open" onClick={() => isOpenChange(true)}>
        open
      </button>
      <button type="button" data-testid="close" onClick={() => isOpenChange(false)}>
        close
      </button>
      {children}
      {isOpen ? headerContent : null}
      <ul>
        {options.map((option) => (
          <li key={option.value}>
            <button type="button" onClick={() => onItemSelected(option.value)}>
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/input', () => ({
  Input: ({ value, placeholder, testId, onChange, onKeyDown }: MockInputProps) => (
    <input
      data-testid={testId}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      onKeyDown={(event) => onKeyDown?.({ key: event.key })}
    />
  ),
}));

const OPTIONS = [
  { label: 'CODE-ONE (Winter promotion)', value: 'CODE-ONE' },
  { label: 'CODE-TWO (Spring promotion)', value: 'CODE-TWO' },
];

const renderCombobox = (onChange = jest.fn()) => ({
  onChange,
  ...render(
    <CodeCombobox value="" options={OPTIONS} placeholder="Select or type code" onChange={onChange} />,
  ),
});

describe('CodeCombobox', () => {
  it('offers every known code until the customer types', () => {
    const { getByTestId, getAllByRole } = renderCombobox();

    fireEvent.click(getByTestId('open'));

    expect(getAllByRole('listitem')).toHaveLength(2);
  });

  it('narrows the list to what the customer typed', () => {
    const { getByTestId, getAllByRole } = renderCombobox();

    fireEvent.click(getByTestId('open'));
    fireEvent.change(getByTestId('code-combobox__search'), { target: { value: 'two' } });

    expect(getAllByRole('listitem')).toHaveLength(1);
  });

  it('yields the code a customer picks from the list', () => {
    const { getByTestId, getByText, onChange } = renderCombobox();

    fireEvent.click(getByTestId('open'));
    fireEvent.click(getByText('CODE-ONE (Winter promotion)'));

    expect(onChange).toHaveBeenCalledWith('CODE-ONE');
  });

  it('takes a code the store does not hold, on Enter', () => {
    const { getByTestId, onChange } = renderCombobox();

    fireEvent.click(getByTestId('open'));
    fireEvent.change(getByTestId('code-combobox__search'), { target: { value: 'typed-code' } });
    fireEvent.keyDown(getByTestId('code-combobox__search'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('TYPED-CODE');
  });

  it('takes what was typed when the list closes', () => {
    const { getByTestId, onChange } = renderCombobox();

    fireEvent.click(getByTestId('open'));
    fireEvent.change(getByTestId('code-combobox__search'), { target: { value: 'typed-code' } });
    fireEvent.click(getByTestId('close'));

    expect(onChange).toHaveBeenCalledWith('TYPED-CODE');
  });

  it('refuses a code the list offers as unavailable', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CodeCombobox
        value=""
        options={[{ label: 'CODE-ONE (already redeemed)', value: 'CODE-ONE', isDisabled: true }]}
        placeholder="Select or type code"
        onChange={onChange}
      />,
    );

    fireEvent.click(getByTestId('open'));
    fireEvent.change(getByTestId('code-combobox__search'), { target: { value: 'code-one' } });
    fireEvent.keyDown(getByTestId('code-combobox__search'), { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the code alone when the list closes untouched', () => {
    const { getByTestId, onChange } = renderCombobox();

    fireEvent.click(getByTestId('open'));
    fireEvent.click(getByTestId('close'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

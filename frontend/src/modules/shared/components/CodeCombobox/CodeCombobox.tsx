import { useCallback, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { Dropdown } from '@softwareone-platform/sdk-react-ui-v0/dropdown';
import { Input } from '@softwareone-platform/sdk-react-ui-v0/input';

export interface CodeComboboxOption {
  label: string;
  value: string;
  isDisabled?: boolean;
}

export interface CodeComboboxProps {
  value: string;
  options: CodeComboboxOption[];
  placeholder?: string;
  testId?: string;
  onChange: (value: string) => void;
}

export function CodeCombobox({
  value,
  options,
  placeholder,
  testId = 'code-combobox',
  onChange,
}: CodeComboboxProps) {
  const [isOpen, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const listed = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return typed
      ? options.filter((option) => option.label.toLowerCase().includes(typed))
      : options;
  }, [options, search]);

  const selectOption = useCallback(
    (code: string) => {
      onChange(code);
      setSearch('');
      setOpen(false);
    },
    [onChange],
  );

  const commitTyped = useCallback(() => {
    const typed = search.trim().toUpperCase();
    const known = options.find((option) => option.value === typed);
    if (typed && !known?.isDisabled) {
      selectOption(typed);
    }
  }, [options, search, selectOption]);

  return (
    <Dropdown
      value={value}
      options={isOpen ? listed : []}
      isOpen={isOpen}
      isOpenChange={(open: boolean) => {
        if (!open) commitTyped();
        setOpen(open);
      }}
      isInput
      isToUseCustomSearch
      popoverCssPosition="fixed"
      positions={{ position: 'bottom' }}
      maxHeight={260}
      onItemSelected={selectOption}
      testId={`${testId}__dropdown`}
      headerContent={
        <Input
          name={`${testId}__search`}
          value={search}
          placeholder={placeholder}
          isPreventAutocomplete
          onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') commitTyped();
          }}
          testId={`${testId}__search`}
        />
      }
    >
      <Input
        name={testId}
        type="right-icon"
        value={value}
        placeholder={placeholder}
        isReadOnly
        isPreventAutocomplete
        testId={testId}
      />
    </Dropdown>
  );
}

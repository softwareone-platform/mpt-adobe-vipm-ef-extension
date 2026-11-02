import { Dropdown } from "@softwareone-platform/sdk-react-ui-v0/dropdown";
import { Icon } from "@softwareone-platform/sdk-react-ui-v0/icon";
import { Input } from "@softwareone-platform/sdk-react-ui-v0/input";
import { useCallback, useState } from "react";

import type { ListItem } from "@softwareone-platform/sdk-react-ui-v0/dropdown";

export interface SingleSelectDropdownProps {
  className?: string;
  controlLabel: string;
  errorMessage?: string;
  name: string;
  onChange: (value: string) => void;
  options: ListItem<string>[];
  placeholder?: string;
  testId: string;
  value: string;
}

export function SingleSelectDropdown({
  className,
  controlLabel,
  errorMessage,
  name,
  onChange,
  options,
  placeholder,
  testId,
  value,
}: SingleSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const onItemSelected = useCallback(
    (selected: string) => onChange(selected),
    [onChange],
  );

  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

  return (
    <Dropdown<string>
      isOpen={isOpen}
      isOpenChange={setIsOpen}
      onItemSelected={onItemSelected}
      options={options}
      popoverCssPosition="fixed"
      testId={`${testId}__dropdown`}
      value={value}
    >
      <Input
        className={className}
        errorMessage={errorMessage}
        isPreventAutocomplete
        isReadOnly
        label={controlLabel}
        name={name}
        placeholder={placeholder}
        rightContent={
          <Icon
            name={isOpen ? "arrow_up_keyboard" : "arrow_down_keyboard"}
            height={16}
            width={16}
          />
        }
        testId={testId}
        type="right-icon"
        value={selectedLabel}
        variant="auto"
      />
    </Dropdown>
  );
}

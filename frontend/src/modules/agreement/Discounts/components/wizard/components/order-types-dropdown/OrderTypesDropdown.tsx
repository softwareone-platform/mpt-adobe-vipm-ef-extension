import { Checkbox } from "@softwareone-platform/sdk-react-ui-v0/checkbox";
import { Divider } from "@softwareone-platform/sdk-react-ui-v0/divider";
import { Dropdown } from "@softwareone-platform/sdk-react-ui-v0/dropdown";
import { Icon } from "@softwareone-platform/sdk-react-ui-v0/icon";
import { RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { ANY_ORDER_TYPE } from "../../discountDraft";

import type {
  DropdownListOptionProps,
  ListOption,
} from "@softwareone-platform/sdk-react-ui-v0/dropdown";
import type { OrderTypeSelection } from "../../discountDraft";

import "./OrderTypesDropdown.scss";

const OPTIONS: ListOption<OrderTypeSelection>[] = [
  { label: "Any", value: ANY_ORDER_TYPE },
  { type: "divider" },
  { label: "Add seats", value: "NEW" },
  { label: "Renewal", value: "RENEWAL" },
];

export interface OrderTypesDropdownProps {
  value: OrderTypeSelection[];
  onChange: (value: OrderTypeSelection[]) => void;
}

/**
 * Multi-select order types, rendered as a checkbox list.
 *
 * "Any" and the specific types are mutually exclusive, and the component
 * enforces it as you click so the validator's rule is normally unreachable.
 */
export function OrderTypesDropdown({ value, onChange }: OrderTypesDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(
    (selected: OrderTypeSelection) => {
      if (selected === ANY_ORDER_TYPE) {
        onChange(value.includes(ANY_ORDER_TYPE) ? [] : [ANY_ORDER_TYPE]);
        return;
      }
      const withoutAny = value.filter((entry) => entry !== ANY_ORDER_TYPE);
      onChange(
        withoutAny.includes(selected)
          ? withoutAny.filter((entry) => entry !== selected)
          : [...withoutAny, selected],
      );
    },
    [onChange, value],
  );

  const renderOption = useCallback(
    ({ option, selectedValue }: DropdownListOptionProps<OrderTypeSelection>) => {
      if ("type" in option) {
        return (
          <li className="order-types__divider">
            <Divider type="full" />
          </li>
        );
      }
      return (
        <li
          className="order-types__option"
          onMouseDown={(e) => {
            // The row owns the pointer: the stylesheet sets pointer-events:none
            // on the checkbox, so its own onChange can never fire from a click.
            // preventDefault also keeps focus off the row, which would otherwise
            // blur the control and close the list.
            e.preventDefault();
            e.stopPropagation();
            toggle(option.value);
          }}
        >
          <Checkbox
            isChecked={selectedValue.includes(option.value)}
            label={t(`Agreement:Discounts:Wizard:OrderTypes:${option.value}`)}
            onChange={() => undefined}
            testId={`order-type-${option.value}`}
          />
        </li>
      );
    },
    [t, toggle],
  );

  const selectedLabels = value
    .map((entry) => t(`Agreement:Discounts:Wizard:OrderTypes:${entry}`))
    .join(", ");

  return (
    <div className="order-types">
      <RegularText as="span" id="order-types-label" size={2} className="order-types__label">
        {t("Agreement:Discounts:Wizard:Fields:ApplicableOrderTypes")}
      </RegularText>
      <Dropdown<OrderTypeSelection>
        isOpen={isOpen}
        isOpenChange={setIsOpen}
        itemElementRenderer={renderOption}
        onItemSelected={toggle}
        options={OPTIONS}
        testId="order-types-dropdown"
        value={value}
      >
        <button
          aria-labelledby="order-types-label"
          className="order-types__control"
          data-testid="order-types-control"
          type="button"
        >
          <span
            className={
              selectedLabels
                ? "order-types__value"
                : "order-types__value order-types__value--placeholder"
            }
          >
            {selectedLabels ||
              t("Agreement:Discounts:Wizard:Fields:ApplicableOrderTypesPlaceholder")}
          </span>
          <Icon name="expand_more" height={16} width={16} />
        </button>
      </Dropdown>
    </div>
  );
}

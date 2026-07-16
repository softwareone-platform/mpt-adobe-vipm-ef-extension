import { ChangeEvent } from 'react';

import { SelectionBox } from '@softwareone-platform/sdk-react-ui-v0/selection-box';

import './SplitBillingOption.scss';

export type SplitBillingOptionValue = 'percentages' | 'buyer';

export function SplitBillingOption({
  onSelect,
}: {
  onSelect: (value: SplitBillingOptionValue) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.value as SplitBillingOptionValue);
  };

  return (
    <div className="split-billing-option">
      <p className="split-billing-option__label">Select split billing option to use with this order</p>
      <SelectionBox
        name="split-billing-option"
        value="percentages"
        onChange={handleChange}
        title="Allocate billing in line with current billing split percentages"
      >
        Billing for this order will be allocated to buyers in line with the split percentages
        configured for this subscription
      </SelectionBox>
      <SelectionBox
        name="split-billing-option"
        value="buyer"
        onChange={handleChange}
        title="Allocate billing to specific buyer"
      >
        Billing for this order will be allocated to an individual buyer from the buyers configured
        for split billing within this agreement
      </SelectionBox>
    </div>
  );
}

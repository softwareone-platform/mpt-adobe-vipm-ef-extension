import { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { SelectionBox } from '@softwareone-platform/sdk-react-ui-v0/selection-box';

import './SplitBillingOption.scss';

export type SplitBillingOptionValue = 'percentages' | 'buyer';

export function SplitBillingOption({
  onSelect,
}: {
  onSelect: (value: SplitBillingOptionValue) => void;
}) {
  const { t } = useTranslation();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.value as SplitBillingOptionValue);
  };

  return (
    <div className="split-billing-option">
      <p className="split-billing-option__label">{t('MidtermUpgrade:SplitBilling:Prompt')}</p>
      <SelectionBox
        name="split-billing-option"
        value="percentages"
        onChange={handleChange}
        title={t('MidtermUpgrade:SplitBilling:Percentages:Title')}
      >
        {t('MidtermUpgrade:SplitBilling:Percentages:Description')}
      </SelectionBox>
      <SelectionBox
        name="split-billing-option"
        value="buyer"
        onChange={handleChange}
        title={t('MidtermUpgrade:SplitBilling:Buyer:Title')}
      >
        {t('MidtermUpgrade:SplitBilling:Buyer:Description')}
      </SelectionBox>
    </div>
  );
}

import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useTranslation } from "react-i18next";

import { DiscountSummary } from "../../components/discount-summary/DiscountSummary";

import type { DiscountDraft } from "../../discountDraft";

import "../../wizardStep.scss";

export interface SummaryStepProps {
  draft: DiscountDraft;
}

/**
 * Confirmation of a discount that already exists on the server.
 *
 * The step registers no navigation guard on purpose: the SDK fires the last
 * step's primary action unconditionally, and there is nothing left to block.
 */
export function SummaryStep({ draft }: SummaryStepProps) {
  const { t } = useTranslation();

  return (
    <div className="wizard-step summary-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Summary:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-5">
          {t("Agreement:Discounts:Wizard:Create:Summary:Description")}
        </RegularText>
      </header>

      <DiscountSummary draft={draft} />
    </div>
  );
}

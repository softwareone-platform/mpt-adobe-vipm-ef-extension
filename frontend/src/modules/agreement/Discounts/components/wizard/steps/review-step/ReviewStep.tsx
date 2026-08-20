import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { DiscountSummary } from "../../components/discount-summary/DiscountSummary";

import type { StepNavigationProperties } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { DiscountDraft } from "../../discountDraft";

import "../../wizardStep.scss";

export interface ReviewStepProps {
  draft: DiscountDraft;
  customerId: string;
  segment: string;
  /** Runs the cross-field checks and the POST; false keeps the wizard here. */
  onSubmit: () => Promise<boolean>;
  errorMessage: string;
}

export function ReviewStep({
  draft,
  customerId,
  segment,
  onSubmit,
  errorMessage,
}: ReviewStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const created = await onSubmit();
      return created ? targetStepIndex : currentStepIndex;
    },
    [onSubmit],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  return (
    <div className="wizard-step review-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Review:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-5">
          {t("Agreement:Discounts:Wizard:Create:Review:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      {errorMessage && (
        <InlineNotification status="error">
          {errorMessage}
        </InlineNotification>
      )}

      <DiscountSummary draft={draft} />
    </div>
  );
}

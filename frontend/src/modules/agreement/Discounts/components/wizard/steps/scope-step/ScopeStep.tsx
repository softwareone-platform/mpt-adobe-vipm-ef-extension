import { Checkbox } from "@softwareone-platform/sdk-react-ui-v0/checkbox";
import { Input } from "@softwareone-platform/sdk-react-ui-v0/input";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { OrderTypesDropdown } from "../../components/order-types-dropdown/OrderTypesDropdown";
import { validateScopeFields } from "../../discountValidation";
import { useFieldErrors } from "../../useFieldErrors";

import type { StepNavigationProperties } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { ChangeEvent } from "react";
import type { DiscountDraft, OrderTypeSelection } from "../../discountDraft";

import "../../wizardStep.scss";
import "./ScopeStep.scss";

const ITEMS_CHARACTER_LIMIT = 500;

export interface ScopeStepProps {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
  submitError?: string;
}

export function ScopeStep({
  draft,
  updateDraft,
  customerId,
  segment,
  submitError = "",
}: ScopeStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const { errors, setErrors, editField } = useFieldErrors(updateDraft);

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const fieldErrors = validateScopeFields(draft);
      setErrors(fieldErrors);
      return Object.keys(fieldErrors).length > 0 ? currentStepIndex : targetStepIndex;
    },
    [draft, setErrors],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  const onOrderTypesChange = useCallback(
    (applicableOrderTypes: OrderTypeSelection[]) => editField({ applicableOrderTypes }),
    [editField],
  );

  const displayedError = errors.applicableOrderTypes || submitError;

  return (
    <div className="wizard-step scope-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Scope:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-4">
          {t("Agreement:Discounts:Wizard:Create:Scope:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      {displayedError && (
        <InlineNotification status="error">
          {displayedError}
        </InlineNotification>
      )}

      <div className="wizard-step__fields">
        <Input
          characterLimit={ITEMS_CHARACTER_LIMIT}
          description={t("Agreement:Discounts:Wizard:Fields:TargetItemsDescription")}
          errorMessage={errors.targetItems}
          htmlInputType="text"
          label={t("Agreement:Discounts:Wizard:Fields:TargetItems")}
          name="targetItems"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            editField({ targetItems: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:TargetItemsPlaceholder")}
          testId="discount-target-items"
          type="textarea"
          value={draft.targetItems}
          variant="auto"
        />

        <Input
          characterLimit={ITEMS_CHARACTER_LIMIT}
          description={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItemsDescription")}
          errorMessage={errors.prerequisiteItems}
          htmlInputType="text"
          label={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItems")}
          labelType="optional"
          name="prerequisiteItems"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            editField({ prerequisiteItems: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItemsPlaceholder")}
          testId="discount-prerequisite-items"
          type="textarea"
          value={draft.prerequisiteItems}
          variant="auto"
        />

        <fieldset className="scope-step__terms">
          <legend className="wizard-step__group-label">
            {t("Agreement:Discounts:Wizard:Fields:SupportedTerms")}
          </legend>
          <div className="scope-step__terms-options">
            <Checkbox
              isChecked={draft.supportsAnnual}
              label={t("Agreement:Discounts:Wizard:Fields:AnnualPlan")}
              name="supportsAnnual"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft({ supportsAnnual: event.target.checked })
              }
              testId="discount-supports-annual"
            />
            <Checkbox
              isChecked={draft.supportsThreeYc}
              label={t("Agreement:Discounts:Wizard:Fields:ThreeYearCommitment")}
              name="supportsThreeYc"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft({ supportsThreeYc: event.target.checked })
              }
              testId="discount-supports-3yc"
            />
          </div>
        </fieldset>

        <OrderTypesDropdown
          onChange={onOrderTypesChange}
          value={draft.applicableOrderTypes}
        />
      </div>
    </div>
  );
}

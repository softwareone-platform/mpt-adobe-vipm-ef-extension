import { Checkbox } from "@softwareone-platform/sdk-react-ui-v0/checkbox";
import { Input } from "@softwareone-platform/sdk-react-ui-v0/input";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { OrderTypesDropdown } from "../../components/order-types-dropdown/OrderTypesDropdown";
import { validateScope } from "../../discountValidation";

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
}

export function ScopeStep({ draft, updateDraft, customerId, segment }: ScopeStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const [error, setError] = useState("");

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const validationError = validateScope(draft);
      setError(validationError ?? "");
      return validationError ? currentStepIndex : targetStepIndex;
    },
    [draft],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  const onOrderTypesChange = useCallback(
    (applicableOrderTypes: OrderTypeSelection[]) => updateDraft({ applicableOrderTypes }),
    [updateDraft],
  );

  return (
    <div className="wizard-step scope-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Scope:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-5">
          {t("Agreement:Discounts:Wizard:Create:Scope:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      {error && (
        <InlineNotification status="error">
          {error}
        </InlineNotification>
      )}

      <div className="wizard-step__fields">
        <Input
          characterLimit={ITEMS_CHARACTER_LIMIT}
          description={t("Agreement:Discounts:Wizard:Fields:TargetItemsDescription")}
          htmlInputType="text"
          label={t("Agreement:Discounts:Wizard:Fields:TargetItems")}
          name="targetItems"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateDraft({ targetItems: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:TargetItemsPlaceholder")}
          testId="discount-target-items"
          type="textarea"
          value={draft.targetItems}
        />

        <Input
          characterLimit={ITEMS_CHARACTER_LIMIT}
          description={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItemsDescription")}
          htmlInputType="text"
          label={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItems")}
          labelType="optional"
          name="prerequisiteItems"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateDraft({ prerequisiteItems: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItemsPlaceholder")}
          testId="discount-prerequisite-items"
          type="textarea"
          value={draft.prerequisiteItems}
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

import { Input } from "@softwareone-platform/sdk-react-ui-v0/input";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { Select } from "@softwareone-platform/sdk-react-ui-v0/select";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { i18n } from "../../../../../../../i18n/translations";
import { MAX_TEXT_LENGTH, validateDefinition } from "../../discountValidation";

import type { StepNavigationProperties } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { ChangeEvent } from "react";
import type { DiscountCategory, DiscountDraft } from "../../discountDraft";
import type { DiscountType } from "../../../../../../shared/model";

import "../../wizardStep.scss";
import "./DefinitionStep.scss";

const DESCRIPTION_HEIGHT = 120;

const CATEGORY_OPTIONS = [
  { label: i18n.t("Agreement:Discounts:Wizard:Categories:STANDARD"), value: "STANDARD" },
  { label: i18n.t("Agreement:Discounts:Wizard:Categories:INTRO"), value: "INTRO" },
];

const DISCOUNT_TYPE_OPTIONS = [
  {
    label: i18n.t("Agreement:Discounts:Wizard:DiscountTypes:PERCENTAGE"),
    value: "PERCENTAGE",
  },
  {
    label: i18n.t("Agreement:Discounts:Wizard:DiscountTypes:FIXED_DISCOUNT"),
    value: "FIXED_DISCOUNT",
  },
  {
    label: i18n.t("Agreement:Discounts:Wizard:DiscountTypes:FIXED_PRICE"),
    value: "FIXED_PRICE",
  },
];

export interface DefinitionStepProps {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
}

export function DefinitionStep({
  draft,
  updateDraft,
  customerId,
  segment,
}: DefinitionStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const [error, setError] = useState("");

  // Validation runs on Next rather than on change: returning currentStepIndex
  // keeps the wizard on this step, targetStepIndex lets it advance.
  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const validationError = validateDefinition(draft);
      setError(validationError ?? "");
      return validationError ? currentStepIndex : targetStepIndex;
    },
    [draft],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  return (
    <div className="wizard-step definition-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Definition:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-5">
          {t("Agreement:Discounts:Wizard:Create:Definition:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      {error && (
        <InlineNotification status="error" isStandalone>
          {error}
        </InlineNotification>
      )}

      <div className="wizard-step__fields">
        <Input
          characterLimit={MAX_TEXT_LENGTH}
          label={t("Agreement:Discounts:Wizard:Fields:Code")}
          name="code"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateDraft({ code: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:CodePlaceholder")}
          testId="discount-code"
          value={draft.code}
        />

        <Input
          characterLimit={MAX_TEXT_LENGTH}
          label={t("Agreement:Discounts:Wizard:Fields:Name")}
          name="name"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateDraft({ name: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:NamePlaceholder")}
          testId="discount-name"
          value={draft.name}
        />

        <Input
          height={DESCRIPTION_HEIGHT}
          label={t("Agreement:Discounts:Wizard:Fields:Description")}
          labelType="optional"
          name="description"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateDraft({ description: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:DescriptionPlaceholder")}
          testId="discount-description"
          type="textarea"
          value={draft.description}
        />

        <Select
          controlLabel={t("Agreement:Discounts:Wizard:Fields:Category")}
          name="category"
          onChange={(value: string) => updateDraft({ category: value as DiscountCategory })}
          options={CATEGORY_OPTIONS}
          placeholder={t("Agreement:Discounts:Wizard:Fields:CategoryPlaceholder")}
          testId="discount-category"
          value={draft.category}
        />

        <div className="definition-step__value-row">
          <Select
            className="definition-step__discount-type"
            controlLabel={t("Agreement:Discounts:Wizard:Fields:DiscountType")}
            name="discountType"
            onChange={(value: string) => updateDraft({ discountType: value as DiscountType })}
            options={DISCOUNT_TYPE_OPTIONS}
            testId="discount-type"
            value={draft.discountType}
          />

          <Input
            className="definition-step__value"
            htmlInputType="number"
            label={t("Agreement:Discounts:Wizard:Fields:Value")}
            min="0"
            name="value"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft({ value: event.target.value })
            }
            placeholder={t("Agreement:Discounts:Wizard:Fields:ValuePlaceholder")}
            rightContent={draft.discountType === "PERCENTAGE" ? "%" : draft.currency}
            testId="discount-value"
            value={draft.value}
          />

          {draft.discountType === "PERCENTAGE" && (
            <RegularText as="span" size={2} className="definition-step__value-suffix">
              {t("Agreement:Discounts:Wizard:Fields:PercentageSuffix")}
            </RegularText>
          )}
        </div>
      </div>
    </div>
  );
}

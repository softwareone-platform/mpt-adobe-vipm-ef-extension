import { Input } from "@softwareone-platform/sdk-react-ui-v0/input";
import { Select } from "@softwareone-platform/sdk-react-ui-v0/select";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { i18n } from "../../../../../../../i18n/translations";
import { MAX_TEXT_LENGTH, validateDefinitionFields } from "../../discountValidation";
import { useFieldErrors } from "../../useFieldErrors";

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
  /**
   * Edit mode only: saves and closes instead of advancing. It has to run from
   * here rather than the step's `nextButton.onAction`, which the SDK ignores
   * whenever a step has registered its own next callback.
   */
  onSave?: () => Promise<number>;
  /**
   * The code identifies the row and the API refuses to change it on update.
   * Disabled rather than read-only: only the disabled state carries the design
   * system's grey, so a read-only field looks editable.
   */
  isCodeLocked?: boolean;
}

export function DefinitionStep({
  draft,
  updateDraft,
  customerId,
  segment,
  onSave,
  isCodeLocked = false,
}: DefinitionStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const { errors, setErrors, editField } = useFieldErrors(updateDraft);

  // Validation runs on Next rather than on change: returning currentStepIndex
  // keeps the wizard on this step, targetStepIndex lets it advance.
  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const fieldErrors = validateDefinitionFields(draft);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length > 0) {
        return currentStepIndex;
      }
      return onSave ? onSave() : targetStepIndex;
    },
    [draft, setErrors, onSave],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  return (
    <div className="wizard-step definition-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Definition:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-4">
          {t("Agreement:Discounts:Wizard:Create:Definition:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      <div className="wizard-step__fields">
        <Input
          characterLimit={MAX_TEXT_LENGTH}
          className="wizard-step__field--inline-hint"
          errorMessage={errors.code}
          label={t("Agreement:Discounts:Wizard:Fields:Code")}
          name="code"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            editField({ code: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:CodePlaceholder")}
          testId="discount-code"
          value={draft.code}
          variant="auto"
          isDisabled={isCodeLocked}
        />

        <Input
          characterLimit={MAX_TEXT_LENGTH}
          className="wizard-step__field--inline-hint"
          errorMessage={errors.name}
          label={t("Agreement:Discounts:Wizard:Fields:Name")}
          name="name"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            editField({ name: event.target.value })
          }
          placeholder={t("Agreement:Discounts:Wizard:Fields:NamePlaceholder")}
          testId="discount-name"
          value={draft.name}
          variant="auto"
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
          cssPosition="fixed"
          errorMessage={errors.category}
          name="category"
          onChange={(value: string) => editField({ category: value as DiscountCategory })}
          options={CATEGORY_OPTIONS}
          placeholder={t("Agreement:Discounts:Wizard:Fields:CategoryPlaceholder")}
          testId="discount-category"
          value={draft.category}
        />

        <div className="definition-step__value-row">
          <Select
            className="definition-step__discount-type"
            controlLabel={t("Agreement:Discounts:Wizard:Fields:DiscountType")}
            cssPosition="fixed"
            errorMessage={errors.discountType}
            name="discountType"
            onChange={(value: string) => editField({ discountType: value as DiscountType })}
            options={DISCOUNT_TYPE_OPTIONS}
            testId="discount-type"
            value={draft.discountType}
          />

          <Input
            className="definition-step__value"
            errorMessage={errors.value}
            htmlInputType="number"
            label={t("Agreement:Discounts:Wizard:Fields:Value")}
            min="0"
            name="value"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              editField({ value: event.target.value })
            }
            placeholder={t("Agreement:Discounts:Wizard:Fields:ValuePlaceholder")}
            rightContent={draft.discountType === "PERCENTAGE" ? "%" : draft.currency}
            testId="discount-value"
            type="right-label"
            value={draft.value}
            variant="auto"
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

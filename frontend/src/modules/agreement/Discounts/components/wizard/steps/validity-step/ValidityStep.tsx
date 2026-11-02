import { Checkbox } from "@softwareone-platform/sdk-react-ui-v0/checkbox";
import { DatePicker } from "@softwareone-platform/sdk-react-ui-v0/date-picker";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useStepActions } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { toCalendarDay, toPickerValue } from "../../../../../../utils/date";
import { validateValidityFields } from "../../discountValidation";
import { useFieldErrors } from "../../useFieldErrors";

import type { StepNavigationProperties } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { ChangeEvent } from "react";
import type { DiscountDraft } from "../../discountDraft";

import "../../wizardStep.scss";
import "./ValidityStep.scss";

export interface ValidityStepProps {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
  /** Edit mode only: why the last Save failed, a rule of another step or the API. */
  submitError?: string;
  /** Edit mode only: saves and closes instead of advancing. */
  onSave?: () => Promise<number>;
}

export function ValidityStep({
  draft,
  updateDraft,
  customerId,
  segment,
  submitError = "",
  onSave,
}: ValidityStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const { errors, setErrors, editField } = useFieldErrors(updateDraft);

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const fieldErrors = validateValidityFields(draft);
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
    <div className="wizard-step validity-step">
      <header className="wizard-step__header">
        <MediumText as="h3" size={3} className="wizard-step__title">
          {t("Agreement:Discounts:Wizard:Create:Validity:Title")}
        </MediumText>
        <RegularText as="p" size={2} color="grey-4">
          {t("Agreement:Discounts:Wizard:Create:Validity:Description", {
            customerId,
            segment,
          })}
        </RegularText>
      </header>

      {submitError && (
        <InlineNotification status="error">
          {submitError}
        </InlineNotification>
      )}

      <div className="wizard-step__fields">
        <fieldset className="validity-step__period">
          <legend className="wizard-step__group-label">
            {t("Agreement:Discounts:Wizard:Fields:ValidityPeriod")}
          </legend>
          <div className="validity-step__period-inputs">
            {/* The draft holds calendar days; the pickers get and give back the
                local midnight of that day, so no time zone moves the date. */}
            <DatePicker<string>
              errorMessage={errors.startDate}
              name="startDate"
              onChange={(startDate: string) => editField({ startDate: toCalendarDay(startDate) })}
              placeholder={t("Agreement:Discounts:Wizard:Fields:DatePlaceholder")}
              popoverCssPosition="fixed"
              testId="discount-start-date"
              value={toPickerValue(draft.startDate)}
              variant={errors.startDate ? "error" : "default"}
            />
            <DatePicker<string>
              errorMessage={errors.endDate}
              // Chaining the bounds makes the ordering rules hard to break in
              // the UI; validateValidity stays the authority.
              minDate={draft.startDate ? toPickerValue(draft.startDate) : undefined}
              name="endDate"
              onChange={(endDate: string) => editField({ endDate: toCalendarDay(endDate) })}
              placeholder={t("Agreement:Discounts:Wizard:Fields:DatePlaceholder")}
              popoverCssPosition="fixed"
              testId="discount-end-date"
              value={toPickerValue(draft.endDate)}
              variant={errors.endDate ? "error" : "default"}
            />
          </div>
        </fieldset>

        <div className="validity-step__reuse">
          <div className="validity-step__reusable">
            <RegularText as="span" size={2} className="wizard-step__group-label">
              {t("Agreement:Discounts:Wizard:Fields:Reusable")}
            </RegularText>
            <Checkbox
              isChecked={draft.reusable}
              label={t("Agreement:Discounts:Wizard:Fields:ReusableYes")}
              name="reusable"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                editField({ reusable: event.target.checked })
              }
              testId="discount-reusable"
            />
          </div>

          <div className="validity-step__lock-date">
            <RegularText as="span" size={2} className="wizard-step__group-label">
              {t("Agreement:Discounts:Wizard:Fields:DiscountLockEndDate")}
            </RegularText>
            <DatePicker<string>
              errorMessage={errors.discountLockEndDate}
              // Kept mounted but inert when the code is single-use, so the row
              // does not reflow. Any value left here is dropped on serialization.
              isDisabled={!draft.reusable}
              minDate={draft.endDate ? toPickerValue(draft.endDate) : undefined}
              name="discountLockEndDate"
              onChange={(discountLockEndDate: string) =>
                editField({ discountLockEndDate: toCalendarDay(discountLockEndDate) })
              }
              placeholder={t("Agreement:Discounts:Wizard:Fields:DatePlaceholder")}
              popoverCssPosition="fixed"
              testId="discount-lock-end-date"
              variant={errors.discountLockEndDate ? "error" : "default"}
              value={toPickerValue(draft.discountLockEndDate)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

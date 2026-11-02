import { i18n } from "../../../../../i18n/translations";

import { DefinitionStep } from "./steps/definition-step/DefinitionStep";
import { ScopeStep } from "./steps/scope-step/ScopeStep";
import { ValidityStep } from "./steps/validity-step/ValidityStep";

import type { DiscountWizardStep } from "./DiscountWizard";
import type { DiscountDraft } from "./discountDraft";
import type { DiscountStep } from "./discountValidation";

/** Where each step sits in the edit wizard, so a failed Save can open the one at fault. */
export const EDIT_STEP_INDEX: Record<DiscountStep, number> = {
  definition: 0,
  validity: 1,
  scope: 2,
};

export interface EditStepsInput {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
  /** Why the last Save failed. Every step shows it, since Save runs from any of them. */
  submitError: string;
  isSubmitting: boolean;
  /** Saves the draft and closes. Returns -1 so the wizard stays where it is. */
  onSave: () => Promise<number>;
}

/**
 * Build the steps for the edit-discount wizard.
 *
 * Every step's primary button saves and closes. The SDK only calls the
 * wizard's `onSave` on the last step, so without `onAction` here the button
 * would read "Save" and behave like "Next" on the first two.
 */
export function editSteps({
  draft,
  updateDraft,
  customerId,
  segment,
  submitError,
  isSubmitting,
  onSave,
}: EditStepsInput): DiscountWizardStep[] {
  const saveButton = {
    onAction: onSave,
    isBusy: isSubmitting,
    isDisabled: isSubmitting,
  };

  return [
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Definition"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Definition:Submit"),
        ...saveButton,
      },
      backButton: { isHidden: true },
      render: () => (
        <DefinitionStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
          submitError={submitError}
          onSave={onSave}
          isCodeLocked
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Validity"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Validity:Submit"),
        ...saveButton,
      },
      backButton: { isHidden: true },
      render: () => (
        <ValidityStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
          submitError={submitError}
          onSave={onSave}
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Scope"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Scope:Submit"),
        ...saveButton,
      },
      backButton: { isHidden: true },
      render: () => (
        <ScopeStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
          submitError={submitError}
          onSave={onSave}
        />
      ),
    },
  ];
}

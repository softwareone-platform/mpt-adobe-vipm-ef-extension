import { i18n } from "../../../../../i18n/translations";

import { DefinitionStep } from "./steps/definition-step/DefinitionStep";
import { ScopeStep } from "./steps/scope-step/ScopeStep";
import { ValidityStep } from "./steps/validity-step/ValidityStep";

import type { DiscountWizardStep } from "./DiscountWizard";
import type { DiscountDraft } from "./discountDraft";

export interface EditStepsInput {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
  submitError: string;
  isSubmitting: boolean;
}

/**
 * Build the steps for the edit-discount wizard.
 *
 */
export function editSteps({
  draft,
  updateDraft,
  customerId,
  segment,
  submitError,
  isSubmitting,
}: EditStepsInput): DiscountWizardStep[] {
  return [
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Definition"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Definition:Submit"),
      },
      backButton: { isHidden: true },
      render: () => (
        <DefinitionStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Validity"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Validity:Submit"),
      },
      backButton: { isHidden: true },
      render: () => (
        <ValidityStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Edit:Steps:Scope"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Edit:Scope:Submit"),
        isBusy: isSubmitting,
        isDisabled: isSubmitting,
      },
      backButton: { isHidden: true },
      render: () => (
        <ScopeStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
          submitError={submitError}
        />
      ),
    },
  ];
}

import { i18n } from "../../../../../i18n/translations";

import { DefinitionStep } from "./steps/definition-step/DefinitionStep";
import { ReviewStep } from "./steps/review-step/ReviewStep";
import { ScopeStep } from "./steps/scope-step/ScopeStep";
import { SummaryStep } from "./steps/summary-step/SummaryStep";
import { ValidityStep } from "./steps/validity-step/ValidityStep";

import type { DiscountWizardStep } from "./DiscountWizard";
import type { DiscountDraft } from "./discountDraft";

export interface CreateStepsInput {
  draft: DiscountDraft;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  customerId: string;
  segment: string;
  onSubmit: () => Promise<boolean>;
  submitError: string;
  isSubmitting: boolean;
}

/**
 * Build the step set for the create-discount wizard.
 *
 * Kept apart from `DiscountWizard` so the edit flow can supply its own set —
 * its Definition step differs, because `DiscountCodeUpdateRequest` has no
 * `code` field and the code cannot be changed after creation.
 *
 * Each step keeps its primary button disabled until its required fields carry
 * a value, so the last step's action — which the SDK fires unconditionally —
 * can only ever be reached with a discount already created.
 */
export function createSteps({
  draft,
  updateDraft,
  customerId,
  segment,
  onSubmit,
  submitError,
  isSubmitting,
}: CreateStepsInput): DiscountWizardStep[] {
  return [
    {
      title: i18n.t("Agreement:Discounts:Wizard:Create:Steps:Definition"),
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
      title: i18n.t("Agreement:Discounts:Wizard:Create:Steps:Validity"),
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
      title: i18n.t("Agreement:Discounts:Wizard:Create:Steps:Scope"),
      render: () => (
        <ScopeStep
          draft={draft}
          updateDraft={updateDraft}
          customerId={customerId}
          segment={segment}
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Create:Steps:Review"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Create:Review:Submit"),
        isBusy: isSubmitting,
        isDisabled: isSubmitting,
      },
      render: () => (
        <ReviewStep
          draft={draft}
          customerId={customerId}
          segment={segment}
          onSubmit={onSubmit}
          errorMessage={submitError}
        />
      ),
    },
    {
      title: i18n.t("Agreement:Discounts:Wizard:Create:Steps:Summary"),
      nextButton: {
        label: i18n.t("Agreement:Discounts:Wizard:Create:Summary:Done"),
      },
      render: () => <SummaryStep draft={draft} />,
    },
  ];
}

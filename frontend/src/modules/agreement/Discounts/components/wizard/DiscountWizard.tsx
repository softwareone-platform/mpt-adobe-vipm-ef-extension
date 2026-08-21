import { Wizard } from "@softwareone-platform/sdk-react-ui-v0/wizard";

import {
  relativeScreenHeight,
  relativeScreenWidth,
} from "../../../../utils/window";

import type { StepProps } from "@softwareone-platform/sdk-react-ui-v0/wizard";
import type { ReactNode } from "react";

import "./DiscountWizard.scss";
import {
  SCREEN_HEIGHT_FACTOR,
  SCREEN_WIDTH_FACTOR,
} from "../../../../shared/constants";

/**
 * Use the full available screen (up to the Figma design size of 756×1200).
 *
 * Previous factors (0.8 / 0.75) left unused space on large screens and clipped
 * content on small ones. Using the default factors from `window.ts`
 * (`MAX_MODAL_HEIGHT / 1000` and `MAX_MODAL_WIDTH / 1600`) already caps at the
 * Figma maximums while scaling proportionally on smaller screens.
 */

/** A wizard step: the SDK's own props plus the body to render for it. */
export interface DiscountWizardStep extends StepProps {
  render: () => ReactNode;
}

export interface DiscountWizardProps {
  /**
   * Banner title. Must stay a plain string: `Wizard.Header` only applies the
   * title styling and the close icon when its children is a string.
   */
  title: string;
  steps: DiscountWizardStep[];
  activeStepIndex: number;
  onActiveStepIndexChange: (activeStepIndex: number) => void;
  onClose: () => void;
  /**
   * Fires when the primary button is pressed on the last step. The SDK calls it
   * unconditionally — a `registerOnNextCallback` guard cannot stop it — so any
   * precondition has to be re-checked inside this callback.
   */
  onFinish: () => void;
}

/**
 * Modal chrome shared by the discount wizards.
 *
 * It owns only the layout: sizing, the SDK `Wizard` assembly, and the
 * close/finish wiring. Form state, validation and step bodies belong to the
 * caller, so the create and edit flows can hand over different step sets
 * without this component knowing about either.
 */
export function DiscountWizard({
  title,
  steps,
  activeStepIndex,
  onActiveStepIndexChange,
  onClose,
  onFinish,
}: DiscountWizardProps) {
  return (
    <div
      className="discount-wizard"
      style={{
        height: relativeScreenHeight(SCREEN_HEIGHT_FACTOR),
        width: relativeScreenWidth(SCREEN_WIDTH_FACTOR),
        maxHeight: "100vh",
      }}
    >
      <Wizard
        stepsProps={steps.map((step) => ({
          title: step.title,
          nextButton: step.nextButton,
          backButton: step.backButton,
          closeButton: step.closeButton,
        }))}
        activeStepIndex={activeStepIndex}
        onActiveStepIndexChange={onActiveStepIndexChange}
        onClose={onClose}
        onSave={onFinish}
        // The rail is clickable in both directions by default, which would let
        // the user skip past unvalidated steps.
        isToDisableSideNavigation
      >
        {/* Plain string only: Wizard.Header drops the title styling otherwise.
            No close icon — the design closes from the footer Close button. */}
        <Wizard.Header>{title}</Wizard.Header>
        <Wizard.Content>
          <Wizard.Content.Steps />
          <Wizard.Content.StepContent>
            {({ activeStepIndex: index }) => steps[index]?.render() ?? null}
          </Wizard.Content.StepContent>
        </Wizard.Content>
        <Wizard.Actions />
      </Wizard>
    </div>
  );
}

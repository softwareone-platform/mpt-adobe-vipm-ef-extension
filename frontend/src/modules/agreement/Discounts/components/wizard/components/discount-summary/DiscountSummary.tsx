import { MediumText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useTranslation } from "react-i18next";

import {
  formatReviewCategory,
  formatReviewDiscountType,
  formatReviewItems,
  formatReviewOrderTypes,
  formatReviewValue,
} from "../../reviewFormat";
import { ReviewBooleanField, ReviewField } from "../review-field/ReviewField";

import type { DiscountDraft } from "../../discountDraft";

import "./DiscountSummary.scss";
import { EM_DASH, formatReviewDate } from "../../../../../../utils/date";

export interface DiscountSummaryProps {
  draft: DiscountDraft;
}

/**
 * The read-only recap of the draft, shared by the Review and Summary steps:
 * the design shows the same three sections before and after submission.
 */
export function DiscountSummary({ draft }: DiscountSummaryProps) {
  const { t } = useTranslation();

  return (
    <>
      <section className="discount-summary__section">
        <MediumText
          as="h4"
          size={2}
          className="discount-summary__section-title"
        >
          {t("Agreement:Discounts:Wizard:Create:Steps:Definition")}
        </MediumText>
        <div className="discount-summary__row">
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:Code")}
            value={draft.code || EM_DASH}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:Name")}
            value={draft.name || EM_DASH}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:Category")}
            value={formatReviewCategory(draft)}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:DiscountType")}
            value={formatReviewDiscountType(draft)}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:Value")}
            value={formatReviewValue(draft)}
          />
        </div>
      </section>

      <section className="discount-summary__section">
        <MediumText
          as="h4"
          size={2}
          className="discount-summary__section-title"
        >
          {t("Agreement:Discounts:Wizard:Create:Steps:Validity")}
        </MediumText>
        <div className="discount-summary__row">
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:StartDateLabel")}
            value={formatReviewDate(draft.startDate)}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:EndDateLabel")}
            value={formatReviewDate(draft.endDate)}
          />
          <ReviewBooleanField
            label={t("Agreement:Discounts:Wizard:Fields:Reusable")}
            value={draft.reusable}
          />
          {draft.reusable && (
            <ReviewField
              label={t("Agreement:Discounts:Wizard:Fields:DiscountLockEndDate")}
              value={formatReviewDate(draft.discountLockEndDate)}
            />
          )}
        </div>
      </section>

      <section className="discount-summary__section">
        <MediumText
          as="h4"
          size={2}
          className="discount-summary__section-title"
        >
          {t("Agreement:Discounts:Wizard:Create:Steps:Scope")}
        </MediumText>
        <div className="discount-summary__row">
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:TargetItems")}
            value={formatReviewItems(draft.targetItems)}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:PrerequisiteItems")}
            value={formatReviewItems(draft.prerequisiteItems)}
          />
          <ReviewBooleanField
            label={t("Agreement:Discounts:Wizard:Fields:AnnualPlan")}
            value={draft.supportsAnnual}
          />
          <ReviewBooleanField
            label={t("Agreement:Discounts:Wizard:Fields:ThreeYearCommitment")}
            value={draft.supportsThreeYc}
          />
          <ReviewField
            label={t("Agreement:Discounts:Wizard:Fields:OrderTypesLabel")}
            value={formatReviewOrderTypes(draft)}
          />
        </div>
      </section>
    </>
  );
}

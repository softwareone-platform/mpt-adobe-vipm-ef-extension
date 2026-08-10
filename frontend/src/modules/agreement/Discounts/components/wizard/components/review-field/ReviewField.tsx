import { Icon } from "@softwareone-platform/sdk-react-ui-v0/icon";
import { MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { useTranslation } from "react-i18next";

import "./ReviewField.scss";

export interface ReviewFieldProps {
  label: string;
  value: string;
}

export function ReviewField({ label, value }: ReviewFieldProps) {
  return (
    <div className="review-field">
      <RegularText as="span" size={1} color="grey-5" className="review-field__label">
        {label}
      </RegularText>
      <MediumText as="span" size={2} className="review-field__value">
        {value}
      </MediumText>
    </div>
  );
}

export interface ReviewBooleanFieldProps {
  label: string;
  value: boolean;
}

/** Yes/No with the tick or cross the design uses; green only when it is a Yes. */
export function ReviewBooleanField({ label, value }: ReviewBooleanFieldProps) {
  const { t } = useTranslation();
  const modifier = value ? "review-field__value--yes" : "review-field__value--no";

  return (
    <div className="review-field">
      <RegularText as="span" size={1} color="grey-5" className="review-field__label">
        {label}
      </RegularText>
      <span className={`review-field__value ${modifier}`}>
        <MediumText as="span" size={2}>
          {value
            ? t("Agreement:Discounts:Wizard:Fields:Yes")
            : t("Agreement:Discounts:Wizard:Fields:No")}
        </MediumText>
        <Icon name={value ? "done" : "close"} height={16} width={16} />
      </span>
    </div>
  );
}

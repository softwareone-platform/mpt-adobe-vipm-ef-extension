import { BoldText, MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { Trans, useTranslation } from "react-i18next";
import { useAgreementId } from "../../shared/hooks/useAgreementId";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { DetailsGroup } from "../components/details/details-group/DetailsGroup";
import { DetailsSection } from "../components/details/details-section/DetailsSection";
import { useAdobeCustomer } from "../../shared/hooks/useAdobeCustomer";
import {
  AdobeCommitmentDetail,
  findThreeYearBenefit,
  readMinimumQuantity,
} from "../../shared/model";
import { AccountType } from "../../shared/three-year-commitment";
import { canRequestThreeYearCommitment } from "../../utils/security";
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { useSettings } from "../../shared/hooks/useSettings";

import "./index.scss";

function toContent(value: string | number | null | undefined): string | undefined {
  return value != null && value !== '' ? String(value) : undefined;
}

/**
 * Render a commitment section from an Adobe commitment detail.
 *
 * The detail comes from the customer payload returned by the backend (which in
 * turn proxies Adobe), so the displayed status, quantities and dates always
 * reflect live Adobe data. ``showDates`` is disabled for the recommitment
 * request, which has no start/end dates to show.
 */
function CommitmentGroup({
  title,
  detail,
  showDates = true,
}: {
  title: string;
  detail?: AdobeCommitmentDetail | null;
  showDates?: boolean;
}) {
  const { t } = useTranslation();
  const sections = [
    <DetailsSection key="status" label={t('Common:Status')} content={toContent(detail?.status)} />,
    <DetailsSection
      key="licenses"
      label={t('Agreement:ThreeYear:Minimum licenses')}
      content={toContent(readMinimumQuantity(detail, 'LICENSE'))}
    />,
    <DetailsSection
      key="consumables"
      label={t('Agreement:ThreeYear:Minimum consumables')}
      content={toContent(readMinimumQuantity(detail, 'CONSUMABLES'))}
    />,
  ];

  if (showDates) {
    sections.push(
      <DetailsSection key="startDate" label={t('Agreement:ThreeYear:Start date')} content={toContent(detail?.startDate)} />,
      <DetailsSection key="endDate" label={t('Agreement:ThreeYear:End date')} content={toContent(detail?.endDate)} />,
    );
  }

  return <DetailsGroup title={title}>{sections}</DetailsGroup>;
}

export function ThreeYearCommitment() {
  const { t } = useTranslation();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const accountType = context.auth?.account?.type;

  const { open } = useMPTModal();
  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);
  const agreementProductId = context.data?.agreement?.product?.id;

  const benefit = findThreeYearBenefit(adobeCustomer.data);
  const currentCommitment = benefit?.commitment;
  const commitmentRequest = benefit?.commitmentRequest;
  const recommitmentRequest = benefit?.recommitmentRequest;

  const products = settings?.products;
  const canRequestCommitment = canRequestThreeYearCommitment(
    accountType,
    products,
    agreementProductId,
  );

  return (
    <div className="three-year-commitment__split">
      <div className="three-year-commitment__main">
        <header className="extension__content-header">
          <MediumText as="h2" size={4} className="extension__content-title">
            {t('Agreement:ThreeYear:Title')}
          </MediumText>
        </header>

        <div className="three-year-commitment__description">
          <RegularText as="p" size={2} color="grey-5">
            {t('Agreement:ThreeYear:Description')}
          </RegularText>
        </div>

        {adobeCustomer.status === 'loading' && (
          <InlineNotification status="info" isStandalone>
            {t('Agreement:Loading')}
          </InlineNotification>
        )}
        {adobeCustomer.status === 'error' && (
          <InlineNotification status="error" isStandalone>
            {adobeCustomer.error}
          </InlineNotification>
        )}
        <div className="three-year-commitment__groups">
          <CommitmentGroup title={t('Agreement:ThreeYear:Current commitment')} detail={currentCommitment} />
          <CommitmentGroup title={t('Agreement:ThreeYear:Commitment request')} detail={commitmentRequest} />
          <CommitmentGroup
            title={t('Agreement:ThreeYear:Recommitment request')}
            detail={recommitmentRequest}
            showDates={false}
          />
        </div>
      </div>

      {canRequestCommitment && (
        <aside className="three-year-commitment__aside">
          <RegularText as="p" size={2} color="grey-5">
            <Trans i18nKey="Agreement:ThreeYear:AsidePrompt">
              To request a commitment or recommitment, click <BoldText as="span" size={2}>Request commitment</BoldText>.
            </Trans>
          </RegularText>
          <Button
            isDisabled={!agreementId}
            type="secondary"
            onClick={() =>
              open('request-commitment-action', {
                context,
                onClose: (data?: { customer?: typeof adobeCustomer.data }) => {
                  if (data?.customer) adobeCustomer.update(data.customer);
                },
              })
            }
          >
            {t('Agreement:ThreeYear:Request commitment')}
          </Button>
        </aside>
      )}
    </div>
  );
}

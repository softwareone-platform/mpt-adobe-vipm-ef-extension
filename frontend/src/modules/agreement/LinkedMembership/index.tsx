import { BoldText, MediumText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { Trans, useTranslation } from "react-i18next";
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';

import { i18n } from "../../../i18n/translations";
import { useAgreementId } from "../../shared/hooks/useAgreementId";
import { useAdobeCustomer } from "../../shared/hooks/useAdobeCustomer";
import { useSettings } from "../../shared/hooks/useSettings";
import { DetailsGroup } from "../components/details/details-group/DetailsGroup";
import { DetailsSection } from "../components/details/details-section/DetailsSection";
import { findLinkedMembership, hasThreeYearCommitment } from "../../shared/model";
import type { AccountType } from "../../shared/linked-membership";
import { canRequestLinkedMembership } from "../../utils/security";

import "./index.scss";

function toContent(
  value: string | number | boolean | null | undefined,
): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value ? i18n.t('Common:Yes') : i18n.t('Common:No');
  return String(value);
}

export function LinkedMembership() {
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

  const linkedMembership = findLinkedMembership(adobeCustomer.data);
  const hasLinkedMembership = Boolean(
    linkedMembership &&
      (linkedMembership.linkedMembershipId ?? linkedMembership.id ?? linkedMembership.name),
  );
  // A customer enrolled in a 3-year commitment cannot also hold a linked
  // membership, so creating one stays disabled while that commitment holds.
  const hasCommitment = hasThreeYearCommitment(adobeCustomer.data);

  const products = settings?.products;
  const canRequest = canRequestLinkedMembership(accountType, products, agreementProductId);

  return (
    <div className="linked-membership__split">
      <div className="linked-membership__main">
        <header className="extension__content-header">
          <MediumText as="h2" size={4} className="extension__content-title">
            {t('Agreement:Linked:Title')}
          </MediumText>
          <RegularText as="p" size={2} color="grey-5">
            {t('Agreement:Linked:Description')}
          </RegularText>
        </header>

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

        <div className="linked-membership__groups">
          <DetailsGroup title={t('Agreement:Linked:Current linked membership')}>
            <DetailsSection
              label={t('Common:ID')}
              content={toContent(linkedMembership?.linkedMembershipId ?? linkedMembership?.id)}
            />
            <DetailsSection label={t('Common:Name')} content={toContent(linkedMembership?.name)} />
            <DetailsSection label={t('Agreement:Linked:Type')} content={toContent(linkedMembership?.type)} />
            <DetailsSection
              label={t('Agreement:Linked:This account')}
              content={toContent(linkedMembership?.linkedMembershipType)}
            />
            <DetailsSection
              label={t('Agreement:Linked:Creation date')}
              content={toContent(linkedMembership?.creationDate)}
            />
          </DetailsGroup>
        </div>
      </div>

      {canRequest && (
        <aside className="linked-membership__aside">
          <RegularText as="p" size={2} color="grey-5">
            {hasCommitment ? (
              t('Agreement:Linked:HasCommitment')
            ) : hasLinkedMembership ? (
              t('Agreement:Linked:AlreadyApplied')
            ) : (
              <Trans i18nKey="Agreement:Linked:CreatePrompt">
                To create a linked membership with this account as the owner, click <BoldText as="span" size={2}>Create linked membership</BoldText>.
              </Trans>
            )}
          </RegularText>
          <Button
            isDisabled={!agreementId || hasLinkedMembership || hasCommitment}
            type="secondary"
            onClick={() =>
              open('request-linked-membership-action', {
                context,
                onClose: (data?: { customer?: typeof adobeCustomer.data }) => {
                  if (data?.customer) adobeCustomer.update(data.customer);
                },
              })
            }
          >
            {t('Agreement:Linked:Create linked membership')}
          </Button>
        </aside>
      )}
    </div>
  );
}

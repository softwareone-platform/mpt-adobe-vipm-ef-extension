import { useState } from "react";

import { BoldText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { useAgreementId } from "../hooks/useAgreementId";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { DetailsGroup } from "../components/details/details-group/DetailsGroup";
import { DetailsSection } from "../components/details/details-section/DetailsSection";
import { useAdobeCustomer } from "../hooks/useAdobeCustomer";
import { useThreeYearCommitmentRequest } from "../hooks/useThreeYearCommitmentRequest";
import {
  AdobeCommitmentDetail,
  findThreeYearBenefit,
  readMinimumQuantity,
} from "../model";
import { AccountType, ThreeYearCommitmentRequestInput } from "./model";
import { canRequestThreeYearCommitment } from "../../utils/security";
import { RequestCommitmentModal } from "./RequestCommitmentModal/RequestCommitmentModal";
import { useMPTContext } from '@mpt-extension/sdk-react';
import { useSettings } from "../hooks/useSettings";

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
  const sections = [
    <DetailsSection key="status" label="Status" content={toContent(detail?.status)} />,
    <DetailsSection
      key="licenses"
      label="Minimum licenses"
      content={toContent(readMinimumQuantity(detail, 'LICENSE'))}
    />,
    <DetailsSection
      key="consumables"
      label="Minimum consumables"
      content={toContent(readMinimumQuantity(detail, 'CONSUMABLES'))}
    />,
  ];

  if (showDates) {
    sections.push(
      <DetailsSection key="startDate" label="Start date" content={toContent(detail?.startDate)} />,
      <DetailsSection key="endDate" label="End date" content={toContent(detail?.endDate)} />,
    );
  }

  return <DetailsGroup title={title}>{sections}</DetailsGroup>;
}

export function ThreeYearCommitment() {
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const accountType = context.auth?.account?.type;

  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);
  const agreementProductId = context.data?.agreement?.product?.id;
  const { error, status, submitRequest, reset } = useThreeYearCommitmentRequest(agreementId);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const benefit = findThreeYearBenefit(adobeCustomer.data);
  const currentCommitment = benefit?.commitment;
  const commitmentRequest = benefit?.commitmentRequest;
  const recommitmentRequest = benefit?.recommitmentRequest;

  const currentEnrollStatus = currentCommitment?.status ?? null;
  const currentMinimumLicenses = readMinimumQuantity(currentCommitment, 'LICENSE');
  const currentMinimumConsumables = readMinimumQuantity(currentCommitment, 'CONSUMABLES');

  const products = settings?.products;
  const canRequestCommitment = canRequestThreeYearCommitment(
    accountType,
    products,
    agreementProductId,
  );

  function closeModal() {
    setIsModalOpen(false);
    reset();
  }

  // The modal only needs to know whether the request succeeded; on success we
  // refresh the displayed commitment with the customer payload Adobe returned.
  async function handleSubmit(input: ThreeYearCommitmentRequestInput): Promise<boolean> {
    const result = await submitRequest(input);
    if (result) {
      adobeCustomer.update(result);
      return true;
    }
    return false;
  }

  return (
    <>
      <div className="three-year-commitment__split">
        <div className="three-year-commitment__main">
          <header className="extension__content-header">
            <BoldText as="h2" size={4} className="extension__content-title">
              3-year commitment
            </BoldText>
            <RegularText as="p" size={2} color="grey-5">
              The details of this customer&apos;s current commitment and requests are below.
            </RegularText>
          </header>

          {adobeCustomer.status === 'loading' && (
            <InlineNotification status="info" isStandalone>
              Loading Adobe customer details…
            </InlineNotification>
          )}
          {adobeCustomer.status === 'error' && (
            <InlineNotification status="error" isStandalone>
              {adobeCustomer.error}
            </InlineNotification>
          )}
          <div className="three-year-commitment__groups">
            <CommitmentGroup title="Current commitment" detail={currentCommitment} />
            <CommitmentGroup title="Commitment request" detail={commitmentRequest} />
            <CommitmentGroup
              title="Recommitment request"
              detail={recommitmentRequest}
              showDates={false}
            />
          </div>
        </div>

        {canRequestCommitment && (
          <aside className="three-year-commitment__aside">
            <RegularText as="p" size={2} color="grey-5">
              To request a commitment or recommitment, click{" "}
              <BoldText as="span" size={2}>
                Request commitment
              </BoldText>
              .
            </RegularText>
            <Button
              isDisabled={!agreementId}
              type="secondary"
              onClick={() => setIsModalOpen(true)}
            >
              Request commitment
            </Button>
          </aside>
        )}
      </div>

      <RequestCommitmentModal
        currentEnrollStatus={currentEnrollStatus}
        currentMinimumConsumables={currentMinimumConsumables}
        currentMinimumLicenses={currentMinimumLicenses}
        disableCommitmentOption={currentEnrollStatus === 'COMMITTED'}
        error={error}
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        status={status}
      />
    </>
  );
}

import { useState } from "react";

import { BoldText, RegularText } from "@softwareone-platform/sdk-react-ui-v0/text";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { useAgreementId } from "../hooks/useAgreementId";
import { InlineNotification } from "@softwareone-platform/sdk-react-ui-v0/notification";
import { DetailsGroup } from "../components/details/details-group/DetailsGroup";
import { DetailsSection } from "../components/details/details-section/DetailsSection";
import { useAdobeCustomer } from "../hooks/useAdobeCustomer";
import { useAgreement } from "../hooks/useAgreement";
import { useThreeYearCommitmentRequest } from "../hooks/useThreeYearCommitmentRequest";
import { AgreementParameter, readParameter } from "../model";
import { toNumberOrNull, toStringOrNull } from "../../utils/coerce";
import { RequestCommitmentModal } from "./RequestCommitmentModal/RequestCommitmentModal";

import "./index.scss";

interface CommitmentField {
  // The agreement fulfillment parameter this field reads from. When omitted,
  // there is no matching parameter yet and the field renders an em dash.
  externalId?: string;
  label: string;
}

const CURRENT_COMMITMENT_FIELDS: CommitmentField[] = [
  { externalId: '3YCEnrollStatus', label: 'Status' },
  { externalId: '3YCMinLicenses', label: 'Minimum licenses' },
  { externalId: '3YCMinConsumables', label: 'Minimum consumables' },
  { externalId: '3YCStartDate', label: 'Start date' },
  { externalId: '3YCEndDate', label: 'End date' },
];

const COMMITMENT_REQUEST_FIELDS: CommitmentField[] = [
  { externalId: '3YCCommitmentRequestStatus', label: 'Status' },
  { externalId: '3YCCommitmentRequestLicenses', label: 'Minimum licenses' },
  { externalId: '3YCCommitmentRequestConsumables', label: 'Minimum consumables' },
  { externalId: '3YCCommitmentRequestStartDate', label: 'Start date' },
  { externalId: '3YCCommitmentRequestEndDate', label: 'End date' },
];

const RECOMMITMENT_REQUEST_FIELDS: CommitmentField[] = [
  { externalId: '3YCRecommitmentRequestStatus', label: 'Status' },
  { externalId: '3YCRecommitmentRequestLicenses', label: 'Minimum licenses' },
  { externalId: '3YCRecommitmentRequestConsumables', label: 'Minimum consumables' },
];

function CommitmentGroup({
  title,
  fields,
  parameters,
}: {
  title: string;
  fields: CommitmentField[];
  parameters?: AgreementParameter[];
}) {
  return (
    <DetailsGroup title={title}>
      {fields.map((field) => {
        const value = field.externalId
          ? readParameter(parameters, field.externalId)
          : undefined;

        return (
          <DetailsSection
            key={field.label}
            label={field.label}
            content={value != null ? String(value) : undefined}
          />
        );
      })}
    </DetailsGroup>
  );
}

export function ThreeYearCommitment() {
  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer();
  const agreement = useAgreement();
  const { error, status, submitRequest, reset } = useThreeYearCommitmentRequest();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fulfillment = agreement?.parameters?.fulfillment;
  const currentEnrollStatus = toStringOrNull(readParameter(fulfillment, '3YCEnrollStatus'));
  const currentMinimumLicenses = toNumberOrNull(readParameter(fulfillment, '3YCMinLicenses'));
  const currentMinimumConsumables = toNumberOrNull(
    readParameter(fulfillment, '3YCMinConsumables'),
  );

  function closeModal() {
    setIsModalOpen(false);
    reset();
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
            <CommitmentGroup
              title="Current commitment"
              fields={CURRENT_COMMITMENT_FIELDS}
              parameters={agreement?.parameters?.fulfillment}
            />
            <CommitmentGroup
              title="Commitment request"
              fields={COMMITMENT_REQUEST_FIELDS}
              parameters={agreement?.parameters?.fulfillment}
            />
            <CommitmentGroup
              title="Recommitment request"
              fields={RECOMMITMENT_REQUEST_FIELDS}
              parameters={agreement?.parameters?.fulfillment}
            />
          </div>
        </div>

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
      </div>

      <RequestCommitmentModal
        currentEnrollStatus={currentEnrollStatus}
        currentMinimumConsumables={currentMinimumConsumables}
        currentMinimumLicenses={currentMinimumLicenses}
        disableCommitmentOption={currentEnrollStatus === 'COMMITTED'}
        error={error}
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={submitRequest}
        status={status}
      />
    </>
  );
}

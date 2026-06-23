import { useState } from 'react';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { Input } from '@softwareone-platform/sdk-react-ui-v0/input';
import { RadioButtonGroup } from '@softwareone-platform/sdk-react-ui-v0/radio';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { BoldText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useLinkedMembershipRequest } from '../shared/hooks/useLinkedMembershipRequest';
import { useSettings } from '../shared/hooks/useSettings';
import type { AccountType, LinkedMembershipType } from '../shared/linkedMembership';
import { hasThreeYearCommitment } from '../shared/model';
import { canRequestLinkedMembership } from '../utils/security';

import './App.scss';

const MAX_NAME_LENGTH = 255;

const TYPE_OPTIONS: Array<{ value: LinkedMembershipType; title: string; description: string }> = [
  {
    value: 'STANDARD',
    title: 'Standard',
    description:
      'Suitable for departments or sub-organizations with separate budget or administrative ' +
      'requirements, including business affiliates, school districts, state schools, government ' +
      'departments, and entities.',
  },
  {
    value: 'CONSORTIUM',
    title: 'Consortium',
    description:
      'An association or combination of organizations with similar interests and objectives, ' +
      'managed by a controlling entity.',
  },
];

export default function App() {
  const { close } = useMPTModal();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const canRequest = canRequestLinkedMembership(
    context.auth?.account?.type,
    settings?.products,
    context.data?.agreement?.product?.id,
  );

  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);
  const { error, status, submitRequest } = useLinkedMembershipRequest(agreementId);

  const [membershipType, setMembershipType] = useState<LinkedMembershipType>('STANDARD');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState('');

  const isBusy = status === 'loading';
  // A customer already enrolled in a 3-year commitment cannot create a linked
  // membership, so the Create action stays disabled while that commitment holds.
  const hasCommitment = hasThreeYearCommitment(adobeCustomer.data);

  if (!canRequest) return null;

  async function handleSubmit() {
    if (hasCommitment) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('A linked membership name is required.');
      return;
    }

    setLocalError('');
    const result = await submitRequest({ name: trimmed, type: membershipType });
    if (result) {
      close({ customer: result });
    }
  }

  return (
    <div className="request-linked-membership-modal">
      <div className="request-linked-membership-modal__header">
        <BoldText as="h2" size={4}>
          Create linked membership
        </BoldText>
      </div>

      <div className="request-linked-membership-modal__content">
        <RadioButtonGroup
          name="linked-membership-type"
          label="Linked membership type"
          value={membershipType}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setMembershipType(event.target.value as LinkedMembershipType)
          }
          options={TYPE_OPTIONS.map((option) => ({
            value: option.value,
            className: 'request-linked-membership-modal__option',
            label: (
              <span className="request-linked-membership-modal__option-label">
                <BoldText as="span" size={2}>
                  {option.title}
                </BoldText>
                <RegularText as="span" size={1} color="grey-5">
                  {option.description}
                </RegularText>
              </span>
            ),
          }))}
        />

        <div className="request-linked-membership-modal__name-field">
          <Input
            characterLimit={MAX_NAME_LENGTH}
            description="Enter linked membership name."
            isDisabled={isBusy}
            label="Linked membership name"
            name="linkedMembershipName"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
            placeholder="Enter linked membership name"
            value={name}
          />
        </div>

        {hasCommitment && (
          <InlineNotification status="warning" isStandalone>
            This customer has a 3-year commitment and cannot create a linked membership.
          </InlineNotification>
        )}

        {(localError || (status === 'error' && error)) && (
          <InlineNotification status="error" isStandalone>
            {localError || error}
          </InlineNotification>
        )}

        {status === 'success' && (
          <InlineNotification status="success" isStandalone>
            The linked membership request has been submitted to Adobe.
          </InlineNotification>
        )}
      </div>

      <div className="request-linked-membership-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          Close
        </Button>
        <Button
          isBusy={isBusy}
          isDisabled={hasCommitment}
          onClick={handleSubmit}
          type="primary"
        >
          Create
        </Button>
      </div>
    </div>
  );
}

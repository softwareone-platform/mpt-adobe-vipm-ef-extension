import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../i18n/translations';
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
import type { AccountType, LinkedMembershipType } from '../shared/linked-membership';
import { hasThreeYearCommitment } from '../shared/model';
import { canRequestLinkedMembership } from '../utils/security';

import './App.scss';

const MAX_NAME_LENGTH = 255;

const TYPE_OPTIONS: Array<{ value: LinkedMembershipType; title: string; description: string }> = [
  {
    value: 'STANDARD',
    title: i18n.t('LinkedMembership:Options:Standard:Title'),
    description: i18n.t('LinkedMembership:Options:Standard:Description'),
  },
  {
    value: 'CONSORTIUM',
    title: i18n.t('LinkedMembership:Options:Consortium:Title'),
    description: i18n.t('LinkedMembership:Options:Consortium:Description'),
  },
];

export default function App() {
  const { t } = useTranslation();
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
      setLocalError(t('LinkedMembership:Validation:NameRequired'));
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
          {t('LinkedMembership:Title')}
        </BoldText>
      </div>

      <div className="request-linked-membership-modal__content">
        {hasCommitment && (
          <InlineNotification status="warning">
            {t('LinkedMembership:HasCommitment')}
          </InlineNotification>
        )}

        {(localError || (status === 'error' && error)) && (
          <InlineNotification status="error">
            {localError || error}
          </InlineNotification>
        )}

        {status === 'success' && (
          <InlineNotification status="success">
            {t('LinkedMembership:Success')}
          </InlineNotification>
        )}

        <RadioButtonGroup
          name="linked-membership-type"
          label={t('LinkedMembership:Type')}
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
            description={t('LinkedMembership:Name description')}
            isDisabled={isBusy}
            label={t('LinkedMembership:Name label')}
            name="linkedMembershipName"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
            placeholder={t('LinkedMembership:Name placeholder')}
            value={name}
          />
        </div>

      </div>

      <div className="request-linked-membership-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          {t('Common:Close')}
        </Button>
        <Button
          isBusy={isBusy}
          isDisabled={hasCommitment}
          onClick={handleSubmit}
          type="primary"
        >
          {t('LinkedMembership:Create')}
        </Button>
      </div>
    </div>
  );
}

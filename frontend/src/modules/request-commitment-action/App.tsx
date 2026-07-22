import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../i18n/translations';
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { Select } from '@softwareone-platform/sdk-react-ui-v0/select';
import { Input } from '@softwareone-platform/sdk-react-ui-v0/input';
import { Switcher } from '@softwareone-platform/sdk-react-ui-v0/switcher';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useThreeYearCommitmentRequest } from '../shared/hooks/useThreeYearCommitmentRequest';
import { useSettings } from '../shared/hooks/useSettings';
import { findThreeYearBenefit, readMinimumQuantity } from '../shared/model';
import type {
  AccountType,
  MinimumQuantity,
  ThreeYearCommitmentRequestInput,
} from '../shared/three-year-commitment';
import { canRequestThreeYearCommitment } from '../utils/security';
import { toIntOrNull } from '../utils/coerce';

import './App.scss';

function buildMinimumQuantities(
  licenses: number | null,
  consumables: number | null,
): MinimumQuantity[] {
  const quantities: MinimumQuantity[] = [];
  if (licenses != null) {
    quantities.push({ offerType: 'LICENSE', quantity: licenses });
  }
  if (consumables != null) {
    quantities.push({ offerType: 'CONSUMABLES', quantity: consumables });
  }
  return quantities;
}

function validateAtLeastOneQuantity(
  licenses: number | null,
  consumables: number | null,
): string | null {
  const hasLicenses = licenses != null && licenses > 0;
  const hasConsumables = consumables != null && consumables > 0;
  return hasLicenses || hasConsumables ? null : i18n.t('Commitment:Validation:AtLeastOne');
}

function validateAboveMinimum(
  label: string,
  value: number | null,
  currentMinimum: number | null,
): string | null {
  if (currentMinimum == null || value == null) return null;
  if (value <= currentMinimum) {
    return i18n.t('Commitment:Validation:AboveMinimum', { label, minimum: currentMinimum });
  }
  return null;
}

function validateRequestType(
  requestType: 'commitment' | 'recommitment',
  currentEnrollStatus: string | null,
): string | null {
  if (currentEnrollStatus === 'COMMITTED' && requestType === 'commitment') {
    return i18n.t('Commitment:Validation:AlreadyCommitted');
  }
  return null;
}

export default function App() {
  const { t } = useTranslation();
  const { close } = useMPTModal();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const canRequest = canRequestThreeYearCommitment(
    context.auth?.account?.type,
    settings?.products,
    context.data?.agreement?.product?.id,
  );

  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);

  const currentCommitment = findThreeYearBenefit(adobeCustomer.data)?.commitment;
  const currentEnrollStatus = currentCommitment?.status ?? null;
  const currentMinimumLicenses = readMinimumQuantity(currentCommitment, 'LICENSE');
  const currentMinimumConsumables = readMinimumQuantity(currentCommitment, 'CONSUMABLES');
  const disableCommitmentOption = currentEnrollStatus === 'COMMITTED';

  const { error, status, submitRequest } = useThreeYearCommitmentRequest(agreementId);

  const [localError, setLocalError] = useState('');
  const [requestType, setRequestType] = useState<'commitment' | 'recommitment'>(
    disableCommitmentOption ? 'recommitment' : 'commitment',
  );
  const [discountLevel, setDiscountLevel] = useState('');
  const [customLicenses, setCustomLicenses] = useState('');
  const [discountTier, setDiscountTier] = useState('');
  const [customConsumables, setCustomConsumables] = useState('');

  const isBusy = status === 'loading';

  if (!canRequest) return null;

  function resolveValue(selection: string, customRaw: string): number | null {
    if (selection === 'custom') return toIntOrNull(customRaw);
    if (selection === '') return null;
    return toIntOrNull(selection);
  }

  async function handleSubmit() {
    const effectiveLicenses = resolveValue(discountLevel, customLicenses);
    const effectiveConsumables = resolveValue(discountTier, customConsumables);

    const validationError =
      validateRequestType(requestType, currentEnrollStatus) ??
      validateAtLeastOneQuantity(effectiveLicenses, effectiveConsumables) ??
      validateAboveMinimum(t('Commitment:Licenses'), effectiveLicenses, currentMinimumLicenses) ??
      validateAboveMinimum(t('Commitment:Consumables'), effectiveConsumables, currentMinimumConsumables);

    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError('');
    const minimumQuantities = buildMinimumQuantities(effectiveLicenses, effectiveConsumables);
    const input: ThreeYearCommitmentRequestInput = {
      benefits: [
        {
          type: 'THREE_YEAR_COMMIT',
          ...(requestType === 'recommitment'
            ? { recommitmentRequest: { minimumQuantities } }
            : { commitmentRequest: { minimumQuantities } }),
        },
      ],
    };

    const result = await submitRequest(input);
    if (result) {
      close({ customer: result });
    }
  }

  return (
    <div className="request-commitment-modal">
      <div className="request-commitment-modal__header">
        <MediumText as="h2" size={4}>
          {t('Commitment:Title')}
        </MediumText>
      </div>

      <div className="request-commitment-modal__content">
        <RegularText as="p" size={2} color="grey-5">
        {t('Commitment:Description')}
      </RegularText>

      <Switcher
        name="request-type"
        label={t('Commitment:Request type')}
        value={requestType}
        onChange={(e) => setRequestType(e.target.value as 'commitment' | 'recommitment')}
        options={[
          { label: t('Commitment:RequestType:commitment'), value: 'commitment', disabled: disableCommitmentOption },
          { label: t('Commitment:RequestType:recommitment'), value: 'recommitment' },
        ]}
      />
      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        {t('Commitment:RequestTypeHint')}
      </RegularText>

      <MediumText as="h3" size={3}>
        {t('Commitment:Licenses')}
      </MediumText>

      <Select
        positions={{ position: 'bottom-start' }}
        controlLabel={t('Commitment:Discount level')}
        placeholder={t('Commitment:Discount level placeholder')}
        value={discountLevel}
        onChange={setDiscountLevel}
        options={[
          { label: t('Commitment:Not required'), value: '' },
          { label: t('Commitment:LicenseLevels:Level 12'), value: '10' },
          { label: t('Commitment:LicenseLevels:Level 13'), value: '50' },
          { label: t('Commitment:LicenseLevels:Level 14'), value: '100' },
          { label: t('Commitment:Custom'), value: 'custom' },
        ]}
      />

      <div className="request-commitment-modal__custom-field">
        <Input
          htmlInputType="number"
          isDisabled={isBusy || discountLevel !== 'custom'}
          label={t('Commitment:Custom license count')}
          min="0"
          name="customLicenses"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setCustomLicenses(event.target.value)
          }
          placeholder={t('Commitment:Custom license placeholder')}
          value={customLicenses}
        />
      </div>

      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        {t('Commitment:Custom level hint')}
      </RegularText>

      <MediumText as="h3" size={3}>
        {t('Commitment:Consumables')}
      </MediumText>

      <Select
        positions={{ position: 'bottom-start' }}
        controlLabel={t('Commitment:Discount tier')}
        placeholder={t('Commitment:Discount tier placeholder')}
        value={discountTier}
        onChange={setDiscountTier}
        options={[
          { label: t('Commitment:Not required'), value: '' },
          { label: t('Commitment:ConsumableTiers:TB'), value: '1000' },
          { label: t('Commitment:ConsumableTiers:TC'), value: '2500' },
          { label: t('Commitment:ConsumableTiers:TD'), value: '5000' },
          { label: t('Commitment:ConsumableTiers:TE'), value: '15000' },
          { label: t('Commitment:ConsumableTiers:TF'), value: '50000' },
          { label: t('Commitment:ConsumableTiers:TG'), value: '100000' },
          { label: t('Commitment:Custom'), value: 'custom' },
        ]}
      />

      <div className="request-commitment-modal__custom-field">
        <Input
          htmlInputType="number"
          isDisabled={isBusy || discountTier !== 'custom'}
          label={t('Commitment:Custom consumable count')}
          min="0"
          name="customConsumables"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setCustomConsumables(event.target.value)
          }
          placeholder={t('Commitment:Custom consumable placeholder')}
          value={customConsumables}
        />
      </div>

      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        {t('Commitment:Custom tier hint')}
      </RegularText>

      {(localError || (status === 'error' && error)) && (
        <InlineNotification status="error" isStandalone>
          {localError || error}
        </InlineNotification>
      )}

        {status === 'success' && (
          <InlineNotification status="success" isStandalone>
            {t('Commitment:Success')}
          </InlineNotification>
        )}
      </div>

      <div className="request-commitment-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          {t('Common:Close')}
        </Button>
        <Button isBusy={isBusy} onClick={handleSubmit} type="primary">
          {t('Commitment:Send invitation')}
        </Button>
      </div>
    </div>
  );
}

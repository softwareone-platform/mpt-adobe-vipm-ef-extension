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

import { Loader } from '../shared/components/Loader/Loader';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useThreeYearCommitmentRequest } from '../shared/hooks/useThreeYearCommitmentRequest';
import { useSettings } from '../shared/hooks/useSettings';
import type {
  AccountType,
  MinimumQuantity,
  ThreeYearCommitmentRequestInput,
} from '../shared/three-year-commitment';
import { canRequestThreeYearCommitment } from '../utils/security';
import { toIntOrNull } from '../utils/coerce';

import {
  isRecommitmentOpen,
  quantityFloor,
  readCommitmentState,
  recommitmentOpensOn,
} from './commitmentRules';
import type { CommitmentState, PendingRequest, RequestType } from './commitmentRules';

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

function validateRequestType(requestType: RequestType, state: CommitmentState): string | null {
  if (requestType === 'recommitment' && !isRecommitmentOpen(state)) {
    return i18n.t('Commitment:Validation:RecommitmentClosed');
  }
  return null;
}

function validateAboveFloor(
  licenses: number | null,
  consumables: number | null,
  licenseFloor: number | null,
  consumableFloor: number | null,
): string | null {
  if (licenseFloor != null && (licenses == null || licenses < licenseFloor)) {
    return i18n.t('Commitment:Validation:BelowLicenseMinimum', { quantity: licenseFloor });
  }
  if (consumableFloor != null && (consumables == null || consumables < consumableFloor)) {
    return i18n.t('Commitment:Validation:BelowConsumableMinimum', { quantity: consumableFloor });
  }
  return null;
}

interface QuantityLevel {
  labelKey: string;
  quantity: number;
}

const LICENSE_LEVELS: QuantityLevel[] = [
  { labelKey: 'Commitment:LicenseLevels:Level 12', quantity: 10 },
  { labelKey: 'Commitment:LicenseLevels:Level 13', quantity: 50 },
  { labelKey: 'Commitment:LicenseLevels:Level 14', quantity: 100 },
];

const CONSUMABLE_TIERS: QuantityLevel[] = [
  { labelKey: 'Commitment:ConsumableTiers:TB', quantity: 1000 },
  { labelKey: 'Commitment:ConsumableTiers:TC', quantity: 2500 },
  { labelKey: 'Commitment:ConsumableTiers:TD', quantity: 5000 },
  { labelKey: 'Commitment:ConsumableTiers:TE', quantity: 15000 },
  { labelKey: 'Commitment:ConsumableTiers:TF', quantity: 50000 },
  { labelKey: 'Commitment:ConsumableTiers:TG', quantity: 100000 },
];

/**
 * Build the quantity options for one offer type.
 *
 * With a floor (an uplevel of a committed offer type), levels below the current
 * minimum are disabled, the current one is marked, and the empty choice keeps the
 * current minimum, because Adobe rejects a request that drops a committed type.
 */
function buildQuantityOptions(levels: QuantityLevel[], floor: number | null) {
  return [
    floor != null
      ? { label: i18n.t('Commitment:Keep current', { quantity: floor }), value: '' }
      : { label: i18n.t('Commitment:Not required'), value: '' },
    ...levels.map(({ labelKey, quantity }) => ({
      label:
        quantity === floor
          ? i18n.t('Commitment:Current level', { label: i18n.t(labelKey) })
          : i18n.t(labelKey),
      value: String(quantity),
      disabled: floor != null && quantity < floor,
    })),
    { label: i18n.t('Commitment:Custom'), value: 'custom' },
  ];
}

function resolveValue(selection: string, customRaw: string, floor: number | null): number | null {
  if (selection === 'custom') return toIntOrNull(customRaw);
  if (selection === '') return floor;
  return toIntOrNull(selection);
}

/** The pending request's quantities, e.g. "10 licenses and 1,000 consumables". */
function describePendingQuantities(pending: PendingRequest): string {
  const parts = [
    pending.licenses != null
      ? i18n.t('Commitment:PendingLicenses', { quantity: pending.licenses.toLocaleString('en-US') })
      : null,
    pending.consumables != null
      ? i18n.t('Commitment:PendingConsumables', {
          quantity: pending.consumables.toLocaleString('en-US'),
        })
      : null,
  ].filter((part): part is string => part != null);
  return parts.join(i18n.t('Commitment:PendingAnd'));
}

function recommitmentHint(state: CommitmentState): string | null {
  if (!state.isCommitted || !state.endDate) {
    return i18n.t('Commitment:RecommitmentNotCommitted');
  }
  if (!isRecommitmentOpen(state)) {
    return i18n.t('Commitment:RecommitmentOpensOn', {
      opensOn: recommitmentOpensOn(state.endDate),
      endDate: state.endDate.slice(0, 10),
    });
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

  const commitmentState = readCommitmentState(adobeCustomer.data);

  const { error, status, submitRequest } = useThreeYearCommitmentRequest(agreementId);

  const [localError, setLocalError] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('commitment');
  const [discountLevel, setDiscountLevel] = useState('');
  const [customLicenses, setCustomLicenses] = useState('');
  const [discountTier, setDiscountTier] = useState('');
  const [customConsumables, setCustomConsumables] = useState('');

  const isBusy = status === 'loading';
  const isCustomerPending = adobeCustomer.status === 'idle' || adobeCustomer.status === 'loading';
  const customerError =
    adobeCustomer.status === 'error'
      ? adobeCustomer.error || t('Errors:LoadAdobeCustomer')
      : null;

  if (!canRequest) return null;

  if (isCustomerPending) {
    return (
      <div className="request-commitment-modal">
        <div className="request-commitment-modal__header">
          <MediumText as="h2" size={4}>
            {t('Commitment:Title')}
          </MediumText>
        </div>
        <div className="request-commitment-modal__content">
          <Loader />
        </div>
        <div className="request-commitment-modal__actions">
          <Button onClick={() => close()} type="secondary">
            {t('Common:Close')}
          </Button>
        </div>
      </div>
    );
  }

  if (customerError) {
    return (
      <div className="request-commitment-modal">
        <div className="request-commitment-modal__header">
          <MediumText as="h2" size={4}>
            {t('Commitment:Title')}
          </MediumText>
        </div>
        <div className="request-commitment-modal__content">
          <InlineNotification status="error">{customerError}</InlineNotification>
        </div>
        <div className="request-commitment-modal__actions">
          <Button onClick={() => close()} type="secondary">
            {t('Common:Close')}
          </Button>
          <Button onClick={adobeCustomer.refresh} type="primary">
            {t('Common:Retry')}
          </Button>
        </div>
      </div>
    );
  }

  const licenseFloor = quantityFloor(commitmentState, requestType, 'LICENSE');
  const consumableFloor = quantityFloor(commitmentState, requestType, 'CONSUMABLES');
  const recommitmentOpen = isRecommitmentOpen(commitmentState);
  const recommitmentClosedHint = recommitmentHint(commitmentState);
  // Adobe accepts no commitment request while a recommitment request is in place.
  const isCommitmentBlocked = requestType === 'commitment' && commitmentState.hasRecommitmentRequest;

  async function handleSubmit() {
    const effectiveLicenses = resolveValue(discountLevel, customLicenses, licenseFloor);
    const effectiveConsumables = resolveValue(discountTier, customConsumables, consumableFloor);

    const validationError =
      validateRequestType(requestType, commitmentState) ??
      validateAtLeastOneQuantity(effectiveLicenses, effectiveConsumables) ??
      validateAboveFloor(effectiveLicenses, effectiveConsumables, licenseFloor, consumableFloor);

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
        {(localError || (status === 'error' && error)) && (
          <InlineNotification status="error">
            {localError || error}
          </InlineNotification>
        )}

        {commitmentState.pendingRequest && (
          <InlineNotification status="info">
            {t('Commitment:PendingRequest', {
              type: t(`Commitment:RequestType:${commitmentState.pendingRequest.type}`),
              quantities: describePendingQuantities(commitmentState.pendingRequest),
            })}
          </InlineNotification>
        )}

        {isCommitmentBlocked && (
          <InlineNotification status="info">
            {t('Commitment:RecommitmentInPlace')}
          </InlineNotification>
        )}

        {status === 'success' && (
          <InlineNotification status="success">
            {t('Commitment:Success')}
          </InlineNotification>
        )}

        <RegularText as="p" size={2} color="grey-5">
        {t('Commitment:Description')}
      </RegularText>

      <Switcher
        name="request-type"
        label={t('Commitment:Request type')}
        value={requestType}
        onChange={(e) => setRequestType(e.target.value as 'commitment' | 'recommitment')}
        options={[
          { label: t('Commitment:RequestType:commitment'), value: 'commitment' },
          {
            label: t('Commitment:RequestType:recommitment'),
            value: 'recommitment',
            disabled: !recommitmentOpen,
          },
        ]}
      />
      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        {t('Commitment:RequestTypeHint')}
      </RegularText>
      {recommitmentClosedHint && (
        <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
          {recommitmentClosedHint}
        </RegularText>
      )}

      <MediumText as="h3" size={3}>
        {t('Commitment:Licenses')}
      </MediumText>

      <Select
        positions={{ position: 'bottom-start' }}
        controlLabel={t('Commitment:Discount level')}
        placeholder={t('Commitment:Discount level placeholder')}
        value={discountLevel}
        onChange={setDiscountLevel}
        options={buildQuantityOptions(LICENSE_LEVELS, licenseFloor)}
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
        options={buildQuantityOptions(CONSUMABLE_TIERS, consumableFloor)}
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

      </div>

      <div className="request-commitment-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          {t('Common:Close')}
        </Button>
        <Button
          isBusy={isBusy}
          isDisabled={isCommitmentBlocked}
          onClick={handleSubmit}
          type="primary"
        >
          {t('Commitment:Send invitation')}
        </Button>
      </div>
    </div>
  );
}

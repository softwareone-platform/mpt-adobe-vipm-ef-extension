import { useState } from 'react';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { Select } from '@softwareone-platform/sdk-react-ui-v0/select';
import { Input } from '@softwareone-platform/sdk-react-ui-v0/input';
import { Switcher } from '@softwareone-platform/sdk-react-ui-v0/switcher';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { useAgreementId } from '../agreement/hooks/useAgreementId';
import { useAdobeCustomer } from '../agreement/hooks/useAdobeCustomer';
import { useThreeYearCommitmentRequest } from '../agreement/hooks/useThreeYearCommitmentRequest';
import { useSettings } from '../agreement/hooks/useSettings';
import { findThreeYearBenefit, readMinimumQuantity } from '../agreement/model';
import type {
  AccountType,
  MinimumQuantity,
  ThreeYearCommitmentRequestInput,
} from '../agreement/ThreeYearCommitment/model';
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
  return hasLicenses || hasConsumables ? null : 'At least one quantity is required.';
}

function validateAboveMinimum(
  label: string,
  value: number | null,
  currentMinimum: number | null,
): string | null {
  if (currentMinimum == null || value == null) return null;
  if (value <= currentMinimum) {
    return `${label} must be greater than the current minimum (${currentMinimum}).`;
  }
  return null;
}

function validateRequestType(
  requestType: 'commitment' | 'recommitment',
  currentEnrollStatus: string | null,
): string | null {
  if (currentEnrollStatus === 'COMMITTED' && requestType === 'commitment') {
    return 'The customer is already committed. Select recommitment instead.';
  }
  return null;
}

export default function App() {
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
      validateAboveMinimum('Licenses', effectiveLicenses, currentMinimumLicenses) ??
      validateAboveMinimum('Consumables', effectiveConsumables, currentMinimumConsumables);

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
          Request 3-year commitment
        </MediumText>
      </div>

      <div className="request-commitment-modal__content">
        <RegularText as="p" size={2} color="grey-5">
        Provide the minimum quantities that the customer commits to over the next three years. You
        can submit licenses, consumables, or both.
      </RegularText>

      <Switcher
        name="request-type"
        label="Request type"
        value={requestType}
        onChange={(e) => setRequestType(e.target.value as 'commitment' | 'recommitment')}
        options={[
          { label: 'commitment', value: 'commitment', disabled: disableCommitmentOption },
          { label: 'recommitment', value: 'recommitment' },
        ]}
      />
      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        If the customer already has a three year commitment, then choosing the "commitment" option
        above will update the existing commitment. In this scenario, only increases are allowed.
      </RegularText>

      <MediumText as="h3" size={3}>
        Licenses
      </MediumText>

      <Select
        positions={{ position: 'bottom-start' }}
        controlLabel="Discount level"
        placeholder="Select the desired discount level."
        value={discountLevel}
        onChange={setDiscountLevel}
        options={[
          { label: 'Not required', value: '' },
          { label: 'Level 12 (10 licenses)', value: '10' },
          { label: 'Level 13 (50 licenses)', value: '50' },
          { label: 'Level 14 (100 licenses)', value: '100' },
          { label: 'Custom', value: 'custom' },
        ]}
      />

      <div className="request-commitment-modal__custom-field">
        <Input
          htmlInputType="number"
          isDisabled={isBusy || discountLevel !== 'custom'}
          label="Custom license count"
          min="0"
          name="customLicenses"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setCustomLicenses(event.target.value)
          }
          placeholder="Enter a minimum license quantity"
          value={customLicenses}
        />
      </div>

      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        Select custom under the discount level to use this option.
      </RegularText>

      <MediumText as="h3" size={3}>
        Consumables
      </MediumText>

      <Select
        positions={{ position: 'bottom-start' }}
        controlLabel="Discount tier"
        placeholder="Not required"
        value={discountTier}
        onChange={setDiscountTier}
        options={[
          { label: 'Not required', value: '' },
          { label: 'Tier TB (1,000 transactions)', value: '1000' },
          { label: 'Tier TC (2,500 transactions)', value: '2500' },
          { label: 'Tier TD (5,000 transactions)', value: '5000' },
          { label: 'Tier TE (15,000 transactions)', value: '15000' },
          { label: 'Tier TF (50,000 transactions)', value: '50000' },
          { label: 'Tier TG (100,000 transactions)', value: '100000' },
          { label: 'Custom', value: 'custom' },
        ]}
      />

      <div className="request-commitment-modal__custom-field">
        <Input
          htmlInputType="number"
          isDisabled={isBusy || discountTier !== 'custom'}
          label="Custom consumable count"
          min="0"
          name="customConsumables"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setCustomConsumables(event.target.value)
          }
          placeholder="Enter a minimum consumable quantity"
          value={customConsumables}
        />
      </div>

      <RegularText as="span" size={1} color="grey-5" className="request-commitment-modal__hint">
        Select custom under the discount tier to use this option.
      </RegularText>

      {(localError || (status === 'error' && error)) && (
        <InlineNotification status="error" isStandalone>
          {localError || error}
        </InlineNotification>
      )}

        {status === 'success' && (
          <InlineNotification status="success" isStandalone>
            The 3YC request has been submitted to Adobe.
          </InlineNotification>
        )}
      </div>

      <div className="request-commitment-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          Close
        </Button>
        <Button isBusy={isBusy} onClick={handleSubmit} type="primary">
          Send invitation
        </Button>
      </div>
    </div>
  );
}

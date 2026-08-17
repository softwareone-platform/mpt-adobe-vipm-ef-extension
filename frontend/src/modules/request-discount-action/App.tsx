import { useCallback, useEffect, useState } from 'react';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { useTranslation } from 'react-i18next';

import { DiscountWizard } from '../agreement/Discounts/components/wizard/DiscountWizard';
import { createSteps } from '../agreement/Discounts/components/wizard/createSteps';
import { EMPTY_DRAFT, toCreatePayload } from '../agreement/Discounts/components/wizard/discountDraft';
import { validateReview } from '../agreement/Discounts/components/wizard/discountValidation';
import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useCreateDiscountRequest } from '../shared/hooks/useCreateDiscountRequest';
import { useSettings } from '../shared/hooks/useSettings';
import { canManageDiscountCodes } from '../utils/security';
import { getProduct } from '../utils/settings';

import type { DiscountDraft } from '../agreement/Discounts/components/wizard/discountDraft';
import type { Discount } from '../shared/model';
import type { AccountType } from '../shared/three-year-commitment';

import './App.scss';

/** Discriminator the opener puts on the modal context. Absent means create. */
type DiscountWizardMode = 'create' | 'edit';

export default function App() {
  const { t } = useTranslation();
  const { close } = useMPTModal();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string }; price?: { currency?: string } } };
    discount?: { mode?: DiscountWizardMode };
  }>();

  const agreementId = useAgreementId();
  const agreementProductId = context.data?.agreement?.product?.id;
  // The value row is stored against the agreement's currency; the server falls
  // back to the authorization currency, but the fixed-amount types are blocked
  // in the wizard when it cannot be resolved here.
  const agreementCurrency = context.data?.agreement?.price?.currency ?? '';

  const canManage = canManageDiscountCodes(
    context.auth?.account?.type,
    settings?.products,
    agreementProductId,
  );

  const adobeCustomer = useAdobeCustomer(agreementId);
  const { error, fieldErrors, status, submitRequest } = useCreateDiscountRequest(agreementId);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DRAFT);
  const [created, setCreated] = useState<Discount | null>(null);
  const [validationError, setValidationError] = useState('');

  const updateDraft = useCallback((patch: Partial<DiscountDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  // The agreement arrives with the modal context, which the portal can replace
  // after the first render, so the currency is mirrored rather than seeded.
  useEffect(() => {
    setDraft((previous) =>
      previous.currency === agreementCurrency
        ? previous
        : { ...previous, currency: agreementCurrency },
    );
  }, [agreementCurrency]);

  const onSubmit = useCallback(async () => {
    const invalid = validateReview(draft);
    setValidationError(invalid ?? '');
    if (invalid) {
      return false;
    }

    const discount = await submitRequest(toCreatePayload(draft));
    if (!discount) {
      return false;
    }
    setCreated(discount);
    return true;
  }, [draft, submitRequest]);

  const onClose = useCallback(() => close(created ? { created } : undefined), [close, created]);

  // The SDK fires onSave unconditionally on the last step and no step guard can
  // block it, so this only reports the outcome the Review step already secured.
  const onFinish = useCallback(
    () => close(created ? { created } : undefined),
    [close, created],
  );

  // The modal renders nothing rather than a denial notice: the button that
  // opens it is already hidden from client accounts, so reaching this branch
  // means the caller bypassed the UI.
  if (!canManage) return null;

  const steps = createSteps({
    draft,
    updateDraft,
    customerId: adobeCustomer.data?.customerId ?? '',
    segment: getProduct(settings?.products, agreementProductId ?? '')?.segment ?? '',
    onSubmit,
    // A duplicate code comes back as `#/code`; show it alongside the summary so
    // the user knows which step to go back to.
    submitError: validationError || fieldErrors.code || error,
    isSubmitting: status === 'loading',
  });

  return (
    <DiscountWizard
      title={t('Agreement:Discounts:Wizard:Create:Header')}
      steps={steps}
      activeStepIndex={activeStepIndex}
      onActiveStepIndexChange={setActiveStepIndex}
      onClose={onClose}
      onFinish={onFinish}
    />
  );
}

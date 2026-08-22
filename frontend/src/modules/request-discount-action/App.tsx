import { useCallback, useEffect, useState } from 'react';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { useTranslation } from 'react-i18next';

import { DiscountWizard } from '../agreement/Discounts/components/wizard/DiscountWizard';
import { createSteps } from '../agreement/Discounts/components/wizard/createSteps';
import {
  EMPTY_DRAFT,
  toCreatePayload,
  toDraft,
  toUpdatePayload,
} from '../agreement/Discounts/components/wizard/discountDraft';
import { validateReview } from '../agreement/Discounts/components/wizard/discountValidation';
import { editSteps } from '../agreement/Discounts/components/wizard/editSteps';
import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useCreateDiscountRequest } from '../shared/hooks/useCreateDiscountRequest';
import { useDiscountById } from '../shared/hooks/useDiscountById';
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
    data?: {
      agreement?: { product?: { id?: string }; price?: { currency?: string } };
      discount?: { mode?: DiscountWizardMode; id?: string };
      data?: { discount?: { mode?: DiscountWizardMode; id?: string } };
    };
  }>();

  const mode: DiscountWizardMode =
    context.data?.data?.discount?.mode ??
    context.data?.discount?.mode ??
    'create';
  const isEdit = mode === 'edit';
  const discountId =
    context.data?.data?.discount?.id ?? context.data?.discount?.id ?? '';

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
  const existingDiscount = useDiscountById(
    isEdit ? discountId : '',
    agreementId,
  );
  const createRequest = useCreateDiscountRequest(agreementId);
  const { error, fieldErrors, status } = isEdit
    ? {
        error: existingDiscount.error ?? '',
        fieldErrors: existingDiscount.fieldErrors,
        status: existingDiscount.status,
      }
    : createRequest;

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DRAFT);
  const [submittedDiscount, setSubmittedDiscount] = useState<Discount | null>(
    null,
  );
  const [validationError, setValidationError] = useState('');
  const [isSeeded, setIsSeeded] = useState(false);

  const updateDraft = useCallback((patch: Partial<DiscountDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  useEffect(() => {
    if (isEdit) return;
    setDraft((previous) =>
      previous.currency === agreementCurrency
        ? previous
        : { ...previous, currency: agreementCurrency },
    );
  }, [agreementCurrency, isEdit]);

  useEffect(() => {
    if (!isEdit || isSeeded || !existingDiscount.data) return;
    setDraft(toDraft(existingDiscount.data, agreementCurrency));
    setIsSeeded(true);
  }, [isEdit, isSeeded, existingDiscount.data, agreementCurrency]);

  const onCreateSubmit = useCallback(async () => {
    const invalid = validateReview(draft);
    setValidationError(invalid ?? '');
    if (invalid) {
      return false;
    }

    const discount = await createRequest.submitRequest(toCreatePayload(draft));
    if (!discount) {
      return false;
    }
    setSubmittedDiscount(discount);
    return true;
  }, [draft, createRequest]);

  const onClose = useCallback(
    () =>
      close(
        submittedDiscount
          ? isEdit
            ? { updated: submittedDiscount }
            : { created: submittedDiscount }
          : undefined,
      ),
    [close, submittedDiscount, isEdit],
  );

  // Next button fires `onSave` (this callback) directly — `registerOnNextCallback` is bypassed
  // by the SDK — and the PATCH must be re-run here. In create mode the Review
  // step already submitted, so this only closes with the earlier outcome.
  const onFinish = useCallback(async () => {
    if (isEdit && !submittedDiscount) {
      const invalid = validateReview(draft);
      setValidationError(invalid ?? '');
      if (invalid) {
        return;
      }
      const discount = await existingDiscount.update(toUpdatePayload(draft));
      if (!discount) {
        return;
      }
      setSubmittedDiscount(discount);
      close({ updated: discount });
      return;
    }
    close(
      submittedDiscount
        ? isEdit
          ? { updated: submittedDiscount }
          : { created: submittedDiscount }
        : undefined,
    );
  }, [close, submittedDiscount, isEdit, draft, existingDiscount]);

  // The modal renders nothing rather than a denial notice: the button that
  // opens it is already hidden from client accounts, so reaching this branch
  // means the caller bypassed the UI.
  if (settings !== undefined && !canManage) return null;

  const stepInputs = {
    draft,
    updateDraft,
    customerId: adobeCustomer.data?.customerId ?? '',
    segment:
      getProduct(settings?.products, agreementProductId ?? '')?.segment ?? '',
  };

  const steps = isEdit
    ? editSteps({
        ...stepInputs,
        submitError: validationError || fieldErrors.code || error,
        isSubmitting: status === 'loading',
      })
    : createSteps({
        ...stepInputs,
        onSubmit: onCreateSubmit,
        // A duplicate code comes back as `#/code`; show it alongside the summary so
        // the user knows which step to go back to.
        submitError: validationError || fieldErrors.code || error,
        isSubmitting: status === 'loading',
      });

  return (
    <DiscountWizard
      title={t(
        isEdit
          ? 'Agreement:Discounts:Wizard:Edit:Header'
          : 'Agreement:Discounts:Wizard:Create:Header',
      )}
      steps={steps}
      activeStepIndex={activeStepIndex}
      onActiveStepIndexChange={setActiveStepIndex}
      onClose={onClose}
      onFinish={onFinish}
    />
  );
}

import { Dispatch, SetStateAction, useState, useMemo, useEffect, useCallback } from 'react';
import { Order } from '../model';
import { StepNavigationProperties, useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Button, Input } from '@softwareone-platform/sdk-react-ui-v0';
import { isValueChanged } from '../../utils/value';

import './DetailsStep.scss';
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';

interface DetailsStepProps {
  order: Order;
  setOrder: Dispatch<SetStateAction<Order>>;
  isSplitBillingStepSkip?: boolean;
}

export function useUpdateOrder(orderId?: string | null) {
  return useCallback(
    async (payload: Partial<Order>): Promise<Order> => ({ id: orderId, ...payload }),
    [orderId]
  );
}

export function DetailsStep({
  order,
  setOrder,
  isSplitBillingStepSkip,
}: DetailsStepProps) {
  const [externalId, setExternalId] = useState(order?.externalIds?.client ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const handleUpdateOrder = useUpdateOrder(order?.id);
  const { registerOnNextCallback, registerOnBackCallback } = useStepActions();
  const [isSaving, setIsSaving] = useState(false);

  const isOrderChanged = useMemo(
    () =>
      isValueChanged(externalId, order?.externalIds?.client ?? '') ||
      isValueChanged(notes, order?.notes ?? ''),
    [order, externalId, notes]
  );

  const saveOrder = useCallback(
    async () => {
      if (!isOrderChanged || isSaving) {
        return;
      }
      setIsSaving(true);
      try {
        const updatedOrder = await handleUpdateOrder({
          externalIds: { ...order?.externalIds, client: externalId },
          notes,
        });
        setOrder({ ...order, ...updatedOrder });
      } finally {
        setIsSaving(false);
      }
    },
    [order, externalId, notes, isOrderChanged, isSaving, handleUpdateOrder, setOrder]
  );

  const onBack = useCallback(
    async ({ currentStepIndex }: StepNavigationProperties) =>
      isSplitBillingStepSkip ? currentStepIndex - 2 : currentStepIndex - 1,
    [isSplitBillingStepSkip]
  );

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      try {
        await saveOrder();
      } catch {
        return currentStepIndex;
      }
      return targetStepIndex;
    },
    [saveOrder]
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);
  useEffect(() => registerOnBackCallback(onBack), [onBack, registerOnBackCallback]);

  return (
    <div className="details" data-testid='subscription-edit-details-client'>
      <div className="details__section__header">
        <RegularText as="h2" size={4}>
          Order
        </RegularText>
      </div>
      <div className="details__section__highlights">
        <WizardHighlights />
      </div>
      <div className="details__section">
        <div className="details__section__inputs">
          <Input
            label={"Additional Id"}
            labelType={"optional"}
            placeholder={"Enter additional ID"}
            description={"Enter a value that will help you identify this order"}
            value={externalId}
            onChange={(e: { target: HTMLInputElement; }) => setExternalId((e.target as HTMLInputElement).value)}
            testId='order-additional-id'
          />
          <Input
            className={"details__section__input"}
            type={"textarea"}
            height={120}
            name={'notes'}
            label={"Notes"}
            labelType={"optional"}
            description={' '}
            placeholder={"Enter notes"}
            value={notes}
            onChange={(e: { target: HTMLInputElement; }) => setNotes((e.target as HTMLInputElement).value)}
            testId='order-notes'
          />
        </div>
      </div>
      <Button
        type='secondary'
        className={'details__section__saveButton'}
        disabled={isSaving}
        onClick={() => saveOrder()}
      >
        Save Order
      </Button>
    </div>
  )
}

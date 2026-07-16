import { Dispatch, SetStateAction, useState, useMemo, useEffect, useCallback } from 'react';
import { Order } from '../model';
import { Subscription } from '../../shared/model';
import { StepNavigationProperties, useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Input } from '@softwareone-platform/sdk-react-ui-v0';
import { isValueChanged } from '../../utils/value';

import './DetailsStep.scss';
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';

interface DetailsStepProps {
  subscription: Subscription;
  order: Order;
  setOrder: Dispatch<SetStateAction<Order>>;
  isSplitBillingStepSkip?: boolean;
}

export function DetailsStep({
  subscription,
  order,
  setOrder,
  isSplitBillingStepSkip,
}: DetailsStepProps) {
  const [externalId, setExternalId] = useState(order?.externalIds?.client ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
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
        setOrder({
          ...order,
          externalIds: { ...order?.externalIds, client: externalId },
          notes,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [order, externalId, notes, isOrderChanged, isSaving, setOrder]
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
        <WizardHighlights subscription={subscription} />
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
    </div>
  )
}

import { ReactElement, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../../i18n/translations';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Tabs, Tab } from '@softwareone-platform/sdk-react-ui-v0/tabs';
import { useStepActions, StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import {
  Grid,
  GridColumnDefinition,
  GridFieldDefinition,
  GridCellSimple,
  useGridInMemory,
} from '@softwareone-platform/sdk-react-ui-v0/grid';

import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';
import { PopoverCell } from '../components/grid-cell/popover-cell/PopoverCell';
import { TextCell } from '../components/grid-cell/text-cell/TextCell';
import { ChipCell } from '../components/grid-cell/chip-cell/ChipCell';
import { ItemCard } from '../components/item-card/ItemCard';
import { SubscriptionCard } from '../components/subscription-card/SubscriptionCard';
import { Order, TargetSubscription } from '../model';
import { Agreement, Subscription } from '../../shared/model';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { getMonthlyPrice, getYearlyPrice, parseUnitPrice, sumPrices } from '../../utils/price';

import './ReviewOrderStep.scss';

type ReviewRow = TargetSubscription & {
  isSummary?: boolean;
  summaryTitle?: string;
  summarySubtitle?: string;
  newTotalM?: string;
  newTotalY?: string;
};

function getReviewRow(subscription: TargetSubscription): ReviewRow {
  const unitPrice = parseUnitPrice(subscription.unitSP);
  const newQuantity = subscription.newQuantity ?? 0;
  return {
    ...subscription,
    newTotalM: getMonthlyPrice(unitPrice, newQuantity),
    newTotalY: getYearlyPrice(unitPrice, newQuantity),
  };
}

function getSummaryRow(rows: ReviewRow[]): ReviewRow {
  return {
    id: 'order-price',
    name: null,
    status: '',
    item: { id: '', name: '', externalId: '' },
    recommended: false,
    currentQuantity: 0,
    newQuantity: null,
    delta: 0,
    unitSP: '',
    spxM: sumPrices(rows.map((row) => row.spxM)),
    spxY: sumPrices(rows.map((row) => row.spxY)),
    newTotalM: sumPrices(rows.map((row) => row.newTotalM)),
    newTotalY: sumPrices(rows.map((row) => row.newTotalY)),
    terms: '',
    commitment: '',
    isSummary: true,
    summaryTitle: i18n.t('MidtermUpgrade:Review:Order price'),
    summarySubtitle: i18n.t('MidtermUpgrade:Review:Items price'),
  };
}

function getColumns(
  subscriptions: ReviewRow[],
  agreement?: Agreement,
): GridColumnDefinition<ReviewRow>[] {
  return [
    {
      name: 'rowNumber',
      title: '#',
      initialWidth: 48,
      minWidth: 48,
      isScalable: false,
      cell: (item) =>
        item.isSummary ? <GridCellSimple></GridCellSimple> : <GridCellSimple>{subscriptions.indexOf(item) + 1}</GridCellSimple>,
    },
    {
      name: 'item',
      title: i18n.t('Common:Item'),
      fields: ['item'],
      cell: (item) =>
        item.isSummary ? (
          <TextCell text={item.summaryTitle} secondaryContent={item.summarySubtitle} />
        ) : (
          <PopoverCell
            title={i18n.t('Common:Item')}
            text={item.item.name}
            secondaryContent={`${item.item.id} | ${item.item.externalId}`}
            url={getItemLink(item.item.id)}
            card={<ItemCard item={item.item} />}
          />
        ),
    },
    {
      name: 'subscription',
      title: i18n.t('Common:Subscriptions'),
      fields: ['subscription'],
      cell: (item) => {
        if (item.isSummary) return <GridCellSimple></GridCellSimple>;
        return item.id ? (
          <PopoverCell
            title={i18n.t('Common:Subscription')}
            text={item.name ?? undefined}
            secondaryContent={item.id}
            url={getSubscriptionLink(item.id ?? undefined)}
            card={
              <SubscriptionCard
                id={item.id}
                name={item.name}
                status={item.status}
                commitmentDate={item.commitmentDate}
                terms={item.subscriptionTerms}
                audit={item.audit}
                agreement={agreement}
              />
            }
          />
        ) : (
          <ChipCell label={i18n.t('MidtermUpgrade:Grid:New')} color="gray" />
        );
      },
    },
    {
      name: 'terms',
      title: i18n.t('MidtermUpgrade:Grid:Terms'),
      fields: ['terms'],
      cell: (item) =>
        item.isSummary ? (
          <GridCellSimple></GridCellSimple>
        ) : (
          <TextCell text={item.terms} secondaryContent={item.commitment} />
        ),
    },
    {
      name: 'delta',
      title: i18n.t('MidtermUpgrade:Grid:Qty'),
      fields: ['delta'],
      initialWidth: 100,
      cell: (item) =>
        item.isSummary ? (
          <GridCellSimple></GridCellSimple>
        ) : (
          <TextCell text={item.delta > 0 ? `+${item.delta}` : item.delta} secondaryContent={item.newQuantity} />
        ),
    },
    {
      name: 'unitSP',
      title: i18n.t('MidtermUpgrade:Grid:Unit SP'),
      fields: ['unitSP'],
      initialWidth: 120,
      cell: (item) =>
        item.isSummary ? (
          <GridCellSimple></GridCellSimple>
        ) : (
          <TextCell text={item.unitSP} secondaryContent={i18n.t('MidtermUpgrade:Grid:user/year')} />
        ),
    },
    {
      name: 'spxM',
      title: i18n.t('MidtermUpgrade:Grid:SPxM'),
      fields: ['spxM'],
      initialWidth: 120,
      cell: (item) => <TextCell text={item.spxM} secondaryContent={item.newTotalM} />,
    },
    {
      name: 'spxY',
      title: i18n.t('MidtermUpgrade:Grid:SPxY'),
      fields: ['spxY'],
      initialWidth: 120,
      cell: (item) => <TextCell text={item.spxY} secondaryContent={item.newTotalY} />,
    },
  ];
}

const fields: GridFieldDefinition[] = [
  { name: 'item', title: i18n.t('Common:Item') },
  { name: 'subscription', title: i18n.t('Common:Subscriptions') },
  { name: 'terms', title: i18n.t('MidtermUpgrade:Grid:Terms') },
  { name: 'delta', title: i18n.t('MidtermUpgrade:Grid:Qty') },
  { name: 'unitSP', title: i18n.t('MidtermUpgrade:Grid:Unit SP') },
  { name: 'spxM', title: i18n.t('MidtermUpgrade:Grid:SPxM') },
  { name: 'spxY', title: i18n.t('MidtermUpgrade:Grid:SPxY') },
];

function ItemsGrid({ subscriptions, agreement }: { subscriptions: TargetSubscription[]; agreement?: Agreement }) {
  const { t } = useTranslation();
  const reviewRows = subscriptions.map(getReviewRow);
  const rows: ReviewRow[] = [...reviewRows, getSummaryRow(reviewRows)];

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-midterm-upgrade-action__review-order-grid',
    columns: getColumns(reviewRows, agreement),
    fields,
    paging: { page: 1, pageSize: rows.length, total: rows.length },
    isToHideFooter: true,
  });

  return (
    <div className="review-order-step__items">
      <Grid {...gridProps} />
      <div className="review-order-step__footer-text">
        <RegularText as="p" size={1}>
          {t('MidtermUpgrade:UpgradeTo:PriceDisclaimer')}
        </RegularText>
      </div>
    </div>
  );
}

interface ReviewOrderStepProps {
  subscription: Subscription;
  order: Order;
  subscriptions: TargetSubscription[];
  onPlaceOrder?: () => Promise<boolean>;
  errorMessage?: string;
  isSubmitting?: boolean;
}

export function ReviewOrderStep({
  subscription,
  order,
  subscriptions,
  onPlaceOrder,
  errorMessage,
  isSubmitting,
}: ReviewOrderStepProps): ReactElement | null {
  const { t } = useTranslation();
  const [tabId, setTabId] = useState('items');
  const { registerOnNextCallback } = useStepActions();

  const orderingParameters = (subscription.agreement?.parameters?.ordering ?? []).filter(
    (parameter) => !parameter.constraints?.hidden,
  );

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      if (!onPlaceOrder) {
        return targetStepIndex;
      }
      const placed = await onPlaceOrder();
      return placed ? targetStepIndex : currentStepIndex;
    },
    [onPlaceOrder],
  );

  useEffect(() => {
    registerOnNextCallback(onNext);
  }, [onNext, registerOnNextCallback]);

  if (!order) return null;

  return (
    <div className="review-order-step" data-testid="review-order-step">
      <div className="review-order-step__header">
        <RegularText as="h2" size={4}>
          {t('MidtermUpgrade:Steps:Review order')}
        </RegularText>
      </div>
      {errorMessage ? (
        <div className="review-order-step__error" data-testid="review-order-step-error">
          <InlineNotification status="error" isStandalone>
            {errorMessage}
          </InlineNotification>
        </div>
      ) : null}
      {isSubmitting ? (
        <div className="review-order-step__submitting" data-testid="review-order-step-submitting">
          <RegularText as="p" size={2} color="grey-4">
            {t('MidtermUpgrade:Review:Placing order')}
          </RegularText>
        </div>
      ) : null}
      <div className="review-order-step__highlights">
        <WizardHighlights subscription={subscription} order={order} />
      </div>
      <Tabs type="inline" selectedTabId={tabId} onTabChange={setTabId}>
        <Tab id="items" title={t('MidtermUpgrade:Review:Tabs:Items')}>
          <Tab.Content>
            <ItemsGrid subscriptions={subscriptions} agreement={subscription.agreement} />
          </Tab.Content>
        </Tab>
        <Tab id="parameters" title={t('MidtermUpgrade:Review:Tabs:Parameters')}>
          <Tab.Content>
            {orderingParameters.length ? (
              <div className="review-order-step__tab review-order-step__details">
                {orderingParameters.map((parameter) => (
                  <div key={parameter.id} className="review-order-step__details-item">
                    <RegularText as="h5" size={2}>
                      {parameter.name}
                    </RegularText>
                    <RegularText as="p" size={2} color="grey-4">
                      {parameter.displayValue || '—'}
                    </RegularText>
                  </div>
                ))}
              </div>
            ) : (
              <div className="review-order-step__tab">
                <RegularText as="p" size={2} color="grey-4">
                  {t('MidtermUpgrade:Review:No parameters')}
                </RegularText>
              </div>
            )}
          </Tab.Content>
        </Tab>
        <Tab id="details" title={t('MidtermUpgrade:Review:Tabs:Details')}>
          <Tab.Content>
            <div className="review-order-step__tab review-order-step__details">
              <div className="review-order-step__details-item">
                <RegularText as="h5" size={2}>
                  {t('MidtermUpgrade:Review:Additional ID')}
                </RegularText>
                <RegularText as="p" size={2} color="grey-4">
                  {order.externalIds?.client || '—'}
                </RegularText>
              </div>
              <div className="review-order-step__details-item">
                <RegularText as="h5" size={2}>
                  {t('MidtermUpgrade:Review:Notes')}
                </RegularText>
                <RegularText as="p" size={2} color="grey-4">
                  {order.notes || '—'}
                </RegularText>
              </div>
            </div>
          </Tab.Content>
        </Tab>
      </Tabs>
    </div>
  );
}

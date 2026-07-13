import { ReactElement, useState, useCallback, useEffect } from 'react';

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
import { Order, TargetSubscription } from '../model';
import { Subscription } from '../../shared/model';
import { parsePrice, formatPrice } from '../../utils/price';

import './ReviewOrderStep.scss';

type ReviewRow = TargetSubscription & {
  isSummary?: boolean;
  summaryTitle?: string;
  summarySubtitle?: string;
};

function saveOrder(
  order: Order,
  subscriptions: TargetSubscription[],
  recommendationTrackerId: string | undefined,
): void {
  void order;
  void subscriptions;
  void recommendationTrackerId;
}

function getSummaryRow(subscriptions: TargetSubscription[]): ReviewRow {
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
    spxM: formatPrice(subscriptions.reduce((total, s) => total + parsePrice(s.spxM), 0)),
    spxY: formatPrice(subscriptions.reduce((total, s) => total + parsePrice(s.spxY), 0)),
    terms: '',
    commitment: '',
    isSummary: true,
    summaryTitle: 'Order price *',
    summarySubtitle: 'Items price *',
  };
}

function getColumns(subscriptions: TargetSubscription[]): GridColumnDefinition<ReviewRow>[] {
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
      title: 'Item',
      fields: ['item'],
      cell: (item) =>
        item.isSummary ? (
          <TextCell text={item.summaryTitle} secondaryContent={item.summarySubtitle} />
        ) : (
          <PopoverCell
            title="Item"
            text={item.item.name}
            secondaryContent={`${item.item.id} | ${item.item.externalId}`}
            items={[
              { title: 'ID', content: item.item.id },
              { title: 'Name', content: item.item.name },
              { title: 'External ID', content: item.item.externalId },
            ]}
          />
        ),
    },
    {
      name: 'subscription',
      title: 'Subscriptions',
      fields: ['subscription'],
      cell: (item) => {
        if (item.isSummary) return <GridCellSimple></GridCellSimple>;
        return item.id ? (
          <PopoverCell
            title="Subscription"
            text={item.name ?? undefined}
            secondaryContent={item.id}
            items={[
              { title: 'ID', content: item.id },
              { title: 'Name', content: item.name },
            ]}
          />
        ) : (
          <ChipCell label="New" color="gray" />
        );
      },
    },
    {
      name: 'terms',
      title: 'Terms',
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
      title: 'Qty',
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
      title: 'Unit SP',
      fields: ['unitSP'],
      initialWidth: 120,
      cell: (item) =>
        item.isSummary ? (
          <GridCellSimple></GridCellSimple>
        ) : (
          <TextCell text={item.unitSP} secondaryContent="user/year" />
        ),
    },
    {
      name: 'spxM',
      title: 'SPxM',
      fields: ['spxM'],
      initialWidth: 120,
      cell: (item) => <TextCell text={item.spxM} />,
    },
    {
      name: 'spxY',
      title: 'SPxY',
      fields: ['spxY'],
      initialWidth: 120,
      cell: (item) => <TextCell text={item.spxY} />,
    },
  ];
}

const fields: GridFieldDefinition[] = [
  { name: 'item', title: 'Item' },
  { name: 'subscription', title: 'Subscriptions' },
  { name: 'terms', title: 'Terms' },
  { name: 'delta', title: 'Qty' },
  { name: 'unitSP', title: 'Unit SP' },
  { name: 'spxM', title: 'SPxM' },
  { name: 'spxY', title: 'SPxY' },
];

function ItemsGrid({ subscriptions }: { subscriptions: TargetSubscription[] }) {
  const rows: ReviewRow[] = [...subscriptions, getSummaryRow(subscriptions)];

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-midterm-upgrade-action__review-order-grid',
    columns: getColumns(subscriptions),
    fields,
    paging: { page: 1, pageSize: rows.length, total: rows.length },
    isToHideFooter: true,
  });

  return (
    <div className="review-order-step__items">
      <Grid {...gridProps} />
      <div className="review-order-step__footer-text">
        <RegularText as="p" size={1}>
          * These estimated prices include estimates of invoice charges, which are subject to change, and the actual amounts will be reflected on your next bill. Please note that any applicable taxes (e.g., VAT or sales tax) will be calculated and included in the final invoice.
        </RegularText>
      </div>
    </div>
  );
}

interface ReviewOrderStepProps {
  subscription: Subscription;
  order: Order;
  subscriptions: TargetSubscription[];
  recommendationTrackerId?: string;
}

export function ReviewOrderStep({
  subscription,
  order,
  subscriptions,
  recommendationTrackerId,
}: ReviewOrderStepProps): ReactElement | null {
  const [tabId, setTabId] = useState('items');
  const { registerOnNextCallback } = useStepActions();

  const onNext = useCallback(
    ({ targetStepIndex }: StepNavigationProperties) => {
      saveOrder(order, subscriptions, recommendationTrackerId);
      return targetStepIndex;
    },
    [order, subscriptions, recommendationTrackerId],
  );

  useEffect(() => {
    registerOnNextCallback(onNext);
  }, [onNext, registerOnNextCallback]);

  if (!order) return null;

  return (
    <div className="review-order-step" data-testid="review-order-step">
      <div className="review-order-step__header">
        <RegularText as="h2" size={4}>
          Review order
        </RegularText>
      </div>
      <div className="review-order-step__highlights">
        <WizardHighlights subscription={subscription} />
      </div>
      <Tabs type="inline" selectedTabId={tabId} onTabChange={setTabId}>
        <Tab id="items" title="Items">
          <Tab.Content>
            <ItemsGrid subscriptions={subscriptions} />
          </Tab.Content>
        </Tab>
        <Tab id="parameters" title="Parameters">
          <Tab.Content>
            <div className="review-order-step__tab">
              <RegularText as="p" size={2} color="grey-4">
                No parameters to display.
              </RegularText>
            </div>
          </Tab.Content>
        </Tab>
        <Tab id="details" title="Details">
          <Tab.Content>
            <div className="review-order-step__tab">
              <RegularText as="p" size={2} color="grey-4">
                No details to display.
              </RegularText>
            </div>
          </Tab.Content>
        </Tab>
      </Tabs>
    </div>
  );
}

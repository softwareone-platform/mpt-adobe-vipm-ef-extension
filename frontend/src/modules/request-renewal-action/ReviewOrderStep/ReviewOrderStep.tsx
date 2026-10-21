import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Grid,
  GridCellSimple,
  GridColumnDefinition,
  GridFieldDefinition,
  useGridInMemory,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { Tab, Tabs } from '@softwareone-platform/sdk-react-ui-v0/tabs';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { i18n } from '../../../i18n/translations';
import { ChipCell } from '../../shared/components/GridCell/ChipCell/ChipCell';
import { PopoverCell } from '../../shared/components/GridCell/PopoverCell/PopoverCell';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { ItemCard } from '../components/item-card/ItemCard';
import { SubscriptionCard } from '../components/subscription-card/SubscriptionCard';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { TERM_COMMITMENT_LABELS, TERM_PERIOD_LABELS } from '../../shared/constants';
import type { Agreement, ProductItem, RenewalPreview, Subscription } from '../../shared/model';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { getQuotedPrice } from '../../utils/discount';
import { formatOptionalPrice, formatPrice } from '../../utils/price';
import { getPartialSku } from '../../utils/sku';
import { formatQuantityDelta } from '../../utils/quantity';
import {
  getRenewalQuantity,
  isRenewing,
  type NetNewItem,
  type OrderDetails,
  type RenewalQuantities,
  type RenewalSelections,
} from '../model';

import './ReviewOrderStep.scss';

export interface ReviewOrderStepProps {
  agreement: Agreement;
  subscriptions: Subscription[];
  selections: RenewalSelections;
  quantities: RenewalQuantities;
  lineQuantities: Record<string, number>;
  netNewItems: NetNewItem[];
  preview: RenewalPreview | null;
  details: OrderDetails;
  onPlaceOrder: () => Promise<boolean>;
  errorMessage?: string;
}

interface Row {
  id: string;
  kind: 'subscription' | 'net-new' | 'total';
  position: number;
  item?: ProductItem;
  itemId: string;
  itemName: string;
  sku: string;
  subscription?: Subscription;
  subscriptionId: string;
  subscriptionName: string;
  terms: string;
  commitment: string;
  delta: number | null;
  newQuantity: number | null;
  unitSP: number | null;
  discounted: boolean;
  spxM: number | null;
  spxY: number | null;
  newSpxM: number | null;
  newSpxY: number | null;
}

function totalPrice(unitSP: number | null, quantity: number | null, months: number): number | null {
  return unitSP == null || !quantity ? null : (unitSP * quantity) / months;
}

function sumTotals(rows: Row[], pick: (row: Row) => number | null): number | null {
  const totals = rows.map(pick).filter((total): total is number => total != null);
  return totals.length ? totals.reduce((sum, total) => sum + total, 0) : null;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A row's unit SP as Adobe's quote prices it, falling back to its list price.
 *
 * The quote line is found by the Adobe subscription a renewing row renews, or
 * else by SKU: Adobe can leave the subscription id empty and changes the
 * offer id's level suffix, so SKUs are compared as partial SKUs. A SKU belongs
 * to one row only, since a net-new product is never one the agreement holds.
 */
function quotedRowPrice(
  preview: RenewalPreview | null,
  listUnitSP: number | null,
  sku: string,
  adobeSubscriptionId?: string,
): { unitSP: number | null; discounted: boolean } {
  const lines = preview?.lineItems ?? [];
  const bySubscription = adobeSubscriptionId
    ? lines.find((item) => item.subscriptionId === adobeSubscriptionId)
    : undefined;
  const line =
    bySubscription ??
    lines.find((item) => Boolean(sku) && getPartialSku(item.offerId ?? '') === getPartialSku(sku));
  const quoted = getQuotedPrice(listUnitSP, line?.pricing);
  return quoted
    ? { unitSP: roundToCents(quoted.unitSP), discounted: quoted.discounted }
    : { unitSP: listUnitSP, discounted: false };
}

function toSubscriptionRows(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  lineQuantities: Record<string, number>,
  preview: RenewalPreview | null,
): Row[] {
  return subscriptions.map((subscription, index) => {
    const line = subscription.lines?.[0];
    const renews = isRenewing(subscription, selections);
    const currentQuantity = lineQuantities[subscription.id] ?? line?.quantity ?? 0;
    const newQuantity = renews ? (getRenewalQuantity(subscription, quantities) ?? 0) : 0;
    const change = newQuantity - currentQuantity;
    const delta = change === 0 ? null : change;
    const { unitSP, discounted } = quotedRowPrice(
      preview,
      line?.price?.unitSP ?? null,
      line?.item.externalIds?.vendor ?? '',
      subscription.externalIds?.vendor,
    );
    return {
      id: subscription.id,
      kind: 'subscription' as const,
      position: index + 1,
      item: line?.item,
      subscription,
      itemId: line?.item.id ?? '',
      itemName: line?.item.name ?? '',
      sku: line?.item.externalIds?.vendor ?? '',
      subscriptionId: subscription.id,
      subscriptionName: subscription.name ?? '',
      terms: TERM_PERIOD_LABELS[subscription.terms?.period ?? ''] ?? '—',
      commitment: TERM_COMMITMENT_LABELS[subscription.terms?.commitment ?? ''] ?? '',
      delta,
      newQuantity,
      unitSP,
      discounted,
      spxM: totalPrice(unitSP, delta, 12),
      spxY: totalPrice(unitSP, delta, 1),
      newSpxM: totalPrice(unitSP, newQuantity, 12),
      newSpxY: totalPrice(unitSP, newQuantity, 1),
    };
  });
}

function toNetNewRows(
  netNewItems: NetNewItem[],
  offset: number,
  preview: RenewalPreview | null,
): Row[] {
  return netNewItems.map((item, index) => {
    const { unitSP, discounted } = quotedRowPrice(preview, item.unitSP, item.sku);
    return {
      id: item.itemId,
      kind: 'net-new' as const,
      position: offset + index + 1,
      itemId: item.itemId,
      itemName: item.itemName,
      sku: item.sku,
      subscriptionId: '',
      subscriptionName: '',
      terms: TERM_PERIOD_LABELS[item.terms?.period ?? ''] ?? '—',
      commitment: TERM_COMMITMENT_LABELS[item.terms?.commitment ?? ''] ?? '',
      delta: item.quantity,
      newQuantity: item.quantity,
      unitSP,
      discounted,
      spxM: totalPrice(unitSP, item.quantity, 12),
      spxY: totalPrice(unitSP, item.quantity, 1),
      newSpxM: totalPrice(unitSP, item.quantity, 12),
      newSpxY: totalPrice(unitSP, item.quantity, 1),
    };
  });
}

function toTotalRow(rows: Row[]): Row {
  return {
    id: 'order-price',
    kind: 'total' as const,
    position: 0,
    itemId: '',
    itemName: '',
    sku: '',
    subscriptionId: '',
    subscriptionName: '',
    terms: '',
    commitment: '',
    delta: null,
    newQuantity: null,
    unitSP: null,
    discounted: false,
    spxM: sumTotals(rows, (row) => row.spxM),
    spxY: sumTotals(rows, (row) => row.spxY),
    newSpxM: sumTotals(rows, (row) => row.newSpxM),
    newSpxY: sumTotals(rows, (row) => row.newSpxY),
  };
}

const columns: GridColumnDefinition<Row>[] = [
  {
    name: 'position',
    title: '#',
    initialWidth: 48,
    minWidth: 48,
    isScalable: false,
    cell: (row) => <GridCellSimple>{row.kind === 'total' ? '' : row.position}</GridCellSimple>,
  },
  {
    name: 'item',
    title: i18n.t('Common:Item'),
    fields: ['itemName', 'itemId', 'sku'],
    cell: (row) =>
      row.kind === 'total' ? (
        <TextCell
          text={i18n.t('Renewal:Review:Order price')}
          secondaryContent={i18n.t('Renewal:Review:Items price')}
        />
      ) : (
        <PopoverCell
          title={i18n.t('Common:Item')}
          text={row.itemName}
          secondaryContent={[row.itemId, row.sku].filter(Boolean).join(' | ')}
          url={getItemLink(row.itemId || undefined)}
          card={row.item ? <ItemCard item={row.item} /> : null}
        />
      ),
  },
  {
    name: 'subscription',
    title: i18n.t('Common:Subscriptions'),
    fields: ['subscriptionName', 'subscriptionId'],
    cell: (row) => {
      if (row.kind === 'total') return <GridCellSimple />;
      return row.kind === 'net-new' ? (
        <ChipCell label={i18n.t('Renewal:Items:New')} color="gray" />
      ) : (
        <PopoverCell
          title={i18n.t('Common:Subscription')}
          text={row.subscriptionName}
          secondaryContent={row.subscriptionId}
          url={getSubscriptionLink(row.subscriptionId)}
          card={
            <SubscriptionCard
              id={row.subscription?.id}
              name={row.subscription?.name}
              status={row.subscription?.status}
              commitmentDate={row.subscription?.commitmentDate}
              terms={row.subscription?.terms}
              audit={row.subscription?.audit}
              agreement={row.subscription?.agreement}
            />
          }
        />
      );
    },
  },
  {
    name: 'terms',
    title: i18n.t('Common:Terms title'),
    fields: ['terms', 'commitment'],
    initialWidth: 140,
    cell: (row) =>
      row.kind === 'total' ? (
        <GridCellSimple />
      ) : (
        <TextCell text={row.terms} secondaryContent={row.commitment} />
      ),
  },
  {
    name: 'delta',
    title: i18n.t('Renewal:Review:Qty'),
    fields: ['delta'],
    initialWidth: 90,
    cell: (row) =>
      row.kind === 'total' ? (
        <GridCellSimple />
      ) : (
        <TextCell text={formatQuantityDelta(row.delta)} secondaryContent={row.newQuantity ?? undefined} />
      ),
  },
  {
    name: 'unitSP',
    title: i18n.t('Renewal:Grid:Unit SP'),
    fields: ['unitSP'],
    initialWidth: 120,
    cell: (row) => {
      if (row.kind === 'total' || row.unitSP == null) return <GridCellSimple />;
      return row.discounted ? (
        <DiscountedUnitPriceCell unitSP={row.unitSP} />
      ) : (
        <TextCell
          text={formatPrice(row.unitSP)}
          secondaryContent={i18n.t('Renewal:Grid:Unit SP basis')}
        />
      );
    },
  },
  {
    name: 'spxM',
    title: i18n.t('Renewal:Grid:SPxM'),
    fields: ['spxM'],
    initialWidth: 120,
    cell: (row) => (
      <TextCell text={formatOptionalPrice(row.spxM)} secondaryContent={formatOptionalPrice(row.newSpxM)} />
    ),
  },
  {
    name: 'spxY',
    title: i18n.t('Renewal:Grid:SPxY'),
    fields: ['spxY'],
    initialWidth: 120,
    cell: (row) => (
      <TextCell text={formatOptionalPrice(row.spxY)} secondaryContent={formatOptionalPrice(row.newSpxY)} />
    ),
  },
];

/** A unit SP Adobe quoted below its list price: a discount code applied to the line. */
function DiscountedUnitPriceCell({ unitSP }: { unitSP: number }) {
  return (
    <GridCellSimple>
      <div className="review-order-step__unit-price" data-testid="review-order-step-discounted-price">
        <div className="review-order-step__unit-price-value">
          <RegularText as="p" size={2}>
            {formatPrice(unitSP)}
          </RegularText>
          <Chip label={i18n.t('Renewal:Review:Discounted')} color="success" />
        </div>
        <RegularText as="p" size={1} color="grey-4">
          {i18n.t('Renewal:Grid:Unit SP basis')}
        </RegularText>
      </div>
    </GridCellSimple>
  );
}

const fields: GridFieldDefinition[] = [
  { name: 'itemName', title: i18n.t('Common:Item name') },
  { name: 'itemId', title: i18n.t('Common:Item ID') },
  { name: 'sku', title: i18n.t('Common:Vendor additional ID') },
  { name: 'subscriptionName', title: i18n.t('Common:Subscription name') },
  { name: 'subscriptionId', title: i18n.t('Common:Subscription ID') },
  { name: 'terms', title: i18n.t('Common:Terms title') },
  { name: 'commitment', title: i18n.t('Common:Commitment') },
  { name: 'delta', title: i18n.t('Renewal:Review:Qty'), type: 'number' },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

export function ReviewOrderStep({
  agreement,
  subscriptions,
  selections,
  quantities,
  lineQuantities,
  netNewItems,
  preview,
  details,
  onPlaceOrder,
  errorMessage,
}: ReviewOrderStepProps) {
  const { t } = useTranslation();
  const [tabId, setTabId] = useState('items');
  const { registerOnNextCallback } = useStepActions();

  const rows = useMemo(() => {
    const subscriptionRows = toSubscriptionRows(
      subscriptions,
      selections,
      quantities,
      lineQuantities,
      preview,
    );
    const lineRows = [
      ...subscriptionRows,
      ...toNetNewRows(netNewItems, subscriptionRows.length, preview),
    ];
    return [...lineRows, toTotalRow(lineRows)];
  }, [subscriptions, selections, quantities, lineQuantities, netNewItems, preview]);

  const orderingParameters = (agreement.parameters?.ordering ?? []).filter(
    (parameter) => !parameter.constraints?.hidden,
  );

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const placed = await onPlaceOrder();
      return placed ? targetStepIndex : currentStepIndex;
    },
    [onPlaceOrder],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  // Every line is shown at once: the grid carries the order total as its last row.
  const paging = useMemo(
    () => ({ page: 1, pageSize: rows.length, total: rows.length }),
    [rows.length],
  );

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-renewal__review--client',
    columns,
    fields,
    paging,
    isToHideFooter: true,
  });

  return (
    <div className="review-order-step" data-testid="review-order-step">
      <div className="review-order-step__header">
        <MediumText as="h2" size={4}>
          {t('Renewal:Steps:Review order')}
        </MediumText>
      </div>
      <div className="review-order-step__highlights">
        <WizardHighlights agreement={agreement} />
      </div>
      {errorMessage && (
        <div data-testid="review-order-step-error">
          <InlineNotification status="error">
            {errorMessage}
          </InlineNotification>
        </div>
      )}
      <Tabs type="inline" selectedTabId={tabId} onTabChange={setTabId}>
        <Tab id="items" title={t('Renewal:Review:Tabs:Items')}>
          <Tab.Content>
            <div className="review-order-step__tab review-order-step__grid">
              <Grid {...gridProps} />
            </div>
            <RegularText as="p" size={1} color="grey-4" className="review-order-step__disclaimer">
              {t('Renewal:Grid:Price disclaimer')}
            </RegularText>
          </Tab.Content>
        </Tab>
        <Tab id="parameters" title={t('Renewal:Review:Tabs:Parameters')}>
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
                  {t('Renewal:Review:No parameters')}
                </RegularText>
              </div>
            )}
          </Tab.Content>
        </Tab>
        <Tab id="details" title={t('Renewal:Review:Tabs:Details')}>
          <Tab.Content>
            <div className="review-order-step__tab review-order-step__details">
              <div className="review-order-step__details-item">
                <RegularText as="h5" size={2}>
                  {t('Renewal:Details:Additional ID')}
                </RegularText>
                <RegularText as="p" size={2} color="grey-4">
                  {details.externalId || '—'}
                </RegularText>
              </div>
              <div className="review-order-step__details-item">
                <RegularText as="h5" size={2}>
                  {t('Renewal:Details:Notes')}
                </RegularText>
                <RegularText as="p" size={2} color="grey-4">
                  {details.notes || '—'}
                </RegularText>
              </div>
            </div>
          </Tab.Content>
        </Tab>
      </Tabs>
    </div>
  );
}

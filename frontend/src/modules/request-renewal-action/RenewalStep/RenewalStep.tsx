import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import {
  Grid,
  GridCellSimple,
  GridColumnDefinition,
  GridFieldDefinition,
  GridFieldSortOperation,
  useGridInMemory,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Toggle } from '@softwareone-platform/sdk-react-ui-v0/toggle';

import { i18n } from '../../../i18n/translations';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { LinkReference } from '../../shared/components/LinkReference/LinkReference';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { TERM_COMMITMENT_LABELS, TERM_PERIOD_LABELS } from '../../shared/constants';
import type { Agreement, Subscription } from '../../shared/model';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { formatPrice } from '../../utils/price';
import { isRenewedByDefault, type RenewalSelections } from '../model';

import './RenewalStep.scss';

const EMPTY_VALUE = '—';
const PAGE_SIZE = 10;

export interface RenewalStepProps {
  agreement: Agreement;
  subscriptions: Subscription[];
  selections: RenewalSelections;
  onRenewChange: (subscriptionId: string, renew: boolean) => void;
}

interface Row {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  subscriptionId: string;
  subscriptionName: string;
  terms: string;
  commitment: string;
  quantity: number | null;
  unitSP?: number;
  spxM?: number;
  spxY?: number;
  renew: boolean;
  initialRenew: boolean;
}

function toRows(subscriptions: Subscription[], selections: RenewalSelections): Row[] {
  return subscriptions.map((subscription) => {
    // Adobe subscriptions hold exactly one item, so the first line carries the
    // SKU, quantity and prices — the same line the renewal order acts on.
    const line = subscription.lines?.[0];
    const initialRenew = isRenewedByDefault(subscription);
    return {
      id: subscription.id,
      itemId: line?.item.id ?? '',
      itemName: line?.item.name ?? '',
      sku: line?.item.externalIds?.vendor ?? '',
      subscriptionId: subscription.id,
      subscriptionName: subscription.name ?? '',
      terms: TERM_PERIOD_LABELS[subscription.terms?.period ?? ''] ?? EMPTY_VALUE,
      commitment: TERM_COMMITMENT_LABELS[subscription.terms?.commitment ?? ''] ?? '',
      quantity: line?.quantity ?? null,
      unitSP: line?.price?.unitSP,
      spxM: line?.price?.SPxM,
      spxY: line?.price?.SPxY,
      renew: selections[subscription.id] ?? initialRenew,
      initialRenew,
    };
  });
}

function priceWhileRenewing(row: Row, value: number | undefined): string {
  return row.renew && value != null ? formatPrice(value) : EMPTY_VALUE;
}

function buildColumns(
  onRenewChange: RenewalStepProps['onRenewChange'],
): GridColumnDefinition<Row>[] {
  return [
    {
      name: 'item',
      title: i18n.t('Common:Item'),
      fields: ['itemName'],
      cell: (row) => (
        <GridCellSimple>
          <LinkReference
            text={row.itemName}
            secondaryContent={[row.itemId, row.sku].filter(Boolean).join(' | ')}
            url={getItemLink(row.itemId || undefined)}
            icon={null}
          />
        </GridCellSimple>
      ),
    },
    {
      name: 'subscription',
      title: i18n.t('Common:Subscription'),
      fields: ['subscriptionName'],
      cell: (row) => (
        <GridCellSimple>
          <LinkReference
            text={row.subscriptionName}
            secondaryContent={row.subscriptionId}
            url={getSubscriptionLink(row.subscriptionId)}
            icon={null}
          />
        </GridCellSimple>
      ),
    },
    {
      name: 'terms',
      title: i18n.t('Common:Terms title'),
      fields: ['terms'],
      initialWidth: 140,
      cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
    },
    {
      name: 'quantity',
      title: i18n.t('Renewal:Grid:Current qty'),
      fields: ['quantity'],
      initialWidth: 100,
      cell: (row) => <TextCell text={row.quantity ?? EMPTY_VALUE} />,
    },
    {
      name: 'renew',
      title: i18n.t('Renewal:Grid:Renew'),
      fields: ['renew'],
      initialWidth: 90,
      isScalable: false,
      cell: (row) => (
        <GridCellSimple>
          <Toggle
            isChecked={row.renew}
            onChange={(isChecked: boolean) => onRenewChange(row.id, isChecked)}
            testId={`renew-${row.id}`}
          />
        </GridCellSimple>
      ),
    },
    {
      name: 'unitSP',
      title: i18n.t('Renewal:Grid:Unit SP'),
      fields: ['unitSP'],
      initialWidth: 120,
      cell: (row) => (
        <TextCell
          text={row.unitSP != null ? formatPrice(row.unitSP) : EMPTY_VALUE}
          secondaryContent={row.unitSP != null ? i18n.t('Renewal:Grid:Unit SP basis') : undefined}
        />
      ),
    },
    {
      name: 'spxM',
      title: i18n.t('Renewal:Grid:SPxM'),
      fields: ['spxM'],
      initialWidth: 120,
      cell: (row) => <TextCell text={priceWhileRenewing(row, row.spxM)} />,
    },
    {
      name: 'spxY',
      title: i18n.t('Renewal:Grid:SPxY'),
      fields: ['spxY'],
      initialWidth: 120,
      cell: (row) => <TextCell text={priceWhileRenewing(row, row.spxY)} />,
    },
    {
      name: 'actions',
      title: i18n.t('Renewal:Grid:Actions'),
      initialWidth: 90,
      isScalable: false,
      cell: (row) => (
        <GridCellSimple>
          <Button
            type="text"
            isDisabled={row.renew === row.initialRenew}
            onClick={() => onRenewChange(row.id, row.initialRenew)}
            testId={`undo-${row.id}`}
          >
            {i18n.t('Renewal:Grid:Undo')}
          </Button>
        </GridCellSimple>
      ),
    },
  ];
}

const fields: GridFieldDefinition[] = [
  { name: 'itemName', title: i18n.t('Common:Item') },
  { name: 'subscriptionName', title: i18n.t('Common:Subscription') },
  { name: 'terms', title: i18n.t('Common:Terms title') },
  { name: 'quantity', title: i18n.t('Renewal:Grid:Current qty'), type: 'number' },
  { name: 'renew', title: i18n.t('Renewal:Grid:Renew') },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

const sort: GridFieldSortOperation[] = [{ field: 'itemName', direction: 'asc' }];

export function RenewalStep({
  agreement,
  subscriptions,
  selections,
  onRenewChange,
}: RenewalStepProps) {
  const { t } = useTranslation();
  const rows = useMemo(() => toRows(subscriptions, selections), [subscriptions, selections]);
  const columns = useMemo(() => buildColumns(onRenewChange), [onRenewChange]);

  // The grid re-applies the paging config whenever its identity changes, so
  // an inline object would reset the page on every render and dead-lock the
  // pagination controls. Memoize it on the row count only.
  const paging = useMemo(
    () => ({ page: 1, pageSize: PAGE_SIZE, total: rows.length }),
    [rows.length],
  );

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-renewal__subscriptions--client',
    columns,
    fields,
    sort,
    paging,
  });

  return (
    <div className="renewal-step">
      <div className="renewal-step__header">
        <MediumText as="h2" size={4}>
          {t('Renewal:Steps:Renewal')}
        </MediumText>
      </div>
      <div className="renewal-step__highlights">
        <WizardHighlights agreement={agreement} />
      </div>
      <InlineNotification status="info" isStandalone>
        {t('Renewal:Grid:Prompt')}
      </InlineNotification>
      <div className="renewal-step__grid">
        <Grid {...gridProps} />
      </div>
      <RegularText as="p" size={1} color="grey-4" className="renewal-step__disclaimer">
        {t('Renewal:Grid:Price disclaimer')}
      </RegularText>
    </div>
  );
}

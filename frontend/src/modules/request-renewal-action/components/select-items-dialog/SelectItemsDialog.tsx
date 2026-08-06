import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { Checkbox } from '@softwareone-platform/sdk-react-ui-v0/checkbox';
import {
  Grid,
  GridCellSimple,
  GridColumnDefinition,
  GridFieldDefinition,
  GridFieldSortOperation,
  useGridInMemory,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { Modal } from '@softwareone-platform/sdk-react-ui-v0/modal';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { i18n } from '../../../../i18n/translations';
import { TextCell } from '../../../shared/components/GridCell/TextCell/TextCell';
import { LinkReference } from '../../../shared/components/LinkReference/LinkReference';
import { Loader } from '../../../shared/components/Loader/Loader';
import { TERM_COMMITMENT_LABELS, TERM_PERIOD_LABELS } from '../../../shared/constants';
import { usePriceListItems } from '../../../shared/hooks/usePriceListItems';
import type { PriceListItem } from '../../../shared/model';
import { getItemLink } from '../../../utils/link';
import { formatPrice } from '../../../utils/price';
import { getPartialSku } from '../../../utils/sku';
import type { NetNewItem } from '../../model';

import './SelectItemsDialog.scss';

const EMPTY_VALUE = '—';
const PAGE_SIZE = 10;
const ONE_TIME_MODEL = 'one-time';

const BILLING_MODEL_LABELS: Record<string, string> = {
  quantity: 'Quantity',
  [ONE_TIME_MODEL]: 'One-time',
};

export interface SelectItemsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  /** Partial SKUs to keep out of the picker: held subscriptions and items already added. */
  excludedSkus: Set<string>;
  /** Partial SKUs Adobe recommends for this customer, crossed in by the backend. */
  recommendedSkus: Set<string>;
  currency: string;
  onAdd: (items: NetNewItem[]) => void;
}

// Field values back the grid's sorting and filtering, so `item` matches the
// configured field name and prices stay numeric; cells own the formatting.
interface Row {
  id: string;
  item: string;
  sku: string;
  billingModel: string;
  terms: string;
  commitment: string;
  unitLP: number | null;
  unitSP: number | null;
  spxM: number | null;
  spxY: number | null;
  recommended: boolean;
  priceListItem: PriceListItem;
}

/**
 * The per-period breakdown of a yearly-expressed unit selling price for one
 * license. One-time entries never reach this (the picker excludes them).
 */
function priceBreakdown(unitSP: number | null, period?: string | null): {
  spxM: number | null;
  spxY: number | null;
} {
  if (unitSP == null) return { spxM: null, spxY: null };
  if (period === '1m') return { spxM: unitSP, spxY: unitSP * 12 };
  if (period === '1y') return { spxM: unitSP / 12, spxY: unitSP };
  return { spxM: null, spxY: null };
}

function toRows(priceListItems: PriceListItem[], excludedSkus: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const priceListItem of priceListItems) {
    const item = priceListItem.item;
    const sku = item?.externalIds?.vendor ?? '';
    const partialSku = getPartialSku(sku);
    // A held item renews through its subscription and a one-time item cannot
    // become a scheduled subscription, so neither is offered as net-new.
    if (!item || !sku || excludedSkus.has(partialSku)) continue;
    if ((item.terms?.model ?? '') === ONE_TIME_MODEL) continue;
    const unitSP = priceListItem.unitSP ?? null;
    rows.push({
      id: item.id,
      item: item.name,
      sku,
      billingModel:
        BILLING_MODEL_LABELS[item.terms?.model ?? ''] ?? item.terms?.model ?? EMPTY_VALUE,
      terms: TERM_PERIOD_LABELS[item.terms?.period ?? ''] ?? EMPTY_VALUE,
      commitment: TERM_COMMITMENT_LABELS[item.terms?.commitment ?? ''] ?? '',
      unitLP: priceListItem.unitLP ?? null,
      unitSP,
      ...priceBreakdown(unitSP, item.terms?.period),
      recommended: priceListItem.recommended === true,
      priceListItem,
    });
  }
  return rows;
}

function toNetNewItem(row: Row): NetNewItem {
  return {
    itemId: row.id,
    itemName: row.item,
    sku: row.sku,
    terms: row.priceListItem.item?.terms ?? undefined,
    unitSP: row.unitSP,
    quantity: 1,
    recommended: row.recommended,
  };
}

function priceCell(value: number | null, currency: string, basis?: string) {
  return (
    <TextCell
      text={value != null ? `${currency} ${formatPrice(value)}`.trim() : EMPTY_VALUE}
      secondaryContent={value != null ? basis : undefined}
    />
  );
}

function buildColumns(
  selectedIds: Set<string>,
  onToggle: (row: Row, isChecked: boolean) => void,
  currency: string,
): GridColumnDefinition<Row>[] {
  const unitBasis = i18n.t('Renewal:Grid:Unit SP basis');
  return [
    {
      name: 'select',
      initialWidth: 40,
      minWidth: 40,
      isScalable: false,
      cell: (row) => (
        <GridCellSimple>
          <Checkbox
            isChecked={selectedIds.has(row.id)}
            onChange={(event) => onToggle(row, event.target.checked)}
            testId={`select-${row.id}`}
          />
        </GridCellSimple>
      ),
    },
    {
      name: 'item',
      title: i18n.t('Common:Item'),
      fields: ['item'],
      cell: (row) => (
        <GridCellSimple>
          <LinkReference
            text={row.item}
            secondaryContent={[row.id, row.sku].filter(Boolean).join(' | ')}
            url={getItemLink(row.id)}
            icon={null}
          />
        </GridCellSimple>
      ),
    },
    {
      name: 'recommended',
      title: i18n.t('Renewal:Items:Recommended'),
      fields: ['recommended'],
      initialWidth: 120,
      cell: (row) => (
        <TextCell text={row.recommended ? i18n.t('Renewal:Items:Yes') : EMPTY_VALUE} />
      ),
    },
    {
      name: 'billingModel',
      title: i18n.t('Renewal:Items:Billing model'),
      fields: ['billingModel'],
      initialWidth: 120,
      cell: (row) => <TextCell text={row.billingModel} />,
    },
    {
      name: 'terms',
      title: i18n.t('Common:Terms'),
      fields: ['terms'],
      initialWidth: 140,
      cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
    },
    {
      name: 'unitLP',
      title: i18n.t('Renewal:Items:Unit LP'),
      fields: ['unitLP'],
      initialWidth: 120,
      cell: (row) => priceCell(row.unitLP, currency, unitBasis),
    },
    {
      name: 'unitSP',
      title: i18n.t('Renewal:Grid:Unit SP'),
      fields: ['unitSP'],
      initialWidth: 120,
      cell: (row) => priceCell(row.unitSP, currency, unitBasis),
    },
    {
      name: 'spxM',
      title: i18n.t('Renewal:Grid:SPxM'),
      fields: ['spxM'],
      initialWidth: 120,
      cell: (row) => priceCell(row.spxM, currency, unitBasis),
    },
    {
      name: 'spxY',
      title: i18n.t('Renewal:Grid:SPxY'),
      fields: ['spxY'],
      initialWidth: 120,
      cell: (row) => priceCell(row.spxY, currency, unitBasis),
    },
  ];
}

const fields: GridFieldDefinition[] = [
  { name: 'item', title: i18n.t('Common:Item') },
  { name: 'recommended', title: i18n.t('Renewal:Items:Recommended') },
  { name: 'billingModel', title: i18n.t('Renewal:Items:Billing model') },
  { name: 'terms', title: i18n.t('Common:Terms') },
  { name: 'unitLP', title: i18n.t('Renewal:Items:Unit LP'), type: 'number' },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

const sort: GridFieldSortOperation[] = [{ field: 'item', direction: 'asc' }];

export function SelectItemsDialog({
  isOpen,
  onClose,
  agreementId,
  excludedSkus,
  recommendedSkus,
  currency,
  onAdd,
}: SelectItemsDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Record<string, Row>>({});
  // Fetch only while the dialog is open; closing aborts and resets.
  const priceListItems = usePriceListItems(isOpen ? agreementId : '', recommendedSkus);

  const rows = useMemo(
    () => toRows(priceListItems.data, excludedSkus),
    [priceListItems.data, excludedSkus],
  );

  const onToggle = useCallback((row: Row, isChecked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (isChecked) {
        next[row.id] = row;
      } else {
        delete next[row.id];
      }
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => new Set(Object.keys(selected)), [selected]);
  const columns = useMemo(
    () => buildColumns(selectedIds, onToggle, currency),
    [selectedIds, onToggle, currency],
  );

  // The grid re-applies the paging config whenever its identity changes, so
  // an inline object would reset the page on every render and dead-lock the
  // pagination controls. Memoize it on the row count only.
  const paging = useMemo(
    () => ({ page: 1, pageSize: PAGE_SIZE, total: rows.length }),
    [rows.length],
  );

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-renewal__select-items--client',
    columns,
    fields,
    sort,
    paging,
  });

  const close = () => {
    setSelected({});
    onClose();
  };

  const addSelection = () => {
    onAdd(Object.values(selected).map(toNetNewItem));
    close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t('Renewal:Items:Select items')}
      width="80%"
      testId="select-items-dialog"
      actions={
        <div className="select-items-dialog__actions">
          <Button type="text" onClick={close} testId="select-items-close">
            {t('Common:Close')}
          </Button>
          <Button
            isDisabled={selectedIds.size === 0}
            onClick={addSelection}
            testId="select-items-add"
          >
            {t('Renewal:Items:Add items')}
          </Button>
        </div>
      }
    >
      <div className="select-items-dialog">
        <InlineNotification status="info" isStandalone>
          {t('Renewal:Items:Picker note')}
        </InlineNotification>
        {priceListItems.status === 'error' && (
          <>
            <InlineNotification status="error" isStandalone>
              {priceListItems.error ?? t('Errors:LoadPriceListItems')}
            </InlineNotification>
            <Button onClick={priceListItems.refresh} testId="select-items-retry">
              {t('Common:Retry')}
            </Button>
          </>
        )}
        {(priceListItems.status === 'loading' || priceListItems.status === 'idle') && <Loader />}
        {priceListItems.status === 'success' && (
          <>
            <div className="select-items-dialog__grid">
              <Grid {...gridProps} />
            </div>
            <RegularText as="p" size={1} color="grey-4">
              {t('Renewal:Grid:Price disclaimer')}
            </RegularText>
          </>
        )}
      </div>
    </Modal>
  );
}

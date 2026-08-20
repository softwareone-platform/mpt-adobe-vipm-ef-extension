import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { i18n } from '../../../i18n/translations';
import { ChipCell } from '../../shared/components/GridCell/ChipCell/ChipCell';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { TextInputCell } from '../../shared/components/GridCell/TextInputCell/TextInputCell';
import { LinkReference } from '../../shared/components/LinkReference/LinkReference';
import { NoDataCard } from '../../shared/components/NoDataCard/NoDataCard';
import { ProgressModal } from '../../shared/components/ProgressModal/ProgressModal';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import {
  RENEWAL_LEARN_MORE_URL,
  TERM_COMMITMENT_LABELS,
  TERM_PERIOD_LABELS,
} from '../../shared/constants';
import { useRenewalPlanValidation } from '../../shared/hooks/useRenewalPlanValidation';
import type { Agreement, Subscription } from '../../shared/model';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { formatPrice, getMonthlyPrice, getYearlyPrice } from '../../utils/price';
import { getPartialSku } from '../../utils/sku';
import { SelectItemsDialog } from '../components/select-items-dialog/SelectItemsDialog';
import {
  buildRenewalPlanRequest,
  getDefaultRenewalQuantity,
  findRenewAndAddConflict,
  getHeldSkus,
  getRemainingQuantity,
  getRenewalQuantity,
  getRenewalState,
  isIncreaseAllowed,
  isRenewing,
  type NetNewItem,
  type RenewalPath,
  type RenewalQuantities,
  type RenewalSelections,
  type RenewalStates,
  type RenewalLine,
  type RenewAndAddConflict,
} from '../model';

import './ItemsStep.scss';

const EMPTY_VALUE = '—';
const MIN_RENEWAL_QUANTITY = 1;
const PAGE_SIZE = 10;

export interface ItemsStepProps {
  agreement: Agreement;
  subscriptions: Subscription[];
  selections: RenewalSelections;
  quantities: RenewalQuantities;
  netNewItems: NetNewItem[];
  recommendedSkus: Set<string>;
  /** The path picked on the first step; the early one gates Next on Adobe's preview. */
  path: RenewalPath;
  /** How much of each subscription is already early-renewed, keyed by Adobe id. */
  renewalStates: RenewalStates;
  onQuantityChange: (subscriptionId: string, quantity: number | null) => void;
  onNetNewItemsChange: (items: NetNewItem[]) => void;
}

interface Row {
  id: string;
  kind: 'subscription' | 'net-new';
  itemId: string;
  itemName: string;
  sku: string;
  subscriptionId: string;
  subscriptionName: string;
  terms: string;
  commitment: string;
  currentQuantity: number | null;
  renewalQuantity: number | null;
  defaultQuantity: number | null;
  unitSP: number | null;
  spxM: number | null;
  spxY: number | null;
  renewedQuantity: number | null;
  remainingQuantity: number | null;
  increaseAllowed: boolean;
}

function totalPrice(unitSP: number | null, quantity: number | null, months: number): number | null {
  return unitSP == null || !quantity ? null : (unitSP * quantity) / months;
}

function toSubscriptionRows(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  renewalStates: RenewalStates,
  path: RenewalPath,
): Row[] {
  return subscriptions
    .filter((subscription) => isRenewing(subscription, selections))
    .map((subscription) => {
      // Adobe subscriptions hold exactly one item, so the first line carries
      // the SKU, quantity and prices — the same line the renewal order acts on.
      const line = subscription.lines?.[0];
      const renewalState = getRenewalState(subscription, renewalStates);
      const remainingQuantity = getRemainingQuantity(subscription, renewalStates);
      const increaseAllowed = isIncreaseAllowed(subscription, renewalStates, path);
      return {
        id: subscription.id,
        kind: 'subscription' as const,
        itemId: line?.item.id ?? '',
        itemName: line?.item.name ?? '',
        sku: line?.item.externalIds?.vendor ?? '',
        subscriptionId: subscription.id,
        subscriptionName: subscription.name ?? '',
        terms: TERM_PERIOD_LABELS[subscription.terms?.period ?? ''] ?? EMPTY_VALUE,
        commitment: TERM_COMMITMENT_LABELS[subscription.terms?.commitment ?? ''] ?? '',
        currentQuantity: line?.quantity ?? null,
        renewalQuantity: getRenewalQuantity(subscription, quantities),
        defaultQuantity: getDefaultRenewalQuantity(subscription),
        unitSP: line?.price?.unitSP ?? null,
        spxM: totalPrice(
          line?.price?.unitSP ?? null,
          getRenewalQuantity(subscription, quantities),
          12,
        ),
        spxY: totalPrice(
          line?.price?.unitSP ?? null,
          getRenewalQuantity(subscription, quantities),
          1,
        ),
        renewedQuantity: renewalState?.renewedQuantity ?? null,
        remainingQuantity,
        increaseAllowed,
      };
    });
}

function toNetNewRows(netNewItems: NetNewItem[]): Row[] {
  return netNewItems.map((item) => ({
    id: item.itemId,
    kind: 'net-new' as const,
    itemId: item.itemId,
    itemName: item.itemName,
    sku: item.sku,
    subscriptionId: '',
    subscriptionName: '',
    terms: TERM_PERIOD_LABELS[item.terms?.period ?? ''] ?? EMPTY_VALUE,
    commitment: TERM_COMMITMENT_LABELS[item.terms?.commitment ?? ''] ?? '',
    currentQuantity: null,
    renewalQuantity: item.quantity,
    defaultQuantity: null,
    unitSP: item.unitSP,
    spxM: totalPrice(item.unitSP, item.quantity, 12),
    spxY: totalPrice(item.unitSP, item.quantity, 1),
    renewedQuantity: null,
    remainingQuantity: null,
    increaseAllowed: true,
  }));
}

export function validateRenewalQuantity(quantity: number | null): string | undefined {
  if (quantity === null) return i18n.t('Renewal:Items:Validation:Required');
  if (quantity < MIN_RENEWAL_QUANTITY) {
    return i18n.t('Renewal:Items:Validation:AtLeast', { quantity: MIN_RENEWAL_QUANTITY });
  }
  return undefined;
}

interface RowHandlers {
  onRowQuantityChange: (row: Row, quantity: number | null) => void;
  onRemove: (row: Row) => void;
}

function pricedWhileValid(row: Row, price: (unitSP: number | null, quantity: number) => string) {
  return row.renewalQuantity == null ? '' : price(row.unitSP, row.renewalQuantity);
}

// The guidance names each line by the position the customer sees, so the rows
// arrive in the grid's own order — sorting included — and are numbered as given.
function toRenewalLines(rows: Row[]): RenewalLine[] {
  return rows.map((row, index) => ({
    lineNumber: index + 1,
    itemId: row.itemId,
    isNetNew: row.kind === 'net-new',
    currentQuantity: row.currentQuantity,
    renewalQuantity: row.renewalQuantity,
  }));
}

function namedLines(lines: RenewalLine[]): string {
  return lines
    .map((line) => i18n.t('Renewal:Items:Conflict:Line', {
      number: line.lineNumber,
      itemId: line.itemId,
    }))
    .join(', ');
}

function keepRenewalActions(additions: RenewalLine[]): string {
  const increases = additions.filter((line) => !line.isNetNew);
  const netNew = additions.filter((line) => line.isNetNew);
  return [
    increases.length &&
      i18n.t('Renewal:Items:Conflict:Undo lines', { lines: namedLines(increases) }),
    netNew.length && i18n.t('Renewal:Items:Conflict:Remove lines', { lines: namedLines(netNew) }),
  ]
    .filter(Boolean)
    .join(' and ');
}

function ConflictNotice({ conflict }: { conflict: RenewAndAddConflict }) {
  return (
    <div className="items-step__conflict" data-testid="items-step-conflict">
      <InlineNotification status="error">
        <RegularText as="p" size={2}>
          {i18n.t('Renewal:Items:Conflict:Intro')}
        </RegularText>
        <ul>
          <li>
            {i18n.t('Renewal:Items:Conflict:Keep renewal', {
              actions: keepRenewalActions(conflict.additions),
            })}
          </li>
          <li>
            {i18n.t('Renewal:Items:Conflict:Keep additions', {
              actions: i18n.t('Renewal:Items:Conflict:Undo lines', {
                lines: namedLines(conflict.renewals),
              }),
            })}
          </li>
        </ul>
        <RegularText as="p" size={2}>
          {i18n.t('Renewal:Items:Conflict:Outro')}
        </RegularText>
        <a href={RENEWAL_LEARN_MORE_URL} target="_blank" rel="noreferrer">
          {i18n.t('Renewal:Items:Conflict:Learn more')}
        </a>
      </InlineNotification>
    </div>
  );
}

function buildColumns(handlers: RowHandlers): GridColumnDefinition<Row>[] {
  return [
    {
      name: 'item',
      title: i18n.t('Common:Item'),
      fields: ['itemName', 'itemId', 'sku'],
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
      fields: ['subscriptionName', 'subscriptionId'],
      cell: (row) =>
        row.kind === 'net-new' ? (
          <ChipCell label={i18n.t('Renewal:Items:New')} color="gray" />
        ) : (
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
      fields: ['terms', 'commitment'],
      initialWidth: 140,
      cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
    },
    {
      name: 'currentQuantity',
      title: i18n.t('Renewal:Grid:Current qty'),
      fields: ['currentQuantity'],
      initialWidth: 100,
      cell: (row) => <TextCell text={row.currentQuantity ?? EMPTY_VALUE} />,
    },
    {
      name: 'renewalQuantity',
      title: i18n.t('Renewal:Items:Renewal qty'),
      fields: ['renewalQuantity'],
      initialWidth: 110,
      isScalable: false,
      cell: (row) => (
        <TextInputCell
          value={row.renewalQuantity == null ? '' : String(row.renewalQuantity)}
          errorMessage={validateRenewalQuantity(row.renewalQuantity)}
          onChange={(value) => {
            if (!/^\d*$/.test(value)) return;
            handlers.onRowQuantityChange(row, value === '' ? null : Number(value));
          }}
        />
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
      cell: (row) => <TextCell text={pricedWhileValid(row, getMonthlyPrice) || EMPTY_VALUE} />,
    },
    {
      name: 'spxY',
      title: i18n.t('Renewal:Grid:SPxY'),
      fields: ['spxY'],
      initialWidth: 120,
      cell: (row) => <TextCell text={pricedWhileValid(row, getYearlyPrice) || EMPTY_VALUE} />,
    },
    {
      name: 'actions',
      title: i18n.t('Renewal:Grid:Actions'),
      initialWidth: 90,
      isScalable: false,
      cell: (row) =>
        row.kind === 'net-new' ? (
          <GridCellSimple>
            <Button
              type="text"
              onClick={() => handlers.onRemove(row)}
              testId={`remove-${row.id}`}
            >
              {i18n.t('Renewal:Items:Remove')}
            </Button>
          </GridCellSimple>
        ) : (
          <GridCellSimple>
            <Button
              type="text"
              isDisabled={row.renewalQuantity === row.defaultQuantity}
              onClick={() => handlers.onRowQuantityChange(row, row.defaultQuantity)}
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
  { name: 'itemName', title: i18n.t('Common:Item name') },
  { name: 'itemId', title: i18n.t('Common:Item ID') },
  { name: 'sku', title: i18n.t('Common:Vendor additional ID') },
  { name: 'subscriptionName', title: i18n.t('Common:Subscription name') },
  { name: 'subscriptionId', title: i18n.t('Common:Subscription ID') },
  { name: 'terms', title: i18n.t('Common:Terms title') },
  { name: 'commitment', title: i18n.t('Common:Commitment') },
  { name: 'currentQuantity', title: i18n.t('Renewal:Grid:Current qty'), type: 'number' },
  { name: 'renewalQuantity', title: i18n.t('Renewal:Items:Renewal qty'), type: 'number' },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

const sort: GridFieldSortOperation[] = [];

export function ItemsStep({
  agreement,
  subscriptions,
  selections,
  quantities,
  netNewItems,
  recommendedSkus,
  path,
  renewalStates,
  onQuantityChange,
  onNetNewItemsChange,
}: ItemsStepProps) {
  const { t } = useTranslation();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const listingId = agreement.listing?.id ?? '';
  const { registerOnNextCallback } = useStepActions();
  const { error: planError, status: planStatus, validatePlan, cancel, reset } = useRenewalPlanValidation(
    agreement.id,
  );
  const [quantityError, setQuantityError] = useState('');

  const rows = useMemo(
    () => [
      ...toSubscriptionRows(subscriptions, selections, quantities, renewalStates, path),
      ...toNetNewRows(netNewItems),
    ],
    [subscriptions, selections, quantities, netNewItems, renewalStates, path],
  );

  // Any plan edit invalidates the previous validation outcome.
  useEffect(() => {
    setQuantityError('');
    reset();
  }, [selections, quantities, netNewItems, reset]);

  const onRowQuantityChange = useCallback(
    (row: Row, quantity: number | null) => {
      if (row.kind === 'net-new') {
        onNetNewItemsChange(
          netNewItems.map((item) => (item.itemId === row.id ? { ...item, quantity } : item)),
        );
      } else {
        onQuantityChange(row.id, quantity);
      }
    },
    [netNewItems, onNetNewItemsChange, onQuantityChange],
  );

  const onRemove = useCallback(
    (row: Row) => {
      onNetNewItemsChange(netNewItems.filter((item) => item.itemId !== row.id));
    },
    [netNewItems, onNetNewItemsChange],
  );

  const onAdd = useCallback(
    (added: NetNewItem[]) => {
      const known = new Set(netNewItems.map((item) => item.itemId));
      onNetNewItemsChange([
        ...netNewItems,
        ...added.filter((item) => !known.has(item.itemId)),
      ]);
    },
    [netNewItems, onNetNewItemsChange],
  );

  const columns = useMemo(
    () => buildColumns({ onRowQuantityChange, onRemove }),
    [onRowQuantityChange, onRemove],
  );

  // The picker offers net-new products only: whatever the agreement already
  // holds (or the customer already added) stays out.
  const excludedSkus = useMemo(() => {
    const excluded = getHeldSkus(subscriptions);
    for (const item of netNewItems) {
      excluded.add(getPartialSku(item.sku));
    }
    return excluded;
  }, [subscriptions, netNewItems]);

  // The grid re-applies the paging config whenever its identity changes, so
  // an inline object would reset the page on every render and dead-lock the
  // pagination controls. Memoize it on the row count only.
  const paging = useMemo(
    () => ({ page: 1, pageSize: PAGE_SIZE, total: rows.length }),
    [rows.length],
  );

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-renewal__items--client',
    columns,
    fields,
    sort,
    paging,
  });

  const conflict = findRenewAndAddConflict(toRenewalLines(gridProps.data), path);

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      if (rows.some((row) => validateRenewalQuantity(row.renewalQuantity))) {
        setQuantityError(t('Renewal:Items:Validation:FixQuantities'));
        return currentStepIndex;
      }
      if (conflict) {
        return currentStepIndex;
      }
      setQuantityError('');
      const plan = buildRenewalPlanRequest(
        subscriptions,
        selections,
        quantities,
        netNewItems,
        path,
      );
      const isValid = await validatePlan(plan);
      return isValid ? targetStepIndex : currentStepIndex;
    },
    [rows, conflict, subscriptions, selections, quantities, netNewItems, path, validatePlan, t],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  return (
    <div className="items-step">
      <div className="items-step__header">
        <MediumText as="h2" size={4}>
          {t('Renewal:Steps:Items')}
        </MediumText>
      </div>
      <div className="items-step__highlights">
        <WizardHighlights agreement={agreement} />
      </div>
      <InlineNotification status="info">
        {t('Renewal:Items:Prompt')}
      </InlineNotification>
      {conflict && <ConflictNotice conflict={conflict} />}
      {(quantityError || planError) && (
        <div className="items-step__validation" data-testid="items-step-error">
          <InlineNotification status="error">
            {quantityError || planError}
          </InlineNotification>
        </div>
      )}
      <ProgressModal
        isOpen={planStatus === 'loading'}
        label={t('Common:Validating')}
        onCancel={cancel}
      />
      <div className="items-step__toolbar">
        <Button
          isDisabled={!listingId}
          onClick={() => setDialogOpen(true)}
          testId="add-items"
        >
          {t('Renewal:Items:Add items')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <NoDataCard
          title={t('Renewal:Items:Empty:Title')}
          description={t('Renewal:Items:Empty:Description')}
        />
      ) : (
        <>
          <div className="items-step__grid">
            <Grid {...gridProps} />
          </div>
          <RegularText as="p" size={1} color="grey-4" className="items-step__disclaimer">
            {t('Renewal:Grid:Price disclaimer')}
          </RegularText>
        </>
      )}
      <SelectItemsDialog
        isOpen={isDialogOpen}
        onClose={() => setDialogOpen(false)}
        agreementId={agreement.id}
        excludedSkus={excludedSkus}
        recommendedSkus={recommendedSkus}
        currency={agreement.price?.billingCurrency ?? ''}
        onAdd={(items) => {
          gridProps.onEvent?.({ type: 'SortChange', data: [] });
          onAdd(items);
        }}
      />
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
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
import { Select } from '@softwareone-platform/sdk-react-ui-v0/select';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { i18n } from '../../../i18n/translations';
import { ChipCell } from '../../shared/components/GridCell/ChipCell/ChipCell';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { LinkReference } from '../../shared/components/LinkReference/LinkReference';
import { NoDataCard } from '../../shared/components/NoDataCard/NoDataCard';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import {
  BILLING_MODEL_LABELS,
  TERM_COMMITMENT_LABELS,
  TERM_PERIOD_LABELS,
  WIZARD_GRID_PAGE_SIZE,
} from '../../shared/constants';
import { useAllDiscounts } from '../../shared/hooks/useAllDiscounts';
import type { Agreement, Discount, Subscription } from '../../shared/model';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { formatPrice, getMonthlyPrice, getYearlyPrice } from '../../utils/price';
import { getDiscountedUnitPrice } from '../../utils/discount';
import {
  appliesToRenewal,
  findDiscountByCode,
  getRenewalQuantity,
  isDiscountAvailable,
  isRenewing,
  normalizeDiscountCode,
  type DiscountSelections,
  type NetNewItem,
  type RenewalQuantities,
  type RenewalSelections,
} from '../model';

import './PromotionsStep.scss';

export interface PromotionsStepProps {
  agreement: Agreement;
  subscriptions: Subscription[];
  selections: RenewalSelections;
  quantities: RenewalQuantities;
  netNewItems: NetNewItem[];
  discountSelections: DiscountSelections;
  onDiscountChange: (rowId: string, code: string) => void;
}

interface Row {
  id: string;
  kind: 'subscription' | 'net-new';
  itemId: string;
  itemName: string;
  sku: string;
  subscriptionId: string;
  subscriptionName: string;
  billingModel: string;
  terms: string;
  commitment: string;
  quantity: number | null;
  unitSP: number | null;
  code: string;
  spxM: number | null;
  spxY: number | null;
}

function totalPrice(unitSP: number | null, quantity: number | null, months: number): number | null {
  return unitSP == null || !quantity ? null : (unitSP * quantity) / months;
}

/** The unit price the line renews at: discounted when its code carries a value. */
function renewalUnitPrice(
  unitSP: number | null,
  code: string,
  discounts: Discount[],
): number | null {
  if (!code || unitSP == null) return unitSP;
  const discount = findDiscountByCode(code, discounts);
  return discount ? (getDiscountedUnitPrice(unitSP, discount) ?? unitSP) : unitSP;
}

function toSubscriptionRows(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  discountSelections: DiscountSelections,
  discounts: Discount[],
): Row[] {
  return subscriptions
    .filter((subscription) => isRenewing(subscription, selections))
    .map((subscription) => {
      const line = subscription.lines?.[0];
      const code = discountSelections[subscription.id] ?? '';
      const quantity = getRenewalQuantity(subscription, quantities);
      const unitSP = renewalUnitPrice(line?.price?.unitSP ?? null, code, discounts);
      return {
        id: subscription.id,
        kind: 'subscription' as const,
        itemId: line?.item.id ?? '',
        itemName: line?.item.name ?? '',
        sku: line?.item.externalIds?.vendor ?? '',
        subscriptionId: subscription.id,
        subscriptionName: subscription.name ?? '',
        billingModel: BILLING_MODEL_LABELS[subscription.terms?.model ?? ''] ?? '—',
        terms: TERM_PERIOD_LABELS[subscription.terms?.period ?? ''] ?? '—',
        commitment: TERM_COMMITMENT_LABELS[subscription.terms?.commitment ?? ''] ?? '',
        quantity,
        unitSP: line?.price?.unitSP ?? null,
        code,
        spxM: totalPrice(unitSP, quantity, 12),
        spxY: totalPrice(unitSP, quantity, 1),
      };
    });
}

function toNetNewRows(
  netNewItems: NetNewItem[],
  discountSelections: DiscountSelections,
  discounts: Discount[],
): Row[] {
  return netNewItems.map((item) => {
    const code = discountSelections[item.itemId] ?? '';
    const unitSP = renewalUnitPrice(item.unitSP, code, discounts);
    return {
      id: item.itemId,
      kind: 'net-new' as const,
      itemId: item.itemId,
      itemName: item.itemName,
      sku: item.sku,
      subscriptionId: '',
      subscriptionName: '',
      billingModel: BILLING_MODEL_LABELS[item.terms?.model ?? ''] ?? '—',
      terms: TERM_PERIOD_LABELS[item.terms?.period ?? ''] ?? '—',
      commitment: TERM_COMMITMENT_LABELS[item.terms?.commitment ?? ''] ?? '',
      quantity: item.quantity,
      unitSP: item.unitSP,
      code,
      spxM: totalPrice(unitSP, item.quantity, 12),
      spxY: totalPrice(unitSP, item.quantity, 1),
    };
  });
}

/** The unit price the row renews at once its code is applied, when the code carries a value. */
function discountedUnitPrice(row: Row, discounts: Discount[]): number | null {
  if (!row.code || row.unitSP == null) return null;
  const discount = findDiscountByCode(row.code, discounts);
  return discount ? getDiscountedUnitPrice(row.unitSP, discount) : null;
}

interface CellContext {
  discounts: Discount[];
  options: { label: string; value: string; isDisabled?: boolean }[];
  onDiscountChange: (rowId: string, code: string) => void;
}

// The grid re-processes its columns whenever their array identity changes,
// which re-renders every cell and closes an open dropdown. The columns stay
// constant and the per-render values reach the cells through this context.
const CellContext = createContext<CellContext>({
  discounts: [],
  options: [],
  onDiscountChange: () => {},
});

interface PriceCellProps {
  row: Row;
  price: (unitSP: number | null, quantity: number) => string;
}

function PriceCell({ row, price }: PriceCellProps) {
  const { discounts } = useContext(CellContext);
  if (row.quantity == null) {
    return <TextCell text="—" />;
  }
  const listPrice = price(row.unitSP, row.quantity);
  const discountedUnit = discountedUnitPrice(row, discounts);
  if (discountedUnit == null) {
    return <TextCell text={listPrice || '—'} />;
  }
  return (
    <GridCellSimple>
      <div className="promotions-step__price">
        <RegularText as="p" size={2}>
          {price(discountedUnit, row.quantity)}
        </RegularText>
        <RegularText as="p" size={1} color="grey-4" className="promotions-step__price-struck">
          {listPrice}
        </RegularText>
      </div>
    </GridCellSimple>
  );
}

function DiscountCodeCell({ row }: { row: Row }) {
  const { options, onDiscountChange } = useContext(CellContext);
  return (
    <GridCellSimple>
      <Select
        value={row.code}
        options={options}
        cssPosition="fixed"
        placeholder={i18n.t('Renewal:Promotions:Select or type code')}
        onChange={(code: string) => onDiscountChange(row.id, code)}
        testId={`discount-code-${row.id}`}
      />
    </GridCellSimple>
  );
}

function UndoCell({ row }: { row: Row }) {
  const { onDiscountChange } = useContext(CellContext);
  return (
    <GridCellSimple>
      <Button
        type="text"
        isDisabled={!row.code}
        onClick={() => onDiscountChange(row.id, '')}
        testId={`undo-${row.id}`}
      >
        {i18n.t('Renewal:Grid:Undo')}
      </Button>
    </GridCellSimple>
  );
}

const columns: GridColumnDefinition<Row>[] = [
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
    name: 'billingModel',
    title: i18n.t('Renewal:Items:Billing model'),
    fields: ['billingModel'],
    initialWidth: 120,
    cell: (row) => <TextCell text={row.billingModel} />,
  },
  {
    name: 'subscription',
    title: i18n.t('Common:Subscription'),
    fields: ['subscriptionName'],
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
    fields: ['terms'],
    initialWidth: 140,
    cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
  },
  {
    name: 'discountCode',
    title: i18n.t('Renewal:Promotions:Discount code'),
    fields: ['code'],
    initialWidth: 220,
    isScalable: false,
    cell: (row) => <DiscountCodeCell row={row} />,
  },
  {
    name: 'unitSP',
    title: i18n.t('Renewal:Grid:Unit SP'),
    fields: ['unitSP'],
    initialWidth: 120,
    cell: (row) => (
      <TextCell
        text={row.unitSP != null ? formatPrice(row.unitSP) : '—'}
        secondaryContent={row.unitSP != null ? i18n.t('Renewal:Grid:Unit SP basis') : undefined}
      />
    ),
  },
  {
    name: 'spxM',
    title: i18n.t('Renewal:Grid:SPxM'),
    fields: ['spxM'],
    initialWidth: 120,
    cell: (row) => <PriceCell row={row} price={getMonthlyPrice} />,
  },
  {
    name: 'spxY',
    title: i18n.t('Renewal:Grid:SPxY'),
    fields: ['spxY'],
    initialWidth: 120,
    cell: (row) => <PriceCell row={row} price={getYearlyPrice} />,
  },
  {
    name: 'actions',
    title: i18n.t('Renewal:Grid:Actions'),
    initialWidth: 90,
    isScalable: false,
    cell: (row) => <UndoCell row={row} />,
  },
];

const fields: GridFieldDefinition[] = [
  { name: 'itemName', title: i18n.t('Common:Item') },
  { name: 'billingModel', title: i18n.t('Renewal:Items:Billing model') },
  { name: 'subscriptionName', title: i18n.t('Common:Subscription') },
  { name: 'terms', title: i18n.t('Common:Terms title') },
  { name: 'code', title: i18n.t('Renewal:Promotions:Discount code') },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

const sort: GridFieldSortOperation[] = [{ field: 'itemName', direction: 'asc' }];

export function PromotionsStep({
  agreement,
  subscriptions,
  selections,
  quantities,
  netNewItems,
  discountSelections,
  onDiscountChange,
}: PromotionsStepProps) {
  const { t } = useTranslation();
  const discounts = useAllDiscounts(agreement.id, 'RENEWAL');
  const { registerOnNextCallback } = useStepActions();

  // A code that cannot apply to a renewal is never offered on this step.
  const renewalDiscounts = useMemo(() => discounts.data.filter(appliesToRenewal), [discounts.data]);

  const rows = useMemo(
    () => [
      ...toSubscriptionRows(
        subscriptions,
        selections,
        quantities,
        discountSelections,
        renewalDiscounts,
      ),
      ...toNetNewRows(netNewItems, discountSelections, renewalDiscounts),
    ],
    [subscriptions, selections, quantities, netNewItems, discountSelections, renewalDiscounts],
  );

  const options = useMemo(
    () =>
      renewalDiscounts.map((discount) => ({
        label: isDiscountAvailable(discount)
          ? discount.code
          : t('Renewal:Promotions:Redeemed code', { code: discount.code }),
        value: normalizeDiscountCode(discount.code),
        isDisabled: !isDiscountAvailable(discount),
      })),
    [renewalDiscounts, t],
  );

  const cellContext = useMemo(
    () => ({ discounts: renewalDiscounts, options, onDiscountChange }),
    [renewalDiscounts, options, onDiscountChange],
  );

  const onNext = useCallback(
    async ({ targetStepIndex }: StepNavigationProperties) => targetStepIndex,
    [],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  // The grid re-applies the paging config whenever its identity changes, so
  // an inline object would reset the page on every render and dead-lock the
  // pagination controls. Memoize it on the row count only.
  const paging = useMemo(
    () => ({ page: 1, pageSize: WIZARD_GRID_PAGE_SIZE, total: rows.length }),
    [rows.length],
  );

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-renewal__promotions--client',
    columns,
    fields,
    sort,
    paging,
  });

  return (
    <CellContext.Provider value={cellContext}>
      <div className="promotions-step">
        <div className="promotions-step__header">
          <MediumText as="h2" size={4}>
            {t('Renewal:Steps:Promotions')}
          </MediumText>
        </div>
        <div className="promotions-step__highlights">
          <WizardHighlights agreement={agreement} />
        </div>
        <InlineNotification status="info" isStandalone>
          {t('Renewal:Promotions:Prompt')}
        </InlineNotification>
        {discounts.status === 'error' && (
          <div data-testid="promotions-step-error">
            <InlineNotification status="error" isStandalone>
              {discounts.error || t('Renewal:Promotions:Errors:Discounts could not be loaded')}
            </InlineNotification>
          </div>
        )}
        {rows.length === 0 ? (
          <NoDataCard
            title={t('Renewal:Promotions:Empty:Title')}
            description={t('Renewal:Promotions:Empty:Description')}
          />
        ) : (
          <>
            <div className="promotions-step__grid">
              <Grid {...gridProps} />
            </div>
            <RegularText as="p" size={1} color="grey-4" className="promotions-step__disclaimer">
              {t('Renewal:Grid:Price disclaimer')}
            </RegularText>
          </>
        )}
      </div>
    </CellContext.Provider>
  );
}

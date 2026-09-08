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
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { i18n } from '../../../i18n/translations';
import { ChipCell } from '../../shared/components/GridCell/ChipCell/ChipCell';
import { CodeCombobox } from '../../shared/components/CodeCombobox/CodeCombobox';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { LinkReference } from '../../shared/components/LinkReference/LinkReference';
import { NoDataCard } from '../../shared/components/NoDataCard/NoDataCard';
import { ProgressModal } from '../../shared/components/ProgressModal/ProgressModal';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import {
  BILLING_MODEL_LABELS,
  TERM_COMMITMENT_LABELS,
  TERM_PERIOD_LABELS,
  WIZARD_GRID_PAGE_SIZE,
} from '../../shared/constants';
import { useAllDiscounts } from '../../shared/hooks/useAllDiscounts';
import { useRenewalDiscountValidation } from '../../shared/hooks/useRenewalDiscountValidation';
import type {
  Agreement,
  Discount,
  InheritedDiscount,
  RenewalPreview,
  Subscription,
} from '../../shared/model';
import { toDiscountErrorMessage } from '../../utils/adobeError';
import { toRejectionMessage } from '../../utils/discountRejection';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { getPartialSku } from '../../utils/sku';
import { formatPrice, getMonthlyPrice, getYearlyPrice } from '../../utils/price';
import {
  appliesToOffer,
  appliesToRenewal,
  buildRenewalPlanRequest,
  getDiscountLabel,
  getRenewalQuantity,
  ineligibleInheritedCodes,
  inheritedCodesBySku,
  isDiscountAvailable,
  isRenewing,
  normalizeDiscountCode,
  type DiscountSelections,
  type NetNewItem,
  type RenewalPath,
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
  /** The reusables the customer already holds, auto-applied per renewing line. */
  inheritedDiscounts: InheritedDiscount[];
  /** The path picked on the first step; the early one gates Next on Adobe's preview. */
  path: RenewalPath;
  onDiscountChange: (rowId: string, code: string) => void;
  onPreview: (preview: RenewalPreview | null) => void;
}

interface Row {
  id: string;
  kind: 'subscription' | 'net-new';
  vendorId: string;
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
  isInherited: boolean;
  spxM: number | null;
  spxY: number | null;
}

function totalPrice(unitSP: number | null, quantity: number | null, months: number): number | null {
  return unitSP == null || !quantity ? null : (unitSP * quantity) / months;
}

function toSubscriptionRows(
  subscriptions: Subscription[],
  selections: RenewalSelections,
  quantities: RenewalQuantities,
  discountSelections: DiscountSelections,
  inheritedBySku: Map<string, string>,
): Row[] {
  return subscriptions
    .filter((subscription) => isRenewing(subscription, selections))
    .map((subscription) => {
      const line = subscription.lines?.[0];
      const sku = line?.item.externalIds?.vendor ?? '';
      const code = discountSelections[subscription.id] ?? '';
      const inheritedCode = inheritedBySku.get(getPartialSku(sku));
      const quantity = getRenewalQuantity(subscription, quantities);
      const unitSP = line?.price?.unitSP ?? null;
      return {
        id: subscription.id,
        kind: 'subscription' as const,
        vendorId: subscription.externalIds?.vendor ?? '',
        itemId: line?.item.id ?? '',
        itemName: line?.item.name ?? '',
        sku,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name ?? '',
        billingModel: BILLING_MODEL_LABELS[subscription.terms?.model ?? ''] ?? '—',
        terms: TERM_PERIOD_LABELS[subscription.terms?.period ?? ''] ?? '—',
        commitment: TERM_COMMITMENT_LABELS[subscription.terms?.commitment ?? ''] ?? '',
        quantity,
        unitSP: line?.price?.unitSP ?? null,
        code,
        isInherited: Boolean(inheritedCode) && normalizeDiscountCode(code) === inheritedCode,
        spxM: totalPrice(unitSP, quantity, 12),
        spxY: totalPrice(unitSP, quantity, 1),
      };
    });
}

function toNetNewRows(netNewItems: NetNewItem[], discountSelections: DiscountSelections): Row[] {
  return netNewItems.map((item) => {
    const code = discountSelections[item.itemId] ?? '';
    const unitSP = item.unitSP;
    return {
      id: item.itemId,
      kind: 'net-new' as const,
      vendorId: item.sku,
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
      isInherited: false,
      spxM: totalPrice(unitSP, item.quantity, 12),
      spxY: totalPrice(unitSP, item.quantity, 1),
    };
  });
}

interface DiscountOption {
  label: string;
  value: string;
  isDisabled?: boolean;
}

interface CellContext {
  discounts: Discount[];
  getOptions: (vendorExternalId: string) => DiscountOption[];
  onDiscountChange: (rowId: string, code: string) => void;
}

// The grid re-processes its columns whenever their array identity changes,
// which re-renders every cell and closes an open dropdown. The columns stay
// constant and the per-render values reach the cells through this context.
const CellContext = createContext<CellContext>({
  discounts: [],
  getOptions: () => [],
  onDiscountChange: () => {},
});

interface PriceCellProps {
  row: Row;
  price: (unitSP: number | null, quantity: number) => string;
}

function PriceCell({ row, price }: PriceCellProps) {
  if (row.quantity == null) {
    return <TextCell text="—" />;
  }
  return <TextCell text={price(row.unitSP, row.quantity) || '—'} />;
}

function DiscountCodeCell({ row }: { row: Row }) {
  const { getOptions, onDiscountChange } = useContext(CellContext);
  return (
    <GridCellSimple>
      <CodeCombobox
        value={row.code}
        options={getOptions(row.sku)}
        placeholder={i18n.t('Renewal:Promotions:Select or type code')}
        onChange={(code: string) => onDiscountChange(row.id, code)}
        testId={`discount-code-${row.id}`}
      />
      {row.isInherited && (
        <span data-testid={`inherited-${row.id}`}>
          <RegularText as="span" size={1} color="grey-4">
            {i18n.t('Renewal:Promotions:Inherited')}
          </RegularText>
        </span>
      )}
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
    name: 'billingModel',
    title: i18n.t('Renewal:Items:Billing model'),
    fields: ['billingModel'],
    initialWidth: 100,
    cell: (row) => <TextCell text={row.billingModel} />,
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
    initialWidth: 120,
    cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
  },
  {
    name: 'discountCode',
    title: i18n.t('Renewal:Promotions:Discount code'),
    fields: ['code'],
    initialWidth: 180,
    isScalable: false,
    cell: (row) => <DiscountCodeCell row={row} />,
  },
  {
    name: 'unitSP',
    title: i18n.t('Renewal:Grid:Unit SP'),
    fields: ['unitSP'],
    initialWidth: 110,
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
    initialWidth: 100,
    cell: (row) => <PriceCell row={row} price={getMonthlyPrice} />,
  },
  {
    name: 'spxY',
    title: i18n.t('Renewal:Grid:SPxY'),
    fields: ['spxY'],
    initialWidth: 100,
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
  { name: 'itemName', title: i18n.t('Common:Item name') },
  { name: 'itemId', title: i18n.t('Common:Item ID') },
  { name: 'sku', title: i18n.t('Common:Vendor additional ID') },
  { name: 'billingModel', title: i18n.t('Renewal:Items:Billing model') },
  { name: 'subscriptionName', title: i18n.t('Common:Subscription name') },
  { name: 'subscriptionId', title: i18n.t('Common:Subscription ID') },
  { name: 'terms', title: i18n.t('Common:Terms title') },
  { name: 'commitment', title: i18n.t('Common:Commitment') },
  { name: 'code', title: i18n.t('Renewal:Promotions:Discount code') },
  { name: 'unitSP', title: i18n.t('Renewal:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('Renewal:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('Renewal:Grid:SPxY'), type: 'number' },
];

const sort: GridFieldSortOperation[] = [];

export function PromotionsStep({
  agreement,
  subscriptions,
  selections,
  quantities,
  netNewItems,
  discountSelections,
  inheritedDiscounts,
  path,
  onDiscountChange,
  onPreview,
}: PromotionsStepProps) {
  const { t } = useTranslation();
  const discounts = useAllDiscounts(agreement.id, 'RENEWAL');
  const { registerOnNextCallback } = useStepActions();
  const {
    error: discountValidationError,
    rejectedFields,
    status: discountValidationStatus,
    validateDiscounts,
    cancel: cancelDiscountValidation,
    reset: resetDiscountValidation,
  } = useRenewalDiscountValidation(agreement.id, onPreview);

  // A code that cannot apply to a renewal is never offered on this step.
  const renewalDiscounts = useMemo(() => discounts.data.filter(appliesToRenewal), [discounts.data]);

  const inheritedBySku = useMemo(
    () => inheritedCodesBySku(inheritedDiscounts),
    [inheritedDiscounts],
  );
  const ineligibleInherited = useMemo(
    () => ineligibleInheritedCodes(inheritedDiscounts),
    [inheritedDiscounts],
  );

  const rows = useMemo(
    () => [
      ...toSubscriptionRows(subscriptions, selections, quantities, discountSelections, inheritedBySku),
      ...toNetNewRows(netNewItems, discountSelections),
    ],
    [subscriptions, selections, quantities, netNewItems, discountSelections, inheritedBySku],
  );

  const getOptions = useMemo(() => {
    const byOffer = new Map<string, DiscountOption[]>();
    return (vendorExternalId: string) => {
      const cached = byOffer.get(vendorExternalId);
      if (cached) return cached;
      const options = renewalDiscounts
        .filter((discount) => appliesToOffer(discount, vendorExternalId))
        .map((discount) => ({
          label: isDiscountAvailable(discount)
            ? getDiscountLabel(discount)
            : t('Renewal:Promotions:Redeemed code', { code: getDiscountLabel(discount) }),
          value: normalizeDiscountCode(discount.code),
          isDisabled: !isDiscountAvailable(discount),
        }))
        .sort((left, right) => left.value.localeCompare(right.value));
      byOffer.set(vendorExternalId, options);
      return options;
    };
  }, [renewalDiscounts, t]);

  const cellContext = useMemo(
    () => ({ discounts: renewalDiscounts, getOptions, onDiscountChange }),
    [renewalDiscounts, getOptions, onDiscountChange],
  );

  const unknownCode = useMemo(() => {
    const known = new Set(renewalDiscounts.map((discount) => normalizeDiscountCode(discount.code)));
    return Object.values(discountSelections).find((code) => code && !known.has(code)) ?? '';
  }, [discountSelections, renewalDiscounts]);

  const validationMessage = toDiscountErrorMessage(discountValidationError, unknownCode);

  const rejectionMessages = useMemo(
    () =>
      (rejectedFields ?? []).map((rejection) => {
        const row = rejection.pointer
          ? rows.find(
              (candidate) =>
                candidate.vendorId === rejection.pointer || candidate.id === rejection.pointer,
            )
          : undefined;
        return toRejectionMessage(rejection, row?.itemName ?? '', row?.code ?? '');
      }),
    [rejectedFields, rows],
  );

  // Any discount edit invalidates the previous validation outcome.
  useEffect(() => {
    resetDiscountValidation();
  }, [discountSelections, resetDiscountValidation]);

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const plan = buildRenewalPlanRequest(
        subscriptions,
        selections,
        quantities,
        netNewItems,
        path,
        discountSelections,
      );
      const isValid = await validateDiscounts(plan);
      return isValid ? targetStepIndex : currentStepIndex;
    },
    [
      subscriptions,
      selections,
      quantities,
      netNewItems,
      path,
      discountSelections,
      validateDiscounts,
    ],
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
        <InlineNotification status="info">
          {t('Renewal:Promotions:Prompt')}
        </InlineNotification>
        {discounts.status === 'error' && (
          <div data-testid="promotions-step-error">
            <InlineNotification status="error">
              {discounts.error || t('Renewal:Promotions:Errors:Discounts could not be loaded')}
            </InlineNotification>
          </div>
        )}
        {ineligibleInherited.length > 0 && (
          <div data-testid="promotions-step-ineligible-inherited">
            <InlineNotification status="warning">
              {t('Renewal:Promotions:Ineligible inherited', {
                codes: ineligibleInherited.map((discount) => discount.code).join(', '),
              })}
            </InlineNotification>
          </div>
        )}
        {path === 'anniversary' && unknownCode && (
          <div
            className="promotions-step__validation"
            data-testid="promotions-step-unknown-code"
          >
            <InlineNotification status="neutral">
              {t('Renewal:Promotions:Unknown code', { code: unknownCode })}
            </InlineNotification>
          </div>
        )}
        {rejectionMessages.length > 0 && (
          <div
            className="promotions-step__validation"
            data-testid="promotions-step-rejected-codes"
          >
            <InlineNotification status="error">
              {t('Renewal:Promotions:Rejected:Title')}
              <ul>
                {rejectionMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </InlineNotification>
          </div>
        )}
        {rejectionMessages.length === 0 && discountValidationError && (
          <div
            className="promotions-step__validation"
            data-testid="promotions-step-validation-error"
          >
            <InlineNotification status={validationMessage === discountValidationError ? 'error' : 'neutral'}>
              {validationMessage}
            </InlineNotification>
          </div>
        )}
        <ProgressModal
          isOpen={discountValidationStatus === 'loading'}
          label={t('Common:Validating')}
          onCancel={cancelDiscountValidation}
        />
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

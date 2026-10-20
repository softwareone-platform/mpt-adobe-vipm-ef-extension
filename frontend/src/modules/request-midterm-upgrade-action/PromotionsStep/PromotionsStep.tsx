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
import type { CodeComboboxOption } from '../../shared/components/CodeCombobox/CodeCombobox';
import { TextCell } from '../../shared/components/GridCell/TextCell/TextCell';
import { LinkReference } from '../../shared/components/LinkReference/LinkReference';
import { NoDataCard } from '../../shared/components/NoDataCard/NoDataCard';
import { ProgressModal } from '../../shared/components/ProgressModal/ProgressModal';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { useSwitchDiscountValidation } from '../../shared/hooks/useSwitchDiscountValidation';
import type { Discount, DiscountsPage, Subscription, SwitchPreview } from '../../shared/model';
import { toDiscountErrorMessage } from '../../utils/adobeError';
import { getDiscountLabel, isDiscountAvailable, normalizeDiscountCode } from '../../utils/discount';
import { toRejectionMessage } from '../../utils/discountRejection';
import { getItemLink, getSubscriptionLink } from '../../utils/link';
import { formatQuantityDelta } from '../../utils/quantity';
import { findDiscount, getLocalUnitPrice, withDiscount } from '../discountPricing';
import type { TargetSubscription } from '../model';

import './PromotionsStep.scss';

export interface PromotionsStepProps {
  subscription: Subscription;
  /** The target line selected on the Upgrade to step, with its switched quantity. */
  target: TargetSubscription | null;
  /** The shortlist of codes a SWITCH to the target offer can apply. */
  discounts: DiscountsPage;
  /** The code applied to the target line; '' when cleared, null until pre-selected. */
  discountCode: string | null;
  recommendationTrackerId: string;
  onDiscountChange: (code: string) => void;
  onPreview: (preview: SwitchPreview | null) => void;
}

type Row = TargetSubscription & { rowId: string };

interface CellContext {
  options: CodeComboboxOption[];
  onDiscountChange: (code: string) => void;
}

// The grid re-processes its columns whenever their array identity changes,
// which re-renders every cell and closes an open dropdown. The columns stay
// constant and the per-render values reach the cells through this context.
const CellContext = createContext<CellContext>({
  options: [],
  onDiscountChange: () => {},
});

function DiscountCodeCell({ row }: { row: Row }) {
  const { options, onDiscountChange } = useContext(CellContext);
  return (
    <GridCellSimple>
      <CodeCombobox
        value={row.discountCode ?? ''}
        options={options}
        placeholder={i18n.t('Renewal:Promotions:Select or type code')}
        onChange={onDiscountChange}
        testId="discount-code-target"
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
        isDisabled={!row.discountCode}
        onClick={() => onDiscountChange('')}
        testId="undo-target"
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
    fields: ['item.name', 'item.id', 'item.externalId'],
    cell: (row) => (
      <GridCellSimple>
        <LinkReference
          text={row.item.name}
          secondaryContent={[row.item.id, row.targetBaseOfferId].filter(Boolean).join(' | ')}
          url={getItemLink(row.item.id || undefined)}
          icon={null}
        />
      </GridCellSimple>
    ),
  },
  {
    name: 'subscription',
    title: i18n.t('Common:Subscription'),
    fields: ['name', 'id'],
    cell: (row) =>
      row.id ? (
        <GridCellSimple>
          <LinkReference
            text={row.name ?? ''}
            secondaryContent={row.id}
            url={getSubscriptionLink(row.id)}
            icon={null}
          />
        </GridCellSimple>
      ) : (
        <ChipCell label={i18n.t('MidtermUpgrade:Grid:New')} color="gray" />
      ),
  },
  {
    name: 'terms',
    title: i18n.t('MidtermUpgrade:Grid:Terms'),
    fields: ['terms', 'commitment'],
    initialWidth: 120,
    cell: (row) => <TextCell text={row.terms} secondaryContent={row.commitment} />,
  },
  {
    name: 'delta',
    title: i18n.t('MidtermUpgrade:Grid:Qty'),
    fields: ['delta'],
    initialWidth: 90,
    cell: (row) => (
      <TextCell text={formatQuantityDelta(row.delta)} secondaryContent={row.newQuantity} />
    ),
  },
  {
    name: 'discountCode',
    title: i18n.t('MidtermUpgrade:Grid:Discount code'),
    fields: ['discountCode'],
    initialWidth: 180,
    isScalable: false,
    cell: (row) => <DiscountCodeCell row={row} />,
  },
  {
    name: 'unitSP',
    title: i18n.t('MidtermUpgrade:Grid:Unit SP'),
    fields: ['unitSP'],
    initialWidth: 110,
    cell: (row) => (
      <TextCell
        text={row.unitSP || '—'}
        secondaryContent={i18n.t('MidtermUpgrade:Grid:user/year')}
      />
    ),
  },
  {
    name: 'spxM',
    title: i18n.t('MidtermUpgrade:Grid:SPxM'),
    fields: ['spxM'],
    initialWidth: 100,
    cell: (row) => <TextCell text={row.spxM || '—'} />,
  },
  {
    name: 'spxY',
    title: i18n.t('MidtermUpgrade:Grid:SPxY'),
    fields: ['spxY'],
    initialWidth: 100,
    cell: (row) => <TextCell text={row.spxY || '—'} />,
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
  { name: 'item.name', title: i18n.t('Common:Item name') },
  { name: 'item.id', title: i18n.t('Common:Item ID') },
  { name: 'item.externalId', title: i18n.t('Common:Vendor additional ID') },
  { name: 'name', title: i18n.t('Common:Subscription name') },
  { name: 'id', title: i18n.t('Common:Subscription ID') },
  { name: 'terms', title: i18n.t('MidtermUpgrade:Grid:Terms') },
  { name: 'commitment', title: i18n.t('Common:Commitment') },
  { name: 'delta', title: i18n.t('MidtermUpgrade:Grid:Qty') },
  { name: 'discountCode', title: i18n.t('MidtermUpgrade:Grid:Discount code') },
  { name: 'unitSP', title: i18n.t('MidtermUpgrade:Grid:Unit SP') },
  { name: 'spxM', title: i18n.t('MidtermUpgrade:Grid:SPxM') },
  { name: 'spxY', title: i18n.t('MidtermUpgrade:Grid:SPxY') },
];

const sort: GridFieldSortOperation[] = [];

function toOption(discount: Discount): CodeComboboxOption {
  const isAvailable = isDiscountAvailable(discount);
  return {
    label: isAvailable
      ? getDiscountLabel(discount)
      : i18n.t('Renewal:Promotions:Redeemed code', { code: getDiscountLabel(discount) }),
    value: normalizeDiscountCode(discount.code),
    isDisabled: !isAvailable,
  };
}

/**
 * The mid-term upgrade's Promotions step: the discount code for the target line.
 *
 * Renders the single target line picked on the Upgrade to step, with its
 * switched quantity display-only, and lets the customer pick a code from the
 * shortlist, type one it was given or clear it. The row is re-priced live from
 * the code's Discount Values. Next quotes the selection through Adobe's
 * ``PREVIEW_SWITCH`` and stays on the step when Adobe refuses the code.
 */
export function PromotionsStep({
  subscription,
  target,
  discounts,
  discountCode,
  recommendationTrackerId,
  onDiscountChange,
  onPreview,
}: PromotionsStepProps) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();
  const {
    error: discountValidationError,
    rejectedFields,
    status: discountValidationStatus,
    validateDiscount,
    cancel: cancelDiscountValidation,
    reset: resetDiscountValidation,
  } = useSwitchDiscountValidation(
    subscription.agreement?.id ?? '',
    subscription.id,
    onPreview,
  );

  const code = normalizeDiscountCode(discountCode ?? '');
  const selectedDiscount = findDiscount(discounts.data, code);

  const rows = useMemo<Row[]>(() => {
    if (!target) return [];
    const priced = withDiscount(target, getLocalUnitPrice(target, selectedDiscount), code);
    return [{ ...priced, rowId: target.targetBaseOfferId ?? target.item.id }];
  }, [target, selectedDiscount, code]);

  const options = useMemo(
    () =>
      discounts.data
        .map(toOption)
        .sort((left, right) => left.value.localeCompare(right.value)),
    [discounts.data],
  );

  const cellContext = useMemo(() => ({ options, onDiscountChange }), [options, onDiscountChange]);

  const unknownCode = code && !selectedDiscount ? code : '';
  const validationMessage = toDiscountErrorMessage(discountValidationError, unknownCode);

  const rejectionMessages = useMemo(
    () =>
      (rejectedFields ?? []).map((rejection) =>
        toRejectionMessage(rejection, target?.item.name ?? '', code),
      ),
    [rejectedFields, target, code],
  );

  // Any discount edit invalidates the previous validation outcome and quote.
  useEffect(() => {
    resetDiscountValidation();
  }, [code, resetDiscountValidation]);

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      if (!target) {
        return targetStepIndex;
      }
      const isValid = await validateDiscount({
        targetOfferId: target.targetBaseOfferId ?? '',
        quantity: target.delta,
        recommendationTrackerId,
        flexDiscountCodes: code ? [code] : [],
      });
      return isValid ? targetStepIndex : currentStepIndex;
    },
    [target, recommendationTrackerId, code, validateDiscount],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  const paging = useMemo(() => ({ page: 1, pageSize: 1, total: rows.length }), [rows.length]);

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-midterm-upgrade__promotions--client',
    columns,
    fields,
    sort,
    paging,
    isToHideFooter: true,
  });

  return (
    <CellContext.Provider value={cellContext}>
      <div className="midterm-promotions-step" data-testid="midterm-promotions-step">
        <div className="midterm-promotions-step__header">
          <MediumText as="h2" size={4}>
            {t('MidtermUpgrade:Steps:Promotions')}
          </MediumText>
        </div>
        <div className="midterm-promotions-step__highlights">
          <WizardHighlights agreement={subscription.agreement} parties={subscription} />
        </div>
        <InlineNotification status="info">{t('MidtermUpgrade:Promotions:Prompt')}</InlineNotification>
        {discounts.status === 'error' && (
          <div data-testid="promotions-step-error">
            <InlineNotification status="error">
              {discounts.error || t('Renewal:Promotions:Errors:Discounts could not be loaded')}
            </InlineNotification>
          </div>
        )}
        {unknownCode && (
          <div data-testid="promotions-step-unknown-code">
            <InlineNotification status="neutral">
              {t('Renewal:Promotions:Unknown code', { code: unknownCode })}
            </InlineNotification>
          </div>
        )}
        {rejectionMessages.length > 0 && (
          <div data-testid="promotions-step-rejected-codes">
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
          <div data-testid="promotions-step-validation-error">
            <InlineNotification
              status={validationMessage === discountValidationError ? 'error' : 'neutral'}
            >
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
            title={t('MidtermUpgrade:Promotions:Empty:Title')}
            description={t('MidtermUpgrade:Promotions:Empty:Description')}
          />
        ) : (
          <>
            <div className="midterm-promotions-step__grid">
              <Grid {...gridProps} />
            </div>
            <RegularText as="p" size={1} color="grey-4">
              {t('MidtermUpgrade:UpgradeTo:PriceDisclaimer')}
            </RegularText>
          </>
        )}
      </div>
    </CellContext.Provider>
  );
}

import { useMPTContext, useMPTModal } from "@mpt-extension/sdk-react";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { Chip, ChipColor } from "@softwareone-platform/sdk-react-ui-v0/chip";
import type { ListOption } from '@softwareone-platform/sdk-react-ui-v0/dropdown';
import {
  Grid,
  GridCellActions,
  GridCellSimple,
  GridColumnDefinition,
  GridFieldDefinition,
  useGridInMemory,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../../i18n/translations';
import { useAgreementId } from '../../shared/hooks/useAgreementId';
import { useAllDiscounts } from '../../shared/hooks/useAllDiscounts';
import { useSettings } from "../../shared/hooks/useSettings";
import {
  canEditDiscountCode,
  canManageDiscountCodes,
} from '../../utils/security';

import { TextCell } from './components/grid-cell/text-cell/TextCell';
import { formatDate, formatOrderTypes, formatSource, formatValue } from './format';

import type { Discount } from '../../shared/model';
import type { AccountType } from '../../shared/three-year-commitment';

import { EM_DASH } from "../../utils/date";
import "./index.scss";

const DEFAULT_PAGE_SIZE = 10;

type DiscountAction = 'edit';
/** Shared by the create and the future edit flow; the mode rides on the context. */
const DISCOUNT_WIZARD_PLUG_ID = "request-discount-action";

const STATUS_CHIP_COLORS: Record<string, ChipColor> = {
  ACTIVE: "success",
  EXPIRED: "danger",
};

const DISCOUNT_ACTIONS: ListOption<DiscountAction>[] = [
  {
    value: 'edit',
    label: i18n.t('Agreement:Discounts:Edit'),
  },
];

type ExcludableGridField = GridFieldDefinition & { isExcluded?: boolean };

function getFilteredGridFields(fields: ExcludableGridField[]): GridFieldDefinition[] {
  return fields
    .filter((field) => !field.isExcluded)
    .map(({ isExcluded, ...field }) => {
      void isExcluded;
      return field;
    });
}

function useGridFields(role: AccountType | undefined): GridFieldDefinition[] {
  const { t } = useTranslation();

  return useMemo(
    () =>
      getFilteredGridFields([
        {
          name: 'code',
          title: t('Agreement:Discounts:Code'),
          type: 'text',
          allowedOperations: ['Filter', 'Sort'],
        },
        {
          name: 'source',
          title: t('Agreement:Discounts:Source'),
          type: 'list',
          allowedOperations: ['Filter', 'Sort'],
          options: [
            { value: 'OPEN', label: t('Agreement:Discounts:SourceOpen') },
            { value: 'CLOSED', label: t('Agreement:Discounts:SourceClosed') },
          ],
        },
        {
          name: 'discountType',
          title: t('Agreement:Discounts:Type'),
          type: 'list',
          allowedOperations: ['Filter', 'Sort'],
          options: [
            { value: 'PERCENTAGE', label: t('Agreement:Discounts:Types:PERCENTAGE') },
            { value: 'FIXED_DISCOUNT', label: t('Agreement:Discounts:Types:FIXED_DISCOUNT') },
            { value: 'FIXED_PRICE', label: t('Agreement:Discounts:Types:FIXED_PRICE') },
          ],
        },
        {
          name: 'status',
          title: t('Common:Status'),
          type: 'list',
          allowedOperations: ['Filter', 'Sort'],
          options: [
            { value: 'ACTIVE', label: t('Agreement:Discounts:Status:ACTIVE') },
            { value: 'EXPIRED', label: t('Agreement:Discounts:Status:EXPIRED') },
          ],
        },
        {
          name: 'applicableOrderTypes',
          title: t('Agreement:Discounts:Order types'),
          type: 'list',
          allowedOperations: ['Filter'],
          options: [
            { value: 'NEW', label: t('Agreement:Discounts:OrderTypes:NEW') },
            { value: 'RENEWAL', label: t('Agreement:Discounts:OrderTypes:RENEWAL') },
            { value: 'SWITCH', label: t('Agreement:Discounts:OrderTypes:SWITCH') },
          ],
        },
        {
          name: 'startDate',
          title: t('Agreement:Discounts:Valid'),
          type: 'date',
          allowedOperations: ['Filter', 'Sort'],
        },
        {
          name: 'redeemedAt',
          title: t('Agreement:Discounts:Redeemed'),
          type: 'date',
          allowedOperations: ['Filter', 'Sort'],
        },
        {
          name: 'updatedAt',
          title: t('Common:Updated'),
          type: 'date',
          allowedOperations: ['Filter', 'Sort'],
          isExcluded: role !== 'Operations' && role !== 'Vendor',
        },
      ]),
    [t, role],
  );
}

const BASE_COLUMNS: GridColumnDefinition<Discount>[] = [
  {
    name: "code",
    title: i18n.t("Agreement:Discounts:Code"),
    fields: ["code"],
    initialWidth: 250,
    isPinned: false,
    cell: (item) => (
      <GridCellSimple>
        <div className="discounts__cell">
          <div className="discounts__code-line">
            <RegularText as="p" size={2}>
              {item.code}
            </RegularText>
            {item.status && (
              <Chip
                label={i18n.t(`Agreement:Discounts:Status:${item.status}`, {
                  defaultValue: item.status,
                })}
                color={STATUS_CHIP_COLORS[item.status] ?? "gray"}
              />
            )}
          </div>
          {item.name && (
            <RegularText as="p" size={1} color="grey-4">
              {item.name}
            </RegularText>
          )}
        </div>
      </GridCellSimple>
    ),
  },
  {
    name: "source",
    title: i18n.t("Agreement:Discounts:Source"),
    fields: ["source"],
    initialWidth: 110,
    cell: (item) => <TextCell text={formatSource(item.source)} />,
  },
  {
    name: "type",
    title: i18n.t("Agreement:Discounts:Type"),
    fields: ["discountType"],
    initialWidth: 130,
    cell: (item) => (
      <TextCell
        text={
          item.discountType
            ? i18n.t(`Agreement:Discounts:Types:${item.discountType}`, {
                defaultValue: item.discountType,
              })
            : EM_DASH
        }
      />
    ),
  },
  {
    name: "value",
    title: i18n.t("Agreement:Discounts:Value"),
    fields: ["values"],
    initialWidth: 110,
    cell: (item) => <TextCell text={formatValue(item)} />,
  },
  {
    name: "valid",
    title: i18n.t("Agreement:Discounts:Valid"),
    fields: ["startDate"],
    cell: (item) => (
      <TextCell
        text={`${formatDate(item.startDate)} - ${formatDate(item.endDate)}`}
        secondaryContent={
          item.discountLockEndDate
            ? i18n.t("Agreement:Discounts:Discount lock until", {
                date: formatDate(item.discountLockEndDate),
              })
            : undefined
        }
      />
    ),
  },
  {
    name: "orderTypes",
    title: i18n.t("Agreement:Discounts:Order types"),
    fields: ["applicableOrderTypes"],
    cell: (item) => (
      <TextCell text={formatOrderTypes(item.applicableOrderTypes)} />
    ),
  },
  {
    name: "redeemed",
    title: i18n.t("Agreement:Discounts:Redeemed"),
    fields: ["redeemedAt"],
    initialWidth: 120,
    cell: (item) => (
      <TextCell
        text={item.redeemedAt ? formatDate(item.redeemedAt) : EM_DASH}
      />
    ),
  },
];

export function Discounts() {
  const { t } = useTranslation();
  const { open } = useMPTModal();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const accountType = context.auth?.account?.type;
  const agreementId = useAgreementId();
  // The grid lists every code for the agreement, filter/sort/search are resolved client-side by useGridInMemory.
  const discounts = useAllDiscounts(agreementId);
  const fields = useGridFields(accountType);

  const canAddClosedDiscount = canManageDiscountCodes(
    context.auth?.account?.type,
    settings?.products,
    context.data?.agreement?.product?.id,
  );

  // The wizard calls `close({ created }|{ updated })` on submit and
  // `close(undefined)` on cancel/click-outside; only refresh on the former.
  const onWizardClose = useCallback(
    (payload?: { created?: Discount; updated?: Discount }) => {
      if (payload?.created || payload?.updated) {
        discounts.refresh();
      }
    },
    [discounts],
  );

  const onAddClosedDiscount = useCallback(() => {
    open(DISCOUNT_WIZARD_PLUG_ID, {
      context: {
        ...context,
        data: { ...context.data, discount: { mode: "create" } },
      },
      onClose: onWizardClose,
    });
  }, [open, context, onWizardClose]);

  const onEditDiscount = useCallback(
    (item: Discount) => {
      open(DISCOUNT_WIZARD_PLUG_ID, {
        context: {
          ...context,
          data: { ...context.data, discount: { mode: "edit", id: item.id } },
        },
        onClose: onWizardClose,
      });
    },
    [open, context, onWizardClose],
  );

  const onDiscountAction = useCallback(
    (action: string, item: Discount) => {
      if (action === "edit") {
        onEditDiscount(item);
      }
    },
    [onEditDiscount],
  );

  const columns = useMemo<GridColumnDefinition<Discount>[]>(
    () => [
      ...BASE_COLUMNS,
      ...(canAddClosedDiscount
        ? [
            {
              name: 'actions',
              title: i18n.t('Agreement:Discounts:Actions'),
              fields: ['id'],
              initialWidth: 80,
              cell: (item: Discount) =>
                canEditDiscountCode(accountType, item.source) ? (
                  <GridCellActions
                    item={item}
                    actions={DISCOUNT_ACTIONS}
                    onAction={onDiscountAction}
                    testId={`discounts-action-${item.id}`}
                  />
                ) : null,
            } as GridColumnDefinition<Discount>,
          ]
        : []),
    ],
    [canAddClosedDiscount, accountType, onDiscountAction],
  );

  const gridConfig = useMemo(
    () => ({
      id: "modules__agreement__discounts--client",
      columns,
      fields,
      paging: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: discounts.data.length,
      },
    }),
    [columns, fields, discounts.data.length],
  );

  const gridProps = useGridInMemory<Discount>(
    discounts.data,
    gridConfig,
    discounts.refresh,
  );

  return (
    <div className="discounts">
      <header className="extension__content-header">
        <MediumText as="h2" size={4} className="extension__content-title">
          {t("Agreement:Discounts:Title")}
        </MediumText>

        <RegularText
          as="p"
          size={2}
          color="grey-5"
          className="extension__content-description"
        >
          {t("Agreement:Discounts:Description")}
        </RegularText>
      </header>

      {/*
        Grid lifts a direct <Grid.Actions> child into its toolbar row, so the
        button lands to the right of Default view / Sort / Filter / Columns /
        Refresh instead of above the grid.
      */}
      <Grid {...gridProps} containerClassName="discounts__grid">
        {canAddClosedDiscount && (
          <Grid.Actions>
            <Button
              type="secondary"
              className="discounts__add-action"
              onClick={onAddClosedDiscount}
            >
              {t("Agreement:Discounts:AddDiscount")}
            </Button>
          </Grid.Actions>
        )}
      </Grid>
    </div>
  );
}

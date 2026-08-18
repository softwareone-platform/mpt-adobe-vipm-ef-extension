import { useMPTContext, useMPTModal } from "@mpt-extension/sdk-react";
import { Button } from "@softwareone-platform/sdk-react-ui-v0/button";
import { Chip, ChipColor } from "@softwareone-platform/sdk-react-ui-v0/chip";
import type { ListOption } from '@softwareone-platform/sdk-react-ui-v0/dropdown';
import {
  Grid,
  GridCellActions,
  GridCellSimple,
  GridColumnDefinition,
  GridDefaultConfiguration,
  useGridAsync,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../../i18n/translations';
import { useAgreementId } from '../../shared/hooks/useAgreementId';
import { useDiscounts } from '../../shared/hooks/useDiscounts';
import { useSettings } from "../../shared/hooks/useSettings";
import { canEditDiscountCode, canManageDiscountCodes } from '../../utils/security';

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

const BASE_COLUMNS: GridColumnDefinition<Discount>[] = [
  {
    name: "code",
    title: i18n.t("Agreement:Discounts:Code"),
    fields: ["code"],
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
  const [paging, setPaging] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const discounts = useDiscounts(agreementId, paging.page, paging.pageSize);

  const canAddClosedDiscount = canManageDiscountCodes(
    context.auth?.account?.type,
    settings?.products,
    context.data?.agreement?.product?.id,
  );

  // The wizard is a modal plug. `discount.mode` rides on the modal context so
  // the same plug can host the future edit flow; the plug defaults to create
  // when it is absent.
  const onAddClosedDiscount = useCallback(() => {
    open(DISCOUNT_WIZARD_PLUG_ID, {
      context: { ...context, discount: { mode: "create" } },
      onClose: () => discounts.refresh(),
    });
  }, [open, context, discounts]);

  const onDiscountAction = useCallback((action: string, item: Discount) => {
    if (action === 'edit') {
      void item;
      // TODO: Open Edit discount wizard when flow is implemented.
    }
  }, []);

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
              cell: (item: Discount) => {
                if (!canEditDiscountCode(accountType, item.source)) {
                  return <TextCell text={EM_DASH} />;
                }

                return (
                  <GridCellActions
                    item={item}
                    actions={DISCOUNT_ACTIONS}
                    onAction={onDiscountAction}
                    testId={`discounts-action-${item.id}`}
                  />
                );
              },
            } as GridColumnDefinition<Discount>,
          ]
        : []),
    ],
    [accountType, canAddClosedDiscount, onDiscountAction],
  );

  // The grid owns the paging state; mirror page changes into the fetch so the
  // backend receives the matching `offset`/`limit` query parameters.
  const onConfigChange = useCallback(
    (config: GridDefaultConfiguration<Discount>) => {
      const page = config.paging.page ?? 1;
      const pageSize = config.paging.pageSize ?? DEFAULT_PAGE_SIZE;
      setPaging((prev) =>
        prev.page === page && prev.pageSize === pageSize
          ? prev
          : { page, pageSize },
      );
    },
    [],
  );

  const gridProps = useGridAsync<Discount>({
    id: "modules__agreement__discounts--client",
    columns,
    data: discounts.data,
    total: discounts.total,
    isLoading: discounts.status === "loading" || discounts.status === "idle",
    error: discounts.error ?? undefined,
    refresh: discounts.refresh,
    abort: discounts.abort,
    paging: {
      page: paging.page,
      pageSize: paging.pageSize,
      total: discounts.total,
    },
    onConfigChange,
  });

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

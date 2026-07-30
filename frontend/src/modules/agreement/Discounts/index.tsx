import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import {
  Grid,
  GridCellSimple,
  GridColumnDefinition,
  GridDefaultConfiguration,
  useGridAsync,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../../i18n/translations';
import { useAgreementId } from '../../shared/hooks/useAgreementId';
import { useDiscounts } from '../../shared/hooks/useDiscounts';

import { TextCell } from './components/grid-cell/text-cell/TextCell';
import { EM_DASH, formatDate, formatOrderTypes, formatValue } from './format';

import type { Discount } from '../../shared/model';

import './index.scss';

const DEFAULT_PAGE_SIZE = 10;

const STATUS_CHIP_COLORS: Record<string, ChipColor> = {
  ACTIVE: 'success',
  EXPIRED: 'danger',
};

const columns: GridColumnDefinition<Discount>[] = [
  {
    name: 'code',
    title: i18n.t('Agreement:Discounts:Code'),
    fields: ['code'],
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
                color={STATUS_CHIP_COLORS[item.status] ?? 'gray'}
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
    name: 'source',
    title: i18n.t('Agreement:Discounts:Source'),
    fields: ['source'],
    initialWidth: 110,
    cell: (item) => <TextCell text={item.source ?? EM_DASH} />,
  },
  {
    name: 'type',
    title: i18n.t('Agreement:Discounts:Type'),
    fields: ['discountType'],
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
    name: 'value',
    title: i18n.t('Agreement:Discounts:Value'),
    fields: ['values'],
    initialWidth: 110,
    cell: (item) => <TextCell text={formatValue(item)} />,
  },
  {
    name: 'valid',
    title: i18n.t('Agreement:Discounts:Valid'),
    fields: ['startDate'],
    cell: (item) => (
      <TextCell
        text={`${formatDate(item.startDate)} - ${formatDate(item.endDate)}`}
        secondaryContent={
          item.discountLockEndDate
            ? i18n.t('Agreement:Discounts:Discount lock until', {
                date: formatDate(item.discountLockEndDate),
              })
            : undefined
        }
      />
    ),
  },
  {
    name: 'orderTypes',
    title: i18n.t('Agreement:Discounts:Order types'),
    fields: ['applicableOrderTypes'],
    cell: (item) => <TextCell text={formatOrderTypes(item.applicableOrderTypes)} />,
  },
  {
    name: 'redeemed',
    title: i18n.t('Agreement:Discounts:Redeemed'),
    fields: ['redeemedAt'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.redeemedAt ? formatDate(item.redeemedAt) : EM_DASH} />,
  },
];

export function Discounts() {
  const { t } = useTranslation();
  const agreementId = useAgreementId();
  const [paging, setPaging] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const discounts = useDiscounts(agreementId, paging.page, paging.pageSize);

  // The grid owns the paging state; mirror page changes into the fetch so the
  // backend receives the matching `offset`/`limit` query parameters.
  const onConfigChange = useCallback((config: GridDefaultConfiguration<Discount>) => {
    const page = config.paging.page ?? 1;
    const pageSize = config.paging.pageSize ?? DEFAULT_PAGE_SIZE;
    setPaging((prev) =>
      prev.page === page && prev.pageSize === pageSize ? prev : { page, pageSize },
    );
  }, []);

  const gridProps = useGridAsync<Discount>({
    id: 'modules__agreement__discounts--client',
    columns,
    data: discounts.data,
    total: discounts.total,
    isLoading: discounts.status === 'loading' || discounts.status === 'idle',
    error: discounts.error ?? undefined,
    refresh: discounts.refresh,
    abort: discounts.abort,
    paging: { page: paging.page, pageSize: paging.pageSize, total: discounts.total },
    onConfigChange,
  });

  return (
    <div className="discounts">
      <header className="extension__content-header">
        <MediumText as="h2" size={4} className="extension__content-title">
          {t('Agreement:Discounts:Title')}
        </MediumText>
      </header>

      <Grid {...gridProps} containerClassName="discounts__grid" />
    </div>
  );
}

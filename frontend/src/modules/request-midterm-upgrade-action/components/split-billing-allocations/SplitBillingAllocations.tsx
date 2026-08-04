import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Column, List, Row, useListInMemory, UseListInMemoryHookModel } from '@softwareone-platform/sdk-react-ui-v0/list';

import { AgreementSplitAllocation } from '../../../shared/model';
import { BuyerReference } from '../buyer-reference/BuyerReference';

import './SplitBillingAllocations.scss';

type AllocationRow = AgreementSplitAllocation & { id: string };

const noop = () => undefined;

export function SplitBillingAllocations({
  allocations,
  agreementBuyerId,
}: {
  allocations: AgreementSplitAllocation[];
  agreementBuyerId: string;
}) {
  const { t } = useTranslation();
  const rows = useMemo<AllocationRow[]>(
    () => allocations.map((allocation) => ({ ...allocation, id: allocation.buyer.id })),
    [allocations]
  );

  const columns = useMemo<Column<AllocationRow>[]>(
    () => [
      {
        name: 'Buyer',
        label: t('Common:Buyer'),
        cell: ({ data }) => (
          <BuyerReference allocation={data} isOwner={data.buyer.id === agreementBuyerId} />
        ),
        align: 'left',
      },
      {
        name: 'Allocation %',
        label: t('MidtermUpgrade:SplitBilling:Allocation %'),
        cell: ({ data }) => (data.percentage ? `${data.percentage}` : '—'),
        align: 'right',
      },
    ],
    [agreementBuyerId, t]
  );

  const listState = useListInMemory<AllocationRow>({
    limit: 10,
    columns,
    inputData: rows,
  } as UseListInMemoryHookModel<AllocationRow>);

  return (
    <div className="split-billing-allocations">
      <p className="split-billing-allocations__info">
        {t('MidtermUpgrade:SplitBilling:AllocationInfo')}
      </p>
      <List<AllocationRow>
        {...listState}
        fullWidth
        showSelectAll={false}
        showFilterBar={false}
        showColumnHeader
        columns={columns}
        data={rows}
        trackBy="id"
        selectedRows={[] as Row<AllocationRow>[]}
        setSelectedRows={noop}
      />
    </div>
  );
}

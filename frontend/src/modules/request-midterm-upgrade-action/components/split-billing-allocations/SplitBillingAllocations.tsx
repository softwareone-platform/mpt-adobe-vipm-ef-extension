import { useMemo } from 'react';

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
  const rows = useMemo<AllocationRow[]>(
    () => allocations.map((allocation) => ({ ...allocation, id: allocation.buyer.id })),
    [allocations]
  );

  const columns = useMemo<Column<AllocationRow>[]>(
    () => [
      {
        name: 'Buyer',
        cell: ({ data }) => (
          <BuyerReference allocation={data} isOwner={data.buyer.id === agreementBuyerId} />
        ),
        align: 'left',
      },
      {
        name: 'Allocation %',
        cell: ({ data }) => (data.percentage ? `${data.percentage}` : '—'),
        align: 'right',
      },
    ],
    [agreementBuyerId]
  );

  const listState = useListInMemory<AllocationRow>({
    limit: 10,
    columns,
    inputData: rows,
  } as UseListInMemoryHookModel<AllocationRow>);

  return (
    <div className="split-billing-allocations">
      <p className="split-billing-allocations__info">
        Billing for subscription changes will be allocated between buyers as follows
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

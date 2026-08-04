import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Column, List, Row, SelectionType, useListInMemory, UseListInMemoryHookModel } from '@softwareone-platform/sdk-react-ui-v0/list';

import { AgreementSplitAllocation } from '../../../shared/model';
import { BuyerReference } from '../buyer-reference/BuyerReference';

import './AllocateToBuyer.scss';

interface AllocateToBuyerProps {
  agreementBuyerId: string;
  selectedBuyerId: string;
  onChange: (allocation: AgreementSplitAllocation) => void;
  allocations: AgreementSplitAllocation[];
}

type AllocationRow = AgreementSplitAllocation & { id: string };

const selectionType: SelectionType = 'radio';

export function AllocateToBuyer({
  agreementBuyerId,
  selectedBuyerId,
  onChange,
  allocations,
}: AllocateToBuyerProps) {
  const { t } = useTranslation();
  const [selectedRows, setSelectedRows] = useState<Row<AllocationRow>[]>(
    selectedBuyerId ? [{ data: { id: selectedBuyerId } as AllocationRow, selected: true }] : []
  );

  useEffect(() => {
    setSelectedRows(
      selectedBuyerId ? [{ data: { id: selectedBuyerId } as AllocationRow, selected: true }] : []
    );
  }, [selectedBuyerId]);

  const rows = useMemo<AllocationRow[]>(
    () => allocations.map((allocation) => ({ ...allocation, id: allocation.buyer.id })),
    [allocations]
  );

  const columns = useMemo<Column<AllocationRow>[]>(
    () => [
      {
        name: 'buyer',
        cell: ({ data }) => (
          <BuyerReference allocation={data} isOwner={data.buyer.id === agreementBuyerId} />
        ),
        align: 'left',
      },
    ],
    [agreementBuyerId]
  );

  const listState = useListInMemory<AllocationRow>({
    limit: 10,
    columns,
    inputData: rows,
  } as UseListInMemoryHookModel<AllocationRow>);

  const changeSelectedBuyer = useCallback(
    (selected: AllocationRow[]) => {
      if (selected[0]) {
        onChange(selected[0]);
      }
    },
    [onChange]
  );

  return (
    <div className="buyers" data-testid="allocate-to-buyer">
      <p className="buyers__info">
        {t('MidtermUpgrade:SplitBilling:AllocationInfo')}
      </p>
      <List<AllocationRow>
        {...listState}
        fullWidth
        selectionType={selectionType}
        showSelectAll={false}
        showFilterBar={false}
        showColumnHeader={false}
        showSelectedNumber={false}
        columns={columns}
        data={rows}
        trackBy="id"
        selectedRows={selectedRows}
        setSelectedRows={setSelectedRows}
        onRowSelectionChange={changeSelectedBuyer}
      />
    </div>
  );
}

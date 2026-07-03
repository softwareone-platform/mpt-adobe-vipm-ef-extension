import { useState, useEffect, useMemo, useCallback } from 'react';

import { LinkReference } from '../link-reference/LinkReference';
import { ReferenceWithChip } from '../reference-with-chip/ReferenceWithChip';

import { SplitBillingAgreementAllocation } from '../../model';

import './AllocateToBuyer.scss';
import { Column, List, Row, SelectionType, useListInMemory, UseListInMemoryHookModel } from '@softwareone-platform/sdk-react-ui-v0/list';

interface AllocateToBuyerProps {
  agreementBuyerId: string;
  selectedBuyerId: string;
  onChange: (buyer: SplitBillingAgreementAllocation) => void;
  isTitle?: boolean;
  allocations: SplitBillingAgreementAllocation[];
}

const NONE_BUYER_ID = '0';

const defaultInfoText =
  'Allocate order billing to a specific buyer. If ‘None’ is selected, billing for this order will be allocated to buyers based on split billing percentages configured for this subscription.';

const props = {
  fullWidth: true,
  selectionType: 'radio' as SelectionType,
  showSelectAll: false,
  showFilterBar: true,
  showColumnHeader: false,
}

const getColumns = (buyerAgreementId: string | undefined): Column<Partial<SplitBillingAgreementAllocation>>[] => [
  {
    name: 'buyer',
    cell: ({ data }) =>
      data.id !== NONE_BUYER_ID ? (
        data?.buyer?.id === buyerAgreementId ? (
          <ReferenceWithChip text={data?.buyer?.name} statusLabel="Owner" />
        ) : (
          <LinkReference text={data?.buyer?.name} secondaryContent={data?.buyer?.id} />
        )
      ) : (
        <p>None</p>
      ),
    filterable: true,
    align: 'left',
  }
];

export function AllocateToBuyer({
  agreementBuyerId,
  selectedBuyerId,
  onChange,
  isTitle = false,
  allocations,
}: AllocateToBuyerProps) {
  const [selectedRows, setSelectedRows] = useState<Row<Partial<SplitBillingAgreementAllocation>>[]>(
    selectedBuyerId
      ? [{ data: { id: selectedBuyerId }, selected: true }]
      : [{ data: { id: NONE_BUYER_ID }, selected: true }]
  );

  useEffect(() => {
    setSelectedRows(
      selectedBuyerId
        ? [{ data: { id: selectedBuyerId }, selected: true }]
        : [{ data: { id: NONE_BUYER_ID }, selected: true }]
    );
  }, [selectedBuyerId]);

  const [buyers, setBuyers] = useState<Partial<SplitBillingAgreementAllocation>[]>();

  useEffect(() => {
    setBuyers(
      (allocations ?? [])
        .map(allocation => ({ ...allocation, id: allocation.buyer?.id }))
        .concat([{ id: NONE_BUYER_ID }])
    );
  }, [allocations]);

  const config = useMemo(
    () => ({
      limit: 10,
      columns: getColumns(agreementBuyerId),
    }),
    [agreementBuyerId]
  );

  const listProps = useListInMemory<Partial<SplitBillingAgreementAllocation>>({
    ...config,
    inputData: buyers,
  } as UseListInMemoryHookModel<Partial<SplitBillingAgreementAllocation>>);

  const changeSelectedBuyer = useCallback(
    (buyer: SplitBillingAgreementAllocation[]) => {
      const selected = buyer[0];
      if (!selected) return;
      onChange(selected.id === NONE_BUYER_ID ? {} : selected);
    },
    [onChange]
  );

  if (!allocations) return <></>;

  return (
    <div className="buyers" data-testid='allocate-to-buyer'>
      {isTitle && (
        <p className="buyers__title">
          Split billing
        </p>
      )}
      <p className="buyers__info">{defaultInfoText}</p>
      <List<Partial<SplitBillingAgreementAllocation>>
        {...props}
        {...listProps}
        columns={config.columns}
        data={buyers}
        trackBy='id'
        selectedRows={selectedRows}
        setSelectedRows={setSelectedRows}
        showFilterBar={false}
        showSelectedNumber={false}
        onRowSelectionChange={changeSelectedBuyer}
      />
    </div>
  );
}

import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import {
  Grid,
  GridCellHeader,
  GridCellRadio,
  GridColumnDefinition,
  GridFieldDefinition,
  GridFieldSortOperation,
  useGridInMemory,
  useRadioPlugin,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { useMemo } from 'react';

import { Subscription } from '../../../shared/model';

import { ChipCell } from '../grid-cell/chip-cell/ChipCell';
import { PopoverCell } from '../grid-cell/popover-cell/PopoverCell';
import { TextCell } from '../grid-cell/text-cell/TextCell';

interface Row {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  item: { id: string; name: string; externalId: string };
  quantity: number;
  unitSP?: number;
  spxM?: number;
  spxY?: number;
  status: string;
}

function toRows(subscription: Subscription): Row[] {
  return (subscription.lines ?? []).map((line) => ({
    id: line.id,
    subscriptionId: line.subscription?.id ?? subscription.id,
    subscriptionName: line.subscription?.name ?? subscription.name ?? '',
    item: {
      id: line.item.id,
      name: line.item.name,
      externalId: line.item.externalIds?.vendor ?? '',
    },
    quantity: line.quantity,
    unitSP: line.price?.unitSP,
    spxM: line.price?.SPxM,
    spxY: line.price?.SPxY,
    status: line.status ?? subscription.status ?? '',
  }));
}

const columns: GridColumnDefinition<Row>[] = [
  {
    name: 'select',
    header: <GridCellHeader></GridCellHeader>,
    cell: (item) => <GridCellRadio item={item} />,
    initialWidth: 40,
    minWidth: 40,
    isScalable: false,
  },
  {
    name: 'name',
    title: 'Name',
    fields: ['name'],
    cell: (item) => (
      <PopoverCell
        title="Item"
        text={item.item.name}
        secondaryContent={`${item.item.id} | ${item.item.externalId}`}
        items={[
          { title: 'ID', content: item.item.id },
          { title: 'Name', content: item.item.name },
          { title: 'External ID', content: item.item.externalId },
        ]}
      />
    ),
  },
  {
    name: 'subscription',
    title: 'Subscription',
    fields: ['subscription'],
    cell: (item) => (
      <PopoverCell
        title="Subscription"
        text={item.subscriptionName}
        secondaryContent={item.subscriptionId}
        items={[
          { title: 'ID', content: item.subscriptionId },
          { title: 'Name', content: item.subscriptionName },
          { title: 'Status', content: <Chip label={item.status} /> },
        ]}
      />
    ),
  },
  {
    name: 'quantity',
    title: 'Qty',
    fields: ['quantity'],
    initialWidth: 80,
    cell: (item) => <TextCell text={item.quantity} />,
  },
  {
    name: 'unitSP',
    title: 'Unit SP',
    fields: ['unitSP'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.unitSP} secondaryContent="user/year" />,
  },
  {
    name: 'spxM',
    title: 'SPxM',
    fields: ['spxM'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.spxM} />,
  },
  {
    name: 'spxY',
    title: 'SPxY',
    fields: ['spxY'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.spxY} />,
  },
  {
    name: 'status',
    title: 'Status',
    fields: ['status'],
    initialWidth: 120,
    cell: (item) => <ChipCell label={item.status} />,
  },
];

const fields: GridFieldDefinition[] = [
  { name: 'name', title: 'Name' },
  { name: 'subscription', title: 'Subscription' },
  { name: 'quantity', title: 'Qty', type: 'number' },
  { name: 'unitSP', title: 'Unit SP', type: 'number' },
  { name: 'spxM', title: 'SPxM', type: 'number' },
  { name: 'spxY', title: 'SPxY', type: 'number' },
  { name: 'status', title: 'Status' },
];

const sort: GridFieldSortOperation[] = [{ field: 'name', direction: 'asc' }];

function isEqual(a: Row, b: Row): boolean {
  return a?.id === b?.id;
}

export function CurrentSubscriptionGrid({
  subscription,
}: {
  subscription: Subscription;
}) {
  const { plugin: radioPlugin } = useRadioPlugin<Row>(isEqual);
  const plugins = useMemo(() => [radioPlugin], [radioPlugin]);

  const rows = useMemo(() => toRows(subscription), [subscription]);

  const gridProps = useGridInMemory(rows, {
    id: 'components__request-midterm-upgrade__current-subscription--client',
    columns,
    fields,
    sort,
    plugins,
    paging: { page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
  });

  return <Grid {...gridProps} />;
}

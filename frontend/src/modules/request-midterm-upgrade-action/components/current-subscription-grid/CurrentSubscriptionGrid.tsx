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

import { ChipCell } from '../grid-cell/chip-cell/ChipCell';
import { PopoverCell } from '../grid-cell/popover-cell/PopoverCell';
import { TextCell } from '../grid-cell/text-cell/TextCell';

interface Item {
  id: string;
  name: string;
  externalId: string;
}

interface Subscription {
  id: string;
  name: string;
  item: Item;
  quantity: number;
  unitSP: string;
  spxM: string;
  spxY: string;
  status: string;
}

const itemData: Item = {
  id: 'ITM-0520-2723-0405',
  name: 'Illustrator for Teams; Multi Language - North America; Multi',
  externalId: 'AO03.25470.MN | 30002000CB',
};

const subscriptionData: Subscription[] = [
  {
    id: 'SUB-1525-6036-0087',
    name: 'Subscription for Illustrator for Teams; Multi Language - N',
    item: itemData,
    quantity: 7,
    unitSP: '179.88',
    spxM: '104.93',
    spxY: '1,259.16',
    status: 'Active',
  },
];

const columns: GridColumnDefinition<Subscription>[] = [
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
        text={item.name}
        secondaryContent={item.id}
        items={[
          { title: 'ID', content: item.id },
          { title: 'Name', content: item.name },
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
  { name: 'unitSP', title: 'Unit SP' },
  { name: 'spxM', title: 'SPxM' },
  { name: 'spxY', title: 'SPxY' },
  { name: 'status', title: 'Status' },
];

const sort: GridFieldSortOperation[] = [{ field: 'name', direction: 'asc' }];

function isEqual(a: Subscription, b: Subscription): boolean {
  return a?.id === b?.id;
}

export function CurrentSubscriptionGrid() {
  const { plugin: radioPlugin } = useRadioPlugin<Subscription>(isEqual);
  const plugins = useMemo(() => [radioPlugin], [radioPlugin]);

  const gridProps = useGridInMemory(subscriptionData, {
    id: 'components__request-midterm-upgrade__current-subscription--client',
    columns,
    fields,
    sort,
    plugins,
    paging: { page: 1, pageSize: subscriptionData.length, total: subscriptionData.length },
  });

  return <Grid {...gridProps} />;
}

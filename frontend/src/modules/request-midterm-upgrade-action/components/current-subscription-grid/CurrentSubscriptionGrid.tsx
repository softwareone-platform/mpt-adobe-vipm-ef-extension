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
import { useEffect, useMemo } from 'react';

import { Subscription } from '../../../shared/model';

import { i18n } from '../../../../i18n/translations';
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
    title: i18n.t('Common:Name'),
    fields: ['name'],
    cell: (item) => (
      <PopoverCell
        title={i18n.t('Common:Item')}
        text={item.item.name}
        secondaryContent={`${item.item.id} | ${item.item.externalId}`}
        items={[
          { title: i18n.t('Common:ID'), content: item.item.id },
          { title: i18n.t('Common:Name'), content: item.item.name },
          { title: i18n.t('Common:External ID'), content: item.item.externalId },
        ]}
      />
    ),
  },
  {
    name: 'subscription',
    title: i18n.t('Common:Subscription'),
    fields: ['subscription'],
    cell: (item) => (
      <PopoverCell
        title={i18n.t('Common:Subscription')}
        text={item.subscriptionName}
        secondaryContent={item.subscriptionId}
        items={[
          { title: i18n.t('Common:ID'), content: item.subscriptionId },
          { title: i18n.t('Common:Name'), content: item.subscriptionName },
          { title: i18n.t('Common:Status'), content: <Chip label={item.status} /> },
        ]}
      />
    ),
  },
  {
    name: 'quantity',
    title: i18n.t('MidtermUpgrade:Grid:Qty'),
    fields: ['quantity'],
    initialWidth: 80,
    cell: (item) => <TextCell text={item.quantity} />,
  },
  {
    name: 'unitSP',
    title: i18n.t('MidtermUpgrade:Grid:Unit SP'),
    fields: ['unitSP'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.unitSP} secondaryContent={i18n.t('MidtermUpgrade:Grid:user/year')} />,
  },
  {
    name: 'spxM',
    title: i18n.t('MidtermUpgrade:Grid:SPxM'),
    fields: ['spxM'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.spxM} />,
  },
  {
    name: 'spxY',
    title: i18n.t('MidtermUpgrade:Grid:SPxY'),
    fields: ['spxY'],
    initialWidth: 120,
    cell: (item) => <TextCell text={item.spxY} />,
  },
  {
    name: 'status',
    title: i18n.t('Common:Status'),
    fields: ['status'],
    initialWidth: 120,
    cell: (item) => <ChipCell label={item.status} />,
  },
];

const fields: GridFieldDefinition[] = [
  { name: 'name', title: i18n.t('Common:Name') },
  { name: 'subscription', title: i18n.t('Common:Subscription') },
  { name: 'quantity', title: i18n.t('MidtermUpgrade:Grid:Qty'), type: 'number' },
  { name: 'unitSP', title: i18n.t('MidtermUpgrade:Grid:Unit SP'), type: 'number' },
  { name: 'spxM', title: i18n.t('MidtermUpgrade:Grid:SPxM'), type: 'number' },
  { name: 'spxY', title: i18n.t('MidtermUpgrade:Grid:SPxY'), type: 'number' },
  { name: 'status', title: i18n.t('Common:Status') },
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
  const { plugin: radioPlugin, selectedItem, setSelectedItem } = useRadioPlugin<Row>(isEqual);
  const plugins = useMemo(() => [radioPlugin], [radioPlugin]);

  const rows = useMemo(() => toRows(subscription), [subscription]);

  useEffect(() => {
    const selectionStillExists = selectedItem ? rows.some((row) => isEqual(row, selectedItem)) : false;
    if (rows[0] && !selectionStillExists) {
      setSelectedItem(rows[0]);
    }
  }, [rows, selectedItem, setSelectedItem]);

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

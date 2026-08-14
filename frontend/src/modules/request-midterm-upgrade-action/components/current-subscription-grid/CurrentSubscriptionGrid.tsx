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
import { getItemLink, getSubscriptionLink } from '../../../utils/link';

import { i18n } from '../../../../i18n/translations';
import { SubscriptionItem } from '../../model';
import { ChipCell } from '../../../shared/components/GridCell/ChipCell/ChipCell';
import { PopoverCell } from '../../../shared/components/GridCell/PopoverCell/PopoverCell';
import { TextCell } from '../../../shared/components/GridCell/TextCell/TextCell';
import { ItemCard } from '../item-card/ItemCard';
import { SubscriptionCard } from '../subscription-card/SubscriptionCard';

interface Row {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  subscription: Subscription;
  item: SubscriptionItem;
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
    subscription,
    item: {
      id: line.item.id,
      name: line.item.name,
      externalId: line.item.externalIds?.vendor ?? '',
      status: line.item.status,
      terms: line.item.terms,
      audit: line.item.audit,
      product: line.item.product,
      vendor: line.item.vendor,
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
        url={getItemLink(item.item.id)}
        card={<ItemCard item={item.item} />}
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
        url={getSubscriptionLink(item.subscriptionId)}
        card={
          <SubscriptionCard
            id={item.subscriptionId}
            name={item.subscriptionName}
            status={item.status}
            commitmentDate={item.subscription.commitmentDate}
            terms={item.subscription.terms}
            audit={item.subscription.audit}
            agreement={item.subscription.agreement}
          />
        }
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

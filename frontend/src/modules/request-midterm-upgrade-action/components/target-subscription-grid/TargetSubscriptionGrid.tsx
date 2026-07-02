import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import {
  Grid,
  GridCellHeader,
  GridCellRadio,
  GridColumnDefinition,
  GridFieldDefinition,
  GridCellSimple,
  GridFieldSortOperation,
  useGridInMemory,
  useRadioPlugin,
} from '@softwareone-platform/sdk-react-ui-v0/grid';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useCallback, useMemo } from 'react';

import { ChipCell } from '../grid-cell/chip-cell/ChipCell';
import { PopoverCell } from '../grid-cell/popover-cell/PopoverCell';
import { TextCell } from '../grid-cell/text-cell/TextCell';
import { TextInputCell } from '../grid-cell/text-input-cell/TextInputCell';
import { TargetSubscription } from '../../../shared/midterm-upgrade';

const columns: GridColumnDefinition<TargetSubscription>[] = [
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
    cell: (item) => getSubscriptionCell(item),
  },
  {
    name: 'recommended',
    title: 'Recommended',
    fields: ['recommended'],
    cell: (item) => getRecommendedCell(item),
  },
  {
    name: 'currentQuantity',
    title: 'Current Quantity',
    fields: ['currentQuantity'],
    cell: (item) => getCurrentQuantityCell(item),
  },
];

const priceColumns: GridColumnDefinition<TargetSubscription>[] = [
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
];

const fields: GridFieldDefinition[] = [
  { name: 'name', title: 'Name' },
  { name: 'subscription', title: 'Subscription' },
  { name: 'recommended', title: 'Recommended' },
  { name: 'currentQuantity', title: 'Current Quantity' },
  { name: 'unitSP', title: 'Unit SP' },
  { name: 'spxM', title: 'SPxM' },
  { name: 'spxY', title: 'SPxY' },
];

const sort: GridFieldSortOperation[] = [{ field: 'name', direction: 'asc' }];

function isEqual(a: TargetSubscription, b: TargetSubscription): boolean {
  return a.item.id === b.item.id;
}

interface TargetSubscriptionGridProps {
  subscriptions: TargetSubscription[];
  onSubscriptionsChange: (subscriptions: TargetSubscription[]) => void;
}

export function TargetSubscriptionGrid({ subscriptions, onSubscriptionsChange }: TargetSubscriptionGridProps) {
  const updateQuantity = useCallback(
    (target: TargetSubscription, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newQuantity = value === '' ? null : Number(value);
      onSubscriptionsChange(
        subscriptions.map((s) =>
          isEqual(s, target)
            ? { ...s, newQuantity, delta: (newQuantity ?? s.currentQuantity) - s.currentQuantity }
            : s,
        ),
      );
    },
    [subscriptions, onSubscriptionsChange],
  );

  const cols = useMemo<GridColumnDefinition<TargetSubscription>[]>(
    () => [
      ...columns,
      {
        name: 'newQuantity',
        title: 'New Quantity',
        fields: ['newQuantity'],
        cell: (item) => getNewQuantityCell(item, updateQuantity),
      },
      {
        name: 'delta',
        title: 'Delta',
        fields: ['delta'],
        cell: (item) => getDeltaCell(item),
      },
      ...priceColumns,
    ],
    [updateQuantity],
  );

  const { plugin: radioPlugin } = useRadioPlugin<TargetSubscription>(isEqual);
  const plugins = useMemo(() => [radioPlugin], [radioPlugin]);
  const gridProps = useGridInMemory(subscriptions, {
    id: 'components__request-midterm-upgrade-action__target-subscription-grid',
    columns: cols,
    fields,
    sort,
    plugins,
    paging: { page: 1, pageSize: subscriptions.length, total: subscriptions.length },
  });

  return <Grid {...gridProps} />;
}

export function getSubscriptionCell(subscription: TargetSubscription): React.ReactNode {
  if (subscription.id) {
    return (
      <PopoverCell
        title="Subscription"
        text={subscription.name ?? '—'}
        secondaryContent={subscription.id ?? undefined}
        items={[
          { title: 'ID', content: subscription.id ?? '—' },
          { title: 'Name', content: subscription.name ?? '—' },
          { title: 'Status', content: <Chip label={subscription.recommended ?? '—'} /> },
        ]}
      />
    );
  } else {
    return <ChipCell label="New" color="gray" />;
  }
}

export function getRecommendedCell(subscription: TargetSubscription): React.ReactNode {
  if (subscription.recommended === 'Yes') {
    return (
      <GridCellSimple>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <svg
            width="1em"
            height="1em"
            viewBox="0 -960 960 960"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="m344-60-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm34-102 102-44 104 44 56-96 110-26-10-112 74-84-74-86 10-112-110-24-58-96-102 44-104-44-56 96-110 24 10 112-74 86 74 84-10 114 110 24 58 96Zm102-318Zm-42 142 226-226-56-58-170 170-86-84-56 56 142 142Z" />
          </svg>
          <RegularText as="p" size={2}>
            Yes
          </RegularText>
        </span>
      </GridCellSimple>
    );
  } else {
    return <TextCell text={'—'} />;
  }
}

export function getCurrentQuantityCell(subscription: TargetSubscription): React.ReactNode {
  if (subscription.currentQuantity > 0) {
    return <TextCell text={subscription.currentQuantity} />;
  } else {
    return <TextCell text={'—'} />;
  }
}

export function getNewQuantityCell(
  subscription: TargetSubscription,
  onChange: (subscription: TargetSubscription, value: string) => void,
): React.ReactNode {
  const enabled = subscription.recommended === 'Yes';

  return (
    <TextInputCell
      value={subscription.newQuantity?.toString() ?? ''}
      htmlInputType="number"
      enabled={enabled}
      onChange={(value) => onChange(subscription, value)}
    />
  );
}

export function getDeltaCell(subscription: TargetSubscription): React.ReactNode {
  if (subscription.delta > 0) {
    return <TextCell text={`+${subscription.delta}`} />;
  } else if (subscription.delta < 0) {
    return <TextCell text={`${subscription.delta}`} />;
  } else {
    return <TextCell text={'—'} />;
  }
}

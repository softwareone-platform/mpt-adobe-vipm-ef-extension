import { useTranslation } from 'react-i18next';

import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';

import { EntityLink } from '../../../shared/components/EntityLink/EntityLink';
import { InfoCard } from '../../../shared/components/InfoCard/InfoCard';
import { LinkReference } from '../../../shared/components/LinkReference/LinkReference';
import { Timestamp } from '../../../shared/components/Timestamp/Timestamp';
import { EntityDomain, EntityType } from '../../../shared/constants';
import type { ProductItem } from '../../../shared/model';
import { getItemLink } from '../../../utils/link';
import { termLabel } from '../../../utils/terms';

export function ItemCard({ item }: { item: ProductItem }) {
  const { t } = useTranslation();

  return (
    <InfoCard
      items={[
        {
          title: t('Common:Name'),
          content: <LinkReference text={item.name} url={getItemLink(item.id)} />,
        },
        { title: t('Common:ID'), content: item.id },
        {
          title: t('Common:Status'),
          content: (
            <Chip
              label={item.status ?? '—'}
              color={item.status === 'Published' ? 'success' : undefined}
            />
          ),
        },
        {
          title: t('Common:Vendor'),
          content: item.vendor ? (
            <LinkReference text={item.vendor.name} iconUrl={item.vendor.icon} />
          ) : (
            '—'
          ),
        },
        {
          title: t('Common:Product'),
          content: (
            <EntityLink
              entityDomain={EntityDomain.Catalog}
              entityType={EntityType.Products}
              entity={item.product}
            />
          ),
        },
        { title: t('Common:Vendor ID'), content: item.externalIds?.vendor || '—' },
        { title: t('Common:Billing'), content: termLabel(t, item.terms?.period) },
        { title: t('Common:Commitment'), content: termLabel(t, item.terms?.commitment) },
        { type: 'divider' },
        { title: t('Common:Created'), content: <Timestamp at={item.audit?.created?.at} /> },
        { title: t('Common:Updated'), content: <Timestamp at={item.audit?.updated?.at} /> },
      ]}
    />
  );
}

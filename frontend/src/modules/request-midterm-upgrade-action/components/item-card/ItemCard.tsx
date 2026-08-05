import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { useTranslation } from 'react-i18next';

import { EntityDomain, EntityType } from '../../../shared/constants';
import { getItemLink } from '../../../utils/link';
import { termLabel } from '../../../utils/terms';
import { SubscriptionItem } from '../../model';
import { EntityLink } from '../entity-link/EntityLink';
import { InfoCard } from '../info-card/InfoCard';
import { LinkReference } from '../link-reference/LinkReference';
import { Timestamp } from '../timestamp/Timestamp';

export function ItemCard({ item }: { item: SubscriptionItem }) {
  const { t } = useTranslation();

  return (
    <InfoCard
      items={[
        { title: t('Common:Name'), content: <LinkReference text={item.name} url={getItemLink(item.id)} /> },
        { title: t('Common:ID'), content: item.id },
        {
          title: t('Common:Status'),
          content: (
            <Chip label={item.status ?? '—'} color={item.status === 'Published' ? 'success' : undefined} />
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
        { title: t('Common:Vendor ID'), content: item.externalId || '—' },
        { title: t('Common:Billing'), content: termLabel(t, item.terms?.period) },
        { title: t('Common:Commitment'), content: termLabel(t, item.terms?.commitment) },
        { type: 'divider' },
        { title: t('Common:Created'), content: <Timestamp at={item.audit?.created?.at} /> },
        { title: t('Common:Updated'), content: <Timestamp at={item.audit?.updated?.at} /> },
      ]}
    />
  );
}

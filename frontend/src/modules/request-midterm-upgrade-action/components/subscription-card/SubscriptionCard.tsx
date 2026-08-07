import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { useTranslation } from 'react-i18next';

import { EntityDomain, EntityType } from '../../../shared/constants';
import { Agreement, Audit, Terms } from '../../../shared/model';
import { formatDate } from '../../../utils/date';
import { getSubscriptionLink } from '../../../utils/link';
import { termLabel } from '../../../utils/terms';
import { EntityLink } from '../entity-link/EntityLink';
import { InfoCard } from '../info-card/InfoCard';
import { LinkReference } from '../link-reference/LinkReference';
import { Timestamp } from '../timestamp/Timestamp';

export interface SubscriptionCardProps {
  id?: string | null;
  name?: string | null;
  status?: string;
  commitmentDate?: string | null;
  terms?: Terms;
  audit?: Audit;
  agreement?: Agreement;
}

export function SubscriptionCard({
  id,
  name,
  status,
  commitmentDate,
  terms,
  audit,
  agreement,
}: SubscriptionCardProps) {
  const { t } = useTranslation();

  return (
    <InfoCard
      items={[
        {
          title: t('Common:Name'),
          content: <LinkReference text={name ?? undefined} url={getSubscriptionLink(id ?? undefined)} />,
        },
        { title: t('Common:ID'), content: id ?? '—' },
        {
          title: t('Common:Status'),
          content: <Chip label={status || '—'} color={status === 'Active' ? 'success' : undefined} />,
        },
        { title: t('Common:Renewal Date'), content: formatDate(commitmentDate ?? undefined) ?? '—' },
        { title: t('Common:Billing'), content: termLabel(t, terms?.period) },
        { title: t('Common:Commitment'), content: termLabel(t, terms?.commitment) },
        {
          title: t('Common:Vendor'),
          content: agreement?.vendor ? (
            <LinkReference text={agreement.vendor.name} iconUrl={agreement.vendor.icon} />
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
              entity={agreement?.product}
            />
          ),
        },
        {
          title: t('Common:Client'),
          content: (
            <EntityLink
              entityDomain={EntityDomain.Accounts}
              entityType={EntityType.Accounts}
              entity={agreement?.client}
            />
          ),
        },
        { type: 'divider' },
        {
          title: t('Common:Seller'),
          content: (
            <EntityLink
              entityDomain={EntityDomain.Accounts}
              entityType={EntityType.Sellers}
              entity={agreement?.seller}
            />
          ),
        },
        {
          title: t('Common:Buyer'),
          content: (
            <EntityLink
              entityDomain={EntityDomain.Accounts}
              entityType={EntityType.Buyers}
              entity={agreement?.buyer}
            />
          ),
        },
        {
          title: t('Common:Licensee'),
          content: (
            <EntityLink
              entityDomain={EntityDomain.Accounts}
              entityType={EntityType.Licensees}
              entity={agreement?.licensee}
            />
          ),
        },
        { type: 'divider' },
        { title: t('Common:Created'), content: <Timestamp at={audit?.created?.at} /> },
        { title: t('Common:Updated'), content: <Timestamp at={audit?.updated?.at} /> },
      ]}
    />
  );
}

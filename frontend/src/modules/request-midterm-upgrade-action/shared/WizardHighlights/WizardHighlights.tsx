import { useTranslation } from 'react-i18next';

import { EntityDomain, EntityType } from '../../../shared/constants';
import { OrderStatus, Subscription } from '../../../shared/model';
import { Order } from '../../model';
import { getEntityLink } from '../../../utils/link';

import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { Highlights } from '../../components/highlights/Highlights';
import { InfoCard } from '../../components/info-card/InfoCard';
import { LinkReference } from '../../components/link-reference/LinkReference';
import { ReferenceWithChip } from '../../components/reference-with-chip/ReferenceWithChip';
import { formatDate, formatTime } from '../../../utils/date';

export function WizardHighlights({
  subscription,
  order,
}: {
  subscription: Subscription;
  order?: Order | null;
}) {
  const { t } = useTranslation();
  const orderStatus = (order?.status ?? 'New') as OrderStatus;
  const orderType = order?.type ?? 'Change';
  const orderUrl = getEntityLink(EntityDomain.Commerce, EntityType.Orders, order?.id ?? undefined);
  const agreementStatus = subscription.agreement?.status ?? '';
  const agreementStatusColor: ChipColor | undefined =
    agreementStatus === 'Active' ? 'success' : undefined;
  const agreementUrl = getEntityLink(EntityDomain.Commerce, EntityType.Agreements, subscription.agreement?.id);
  const licenseeUrl = getEntityLink(EntityDomain.Accounts, EntityType.Licensees, subscription.licensee?.id);
  const buyerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Buyers, subscription.buyer?.id);
  const sellerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Sellers, subscription.seller?.id);
  const baseCurrency = subscription.price?.currency ?? '';
  const billingCurrency = subscription.price?.currency ?? '';

  const timestampContent = (at: string | undefined) =>
    at ? (
      <>
        <RegularText as="div" size={2}>{formatDate(at)}</RegularText>
        <RegularText as="div" size={1} color="grey-4">{formatTime(at)}</RegularText>
      </>
    ) : undefined;

  const agreement = subscription.agreement;
  const productUrl = getEntityLink(EntityDomain.Catalog, EntityType.Products, agreement?.product?.id);
  const clientUrl = getEntityLink(EntityDomain.Accounts, EntityType.Accounts, agreement?.client?.id);
  const agreementSellerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Sellers, agreement?.seller?.id);
  const agreementBuyerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Buyers, agreement?.buyer?.id);
  const agreementLicenseeUrl = getEntityLink(EntityDomain.Accounts, EntityType.Licensees, agreement?.licensee?.id);

  const agreementInfoCard = (
    <InfoCard
      items={[
        { title: t('Common:Name'), content: <LinkReference text={agreement?.name} url={agreementUrl} /> },
        { title: t('Common:ID'), content: agreement?.id },
        { title: t('Common:Status'), content: <Chip label={agreementStatus} color={agreementStatusColor} /> },
        { title: t('Common:Vendor'), content: agreement?.vendor?.name },
        { title: t('Common:Product'), content: <LinkReference text={agreement?.product?.name} url={productUrl} /> },
        { title: t('Common:Client'), content: <LinkReference text={agreement?.client?.name} url={clientUrl} /> },
        { type: 'divider' },
        { title: t('Common:Seller'), content: <LinkReference text={agreement?.seller?.name} url={agreementSellerUrl} /> },
        { title: t('Common:Buyer'), content: <LinkReference text={agreement?.buyer?.name} url={agreementBuyerUrl} /> },
        { title: t('Common:Licensee'), content: <LinkReference text={agreement?.licensee?.name} url={agreementLicenseeUrl} /> },
        { type: 'divider' },
        { title: t('Common:Created'), content: timestampContent(agreement?.audit?.created?.at) },
        { title: t('Common:Updated'), content: timestampContent(agreement?.audit?.updated?.at) },
      ]}
    />
  );

  const licensee = subscription.licensee;
  const licenseeAccountUrl = getEntityLink(EntityDomain.Accounts, EntityType.Accounts, licensee?.account?.id);
  const licenseeBuyerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Buyers, licensee?.buyer?.id);
  const licenseeSellerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Sellers, licensee?.seller?.id);

  const licenseeInfoCard = (
    <InfoCard
      items={[
        { title: t('Common:Name'), content: <LinkReference text={licensee?.name} url={licenseeUrl} /> },
        { title: t('Common:ID'), content: licensee?.id },
        { title: t('Common:Status'), content: <Chip label={licensee?.status ?? ''} /> },
        { title: t('Common:Account'), content: <LinkReference text={licensee?.account?.name} url={licenseeAccountUrl} /> },
        { title: t('Common:Buyer'), content: <LinkReference text={licensee?.buyer?.name} url={licenseeBuyerUrl} /> },
        { title: t('Common:Seller'), content: <LinkReference text={licensee?.seller?.name} url={licenseeSellerUrl} /> },
        { title: t('Common:External Reference'), content: licensee?.externalId ?? '—' },
        { type: 'divider' },
        { title: t('Common:Created'), content: timestampContent(licensee?.audit?.created?.at) },
        { title: t('Common:Updated'), content: timestampContent(licensee?.audit?.updated?.at) },
      ]}
    />
  );

  const buyer = subscription.buyer;
  const buyerAccountUrl = getEntityLink(EntityDomain.Accounts, EntityType.Accounts, buyer?.account?.id);

  const buyerInfoCard = (
    <InfoCard
      items={[
        { title: t('Common:Name'), content: <LinkReference text={buyer?.name} url={buyerUrl} /> },
        { title: t('Common:ID'), content: buyer?.id },
        { title: t('Common:SCU Identifier'), content: buyer?.externalIds?.erpCustomer ?? '—' },
        { title: t('Common:Tax Number'), content: buyer?.taxId ?? '—' },
        { title: t('Common:Status'), content: <Chip label={buyer?.status ?? ''} /> },
        { title: t('Common:Account'), content: <LinkReference text={buyer?.account?.name} url={buyerAccountUrl} /> },
        { type: 'divider' },
        { title: t('Common:Created'), content: timestampContent(buyer?.audit?.created?.at) },
        { title: t('Common:Updated'), content: timestampContent(buyer?.audit?.updated?.at) },
      ]}
    />
  );

  const seller = subscription.seller;
  const sellerInfoCard = (
    <InfoCard
      items={[
        { title: t('Common:Name'), content: <LinkReference text={seller?.name} url={sellerUrl} /> },
        { title: t('Common:ID'), content: seller?.id },
        { title: t('Common:Status'), content: <Chip label={seller?.status ?? ''} /> },
        { type: 'divider' },
        { title: t('Common:Created'), content: timestampContent(seller?.audit?.created?.at) },
        { title: t('Common:Updated'), content: timestampContent(seller?.audit?.updated?.at) },
      ]}
    />
  );

  return (
    <Highlights>
      <Highlights.Item label={t('Common:Order')}>
        {order?.id ? (
          <EntityReference
            primaryContent={
              <ReferenceWithChip
                text={order.id}
                url={orderUrl ?? undefined}
                statusLabel={orderStatus}
              />
            }
            secondaryContent={t('MidtermUpgrade:Highlights:orderSuffix', { type: orderType })}
          />
        ) : (
          <EntityReference
            primaryContent={<Chip label={orderStatus} />}
            secondaryContent={t('MidtermUpgrade:Highlights:orderSuffix', { type: orderType })}
          />
        )}
      </Highlights.Item>
      <Highlights.Item label={t('Common:Agreement')}>
        <EntityReference
          primaryContent={
            <ReferenceWithChip
              text={subscription.agreement?.name ?? undefined}
              url={agreementUrl ?? undefined}
              statusLabel={agreementStatus}
              statusColor={agreementStatusColor}
              cardTitle={t('Common:Agreement')}
              card={agreementInfoCard}
            />
          }
          secondaryContent={subscription.agreement?.id ?? undefined}
        />
      </Highlights.Item>
      <Highlights.Item label={t('Common:Licensee')}>
        <LinkReference
          text={subscription.licensee?.name ?? undefined}
          secondaryContent={subscription.licensee?.id ?? undefined}
          url={licenseeUrl ?? undefined}
          cardTitle={t('Common:Licensee')}
          card={licenseeInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label={t('Common:Buyer')}>
        <LinkReference
          text={subscription.buyer?.name ?? undefined}
          secondaryContent={subscription.buyer?.id ?? undefined}
          url={buyerUrl ?? undefined}
          cardTitle={t('Common:Buyer')}
          card={buyerInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label={t('Common:Seller')}>
        <LinkReference
          text={subscription.seller?.name ?? undefined}
          secondaryContent={subscription.seller?.id ?? undefined}
          url={sellerUrl ?? undefined}
          cardTitle={t('Common:Seller')}
          card={sellerInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label={t('MidtermUpgrade:Highlights:Base currency')}>
        <EntityReference
          primaryContent={baseCurrency}
        />
      </Highlights.Item>
      <Highlights.Item label={t('MidtermUpgrade:Highlights:Billing currency')}>
        <EntityReference
          primaryContent={billingCurrency}
        />
      </Highlights.Item>
    </Highlights>
  );
}

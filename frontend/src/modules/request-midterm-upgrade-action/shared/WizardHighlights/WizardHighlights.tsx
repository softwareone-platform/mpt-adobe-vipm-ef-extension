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
      title="Agreement"
      items={[
        { title: 'Name', content: <LinkReference text={agreement?.name} url={agreementUrl} /> },
        { title: 'ID', content: agreement?.id },
        { title: 'Status', content: <Chip label={agreementStatus} color={agreementStatusColor} /> },
        { title: 'Vendor', content: agreement?.vendor?.name },
        { title: 'Product', content: <LinkReference text={agreement?.product?.name} url={productUrl} /> },
        { title: 'Client', content: <LinkReference text={agreement?.client?.name} url={clientUrl} /> },
        { type: 'divider' },
        { title: 'Seller', content: <LinkReference text={agreement?.seller?.name} url={agreementSellerUrl} /> },
        { title: 'Buyer', content: <LinkReference text={agreement?.buyer?.name} url={agreementBuyerUrl} /> },
        { title: 'Licensee', content: <LinkReference text={agreement?.licensee?.name} url={agreementLicenseeUrl} /> },
        { type: 'divider' },
        { title: 'Created', content: timestampContent(agreement?.audit?.created?.at) },
        { title: 'Updated', content: timestampContent(agreement?.audit?.updated?.at) },
      ]}
    />
  );

  const licensee = subscription.licensee;
  const licenseeAccountUrl = getEntityLink(EntityDomain.Accounts, EntityType.Accounts, licensee?.account?.id);
  const licenseeBuyerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Buyers, licensee?.buyer?.id);
  const licenseeSellerUrl = getEntityLink(EntityDomain.Accounts, EntityType.Sellers, licensee?.seller?.id);

  const licenseeInfoCard = (
    <InfoCard
      title="Licensee"
      items={[
        { title: 'Name', content: <LinkReference text={licensee?.name} url={licenseeUrl} /> },
        { title: 'ID', content: licensee?.id },
        { title: 'Status', content: <Chip label={licensee?.status ?? ''} /> },
        { title: 'Account', content: <LinkReference text={licensee?.account?.name} url={licenseeAccountUrl} /> },
        { title: 'Buyer', content: <LinkReference text={licensee?.buyer?.name} url={licenseeBuyerUrl} /> },
        { title: 'Seller', content: <LinkReference text={licensee?.seller?.name} url={licenseeSellerUrl} /> },
        { title: 'External Reference', content: licensee?.externalId ?? '—' },
        { type: 'divider' },
        { title: 'Created', content: timestampContent(licensee?.audit?.created?.at) },
        { title: 'Updated', content: timestampContent(licensee?.audit?.updated?.at) },
      ]}
    />
  );

  const buyer = subscription.buyer;
  const buyerAccountUrl = getEntityLink(EntityDomain.Accounts, EntityType.Accounts, buyer?.account?.id);

  const buyerInfoCard = (
    <InfoCard
      title="Buyer"
      items={[
        { title: 'Name', content: <LinkReference text={buyer?.name} url={buyerUrl} /> },
        { title: 'ID', content: buyer?.id },
        { title: 'SCU Identifier', content: buyer?.externalIds?.erpCustomer ?? '—' },
        { title: 'Tax Number', content: buyer?.taxId ?? '—' },
        { title: 'Status', content: <Chip label={buyer?.status ?? ''} /> },
        { title: 'Account', content: <LinkReference text={buyer?.account?.name} url={buyerAccountUrl} /> },
        { type: 'divider' },
        { title: 'Created', content: timestampContent(buyer?.audit?.created?.at) },
        { title: 'Updated', content: timestampContent(buyer?.audit?.updated?.at) },
      ]}
    />
  );

  const seller = subscription.seller;
  const sellerInfoCard = (
    <InfoCard
      title="Seller"
      items={[
        { title: 'Name', content: <LinkReference text={seller?.name} url={sellerUrl} /> },
        { title: 'ID', content: seller?.id },
        { title: 'Status', content: <Chip label={seller?.status ?? ''} /> },
        { type: 'divider' },
        { title: 'Created', content: timestampContent(seller?.audit?.created?.at) },
        { title: 'Updated', content: timestampContent(seller?.audit?.updated?.at) },
      ]}
    />
  );

  return (
    <Highlights>
      <Highlights.Item label="Order">
        {order?.id ? (
          <EntityReference
            primaryContent={
              <ReferenceWithChip
                text={order.id}
                url={orderUrl ?? undefined}
                statusLabel={orderStatus}
              />
            }
            secondaryContent={`${orderType} order`}
          />
        ) : (
          <EntityReference
            primaryContent={<Chip label={orderStatus} />}
            secondaryContent={`${orderType} order`}
          />
        )}
      </Highlights.Item>
      <Highlights.Item label="Agreement">
        <EntityReference
          primaryContent={
            <ReferenceWithChip
              text={subscription.agreement?.name ?? undefined}
              url={agreementUrl ?? undefined}
              statusLabel={agreementStatus}
              statusColor={agreementStatusColor}
              infoCard={agreementInfoCard}
            />
          }
          secondaryContent={subscription.agreement?.id ?? undefined}
        />
      </Highlights.Item>
      <Highlights.Item label="Licensee">
        <LinkReference
          text={subscription.licensee?.name ?? undefined}
          secondaryContent={subscription.licensee?.id ?? undefined}
          url={licenseeUrl ?? undefined}
          infoCard={licenseeInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label="Buyer">
        <LinkReference
          text={subscription.buyer?.name ?? undefined}
          secondaryContent={subscription.buyer?.id ?? undefined}
          url={buyerUrl ?? undefined}
          infoCard={buyerInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label="Seller">
        <LinkReference
          text={subscription.seller?.name ?? undefined}
          secondaryContent={subscription.seller?.id ?? undefined}
          url={sellerUrl ?? undefined}
          infoCard={sellerInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label="Base currency">
        <EntityReference
          primaryContent={baseCurrency}
        />
      </Highlights.Item>
      <Highlights.Item label="Billing currency">
        <EntityReference
          primaryContent={billingCurrency}
        />
      </Highlights.Item>
    </Highlights>
  );
}

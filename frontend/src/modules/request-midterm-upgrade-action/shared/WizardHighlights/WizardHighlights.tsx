import { OrderStatus } from '../../../shared/model';

import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';

import { Highlights } from '../../components/highlights/Highlights';
import { InfoCard } from '../../components/info-card/InfoCard';
import { LinkReference } from '../../components/link-reference/LinkReference';
import { ReferenceWithChip } from '../../components/reference-with-chip/ReferenceWithChip';

export function WizardHighlights() {
  const agreement = {
    "id": "AGR-1111-1111"
  };
  const order = {
    "id": "ORD-1111-1111",
    "status": "New",
    "type": "Change"
  };
  const licensee = {
    "id": "LIC-1111-1111",
    "name": "Licensee Name"
  };
  const buyer = {
    "id": "BUY-1111-1111",
    "name": "Buyer Name"
  };
  const seller = {
    "id": "SEL-1111-1111",
    "name": "Seller Name"
  };
  const orderStatus: OrderStatus = (order?.status as OrderStatus) ?? 'New';
  const orderType = `${order?.type ?? (agreement?.id ? 'Change' : 'Purchase')}`;
  const orderUrl = order?.id ? `/commerce/orders/${order.id}` : null;
  const agreementStatus = 'Active';
  const agreementUrl = agreement?.id ? `/commerce/agreements/${agreement.id}` : null;
  const licenseeUrl = licensee?.id ? `/accounts/licensees/${licensee.id}` : null;
  const buyerUrl = buyer?.id ? `/accounts/buyers/${buyer.id}` : null;
  const sellerUrl = seller?.id ? `/accounts/sellers/${seller.id}` : null;
  const baseCurrency = 'USD';
  const billingCurrency = 'USD';

  const orderInfoCard = (
    <InfoCard
      title="Order"
      items={[
        { title: 'Type', content: order?.type },
        { title: 'ID', content: order?.id },
        { title: 'Status', content: <Chip label={orderStatus} /> },
      ]}
    />
  );

  const agreementInfoCard = (
    <InfoCard
      title="Agreement"
      items={[
        { title: 'ID', content: agreement?.id },
        { title: 'Status', content: <Chip label={agreementStatus} /> },
      ]}
    />
  );

  const licenseeInfoCard = (
    <InfoCard
      title="Licensee"
      items={[
        { title: 'ID', content: licensee?.id },
        { title: 'Name', content: licensee?.name },
      ]}
    />
  );

  const buyerInfoCard = (
    <InfoCard
      title="Buyer"
      items={[
        { title: 'ID', content: buyer?.id },
        { title: 'Name', content: buyer?.name },
      ]}
    />
  );

  const sellerInfoCard = (
    <InfoCard
      title="Seller"
      items={[
        { title: 'ID', content: seller?.id },
        { title: 'Name', content: seller?.name },
      ]}
    />
  );

  return (
    <Highlights>
      <Highlights.Item label="Order">
        <EntityReference
          primaryContent={
            <ReferenceWithChip
              text={order?.id ?? undefined}
              url={orderUrl ?? undefined}
              statusLabel={orderStatus}
              infoCard={orderInfoCard}
            />
          }
          secondaryContent={orderType}
        />
      </Highlights.Item>
      <Highlights.Item label="Agreement">
        <EntityReference
          primaryContent={
            <ReferenceWithChip
              text={agreement?.id ?? undefined}
              url={agreementUrl ?? undefined}
              statusLabel={agreementStatus}
              infoCard={agreementInfoCard}
            />
          }
        />
      </Highlights.Item>
      <Highlights.Item label="Licensee">
        <LinkReference
          text={licensee?.name ?? undefined}
          secondaryContent={licensee?.id ?? undefined}
          url={licenseeUrl ?? undefined}
          infoCard={licenseeInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label="Buyer">
        <LinkReference
          text={buyer?.name ?? undefined}
          secondaryContent={buyer?.id ?? undefined}
          url={buyerUrl ?? undefined}
          infoCard={buyerInfoCard}
        />
      </Highlights.Item>
      <Highlights.Item label="Seller">
        <LinkReference
          text={seller?.name ?? undefined}
          secondaryContent={seller?.id ?? undefined}
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

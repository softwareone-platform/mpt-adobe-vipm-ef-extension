import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';

import { AgreementSplitAllocation } from '../../../shared/model';

export function BuyerReference({
  allocation,
  isOwner,
}: {
  allocation: AgreementSplitAllocation;
  isOwner: boolean;
}) {
  const externalId = allocation.externalIds?.client;
  const secondaryContent = externalId ? `${allocation.buyer.id} | ${externalId}` : allocation.buyer.id;

  return (
    <EntityReference
      primaryContent={allocation.buyer.name}
      secondaryContent={secondaryContent}
      chipLabel={isOwner ? 'Owner' : undefined}
      chipColor="gray"
    />
  );
}

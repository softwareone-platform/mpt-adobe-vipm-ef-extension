import { EntityDomain, EntityType } from '../../../shared/constants';
import { Reference } from '../../../shared/model';
import { getEntityLink } from '../../../utils/link';
import { LinkReference } from '../link-reference/LinkReference';

export interface EntityLinkProps {
  entityDomain: EntityDomain;
  entityType: EntityType;
  entity?: Reference;
}

export function EntityLink({ entityDomain, entityType, entity }: EntityLinkProps) {
  return (
    <LinkReference
      text={entity?.name}
      url={getEntityLink(entityDomain, entityType, entity?.id)}
      iconUrl={entity?.icon}
    />
  );
}

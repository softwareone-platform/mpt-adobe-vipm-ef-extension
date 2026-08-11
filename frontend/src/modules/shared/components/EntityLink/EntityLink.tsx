import { EntityDomain, EntityType } from '../../constants';
import { Reference } from '../../model';
import { getEntityLink } from '../../../utils/link';
import { LinkReference } from '../LinkReference/LinkReference';

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

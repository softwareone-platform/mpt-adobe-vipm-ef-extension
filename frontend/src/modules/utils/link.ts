import { EntityDomain, EntityType } from '../shared/constants';

export function getEntityLink(
  entityDomain: EntityDomain,
  entityType: EntityType,
  entityId: string | undefined,
): string | undefined {
  if (!entityId) {
    return undefined;
  }
  return entityDomain.toString() === entityType.toString()
    ? `/${entityDomain}/${entityId}`
    : `/${entityDomain}/${entityType}/${entityId}`;
}

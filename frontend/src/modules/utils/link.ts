import { EntityDomain, EntityType } from '../shared/constants';

export function getPortalOrigin(): string {
  return (
    window.location.ancestorOrigins?.[0] ??
    (document.referrer ? new URL(document.referrer).origin : window.location.origin)
  );
}

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

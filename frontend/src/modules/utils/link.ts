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

export function getItemLink(itemId: string | undefined): string | undefined {
  return getEntityLink(EntityDomain.Catalog, EntityType.Items, itemId);
}

export function getSubscriptionLink(subscriptionId: string | undefined): string | undefined {
  return getEntityLink(EntityDomain.Commerce, EntityType.Subscriptions, subscriptionId);
}

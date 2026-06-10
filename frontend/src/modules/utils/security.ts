import { ProductSegments } from '../agreement/model';
import type { ProductSegment } from '../agreement/hooks/useSettings';
import type { AccountType } from '../agreement/ThreeYearCommitment/model';
import { getProduct } from './settings';

/**
 * Shared gate for Adobe customer actions exposed in the agreement plug.
 *
 * An action is offered only to Operations/Vendor accounts on a supported
 * product. The LGA-segment exclusion is action-specific and applied by the
 * individual callers, so it is intentionally not enforced here.
 */
function canRequestAdobeAction(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  const isRequestAccountType = accountType === 'Operations' || accountType === 'Vendor';
  const product = getProduct(products, agreementProductId ?? '');
  return isRequestAccountType && product != null;
}

export function canRequestThreeYearCommitment(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  const product = getProduct(products, agreementProductId ?? '');
  return (
    canRequestAdobeAction(accountType, products, agreementProductId) &&
    product?.segment !== ProductSegments.LGA
  );
}

export function canRequestLinkedMembership(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return canRequestAdobeAction(accountType, products, agreementProductId);
}

export function canRequestGlobalCustomer(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return canRequestAdobeAction(accountType, products, agreementProductId);
}

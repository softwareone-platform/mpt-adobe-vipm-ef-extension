import type { ProductSegment } from '../shared/hooks/useSettings';
import { ProductSegments } from '../shared/model';
import type { AccountType } from '../shared/three-year-commitment';
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

function canRequestClientAction(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  const product = getProduct(products, agreementProductId ?? '');
  return accountType === 'Client' && product != null;
}

export function canRequestMidtermUpgradeAction(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return canRequestClientAction(accountType, products, agreementProductId);
}

export function canRequestRenewalAction(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return canRequestClientAction(accountType, products, agreementProductId);
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


/**
 * Mirrors the backend gate in `routers/api/discount_scope.py::require_editor_account`,
 * which rejects client accounts with 403. Authoring closed discount codes is
 * offered only to the accounts that would actually be allowed to save them.
 */
export function canManageDiscountCodes(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return canRequestAdobeAction(accountType, products, agreementProductId);
}

/**
 * Vendor edits both open (sync-owned) and closed codes, while
 * Operations is limited to closed codes. Client never reaches here, since the
 * Actions column itself is vendor/operations only.
 */
export function canEditDiscountCode(
  source: string | null | undefined,
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  return (
    canManageDiscountCodes(accountType, products, agreementProductId) &&
    (accountType === 'Vendor' || source?.toUpperCase() === 'CLOSED')
  );
}

import { ProductSegments } from '../agreement/model';
import type { ProductSegment } from '../agreement/hooks/useSettings';
import type { AccountType } from '../agreement/ThreeYearCommitment/model';
import { getProduct } from './settings';

export function canRequestThreeYearCommitment(
  accountType: AccountType | undefined,
  products: ProductSegment[] | undefined,
  agreementProductId: string | undefined,
): boolean {
  const isRequestAccountType = accountType === 'Operations' || accountType === 'Vendor';
  const product = getProduct(products, agreementProductId ?? '');
  return isRequestAccountType && product != null && product.segment !== ProductSegments.LGA;
}

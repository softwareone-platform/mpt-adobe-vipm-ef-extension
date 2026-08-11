const PARTIAL_SKU_LENGTH = 10;

/**
 * The discount-level-agnostic prefix of an Adobe offer id.
 *
 * Catalog items reference Adobe products by this partial SKU, while Adobe
 * payloads (offers, recommendations) carry full offer ids that append the
 * discount level, so cross-referencing always compares partial SKUs.
 */
export function getPartialSku(offerId: string): string {
  return offerId.slice(0, PARTIAL_SKU_LENGTH);
}

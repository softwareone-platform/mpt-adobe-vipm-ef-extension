import { i18n } from '../../i18n/translations';
import type { RejectedField } from './apiError';

const REASON_KEYS = new Set([
  'NOT_FOUND',
  'INELIGIBLE_COMMITMENT_STATUS',
  'INELIGIBLE_COMMITMENT_STATUS_OR_PERCENT_SEATS',
  'INELIGIBLE_COMMITMENT_STATUS_OR_COMMIT_QUANTITY',
  'SEAT_UPGRADE_PERCENTAGE_NOT_MET',
  'OWNED_ENTITLEMENT_NOT_MET',
  'NEW_TO_PRODUCT_NOT_MET',
  'CUSTOMER_SEGMENT_NOT_MET',
  'CUSTOMER_STATUS_NOT_MET',
  'QUALIFICATION_EVENT_NOT_MET',
  'MUST_MAINTAIN_QUANTITY_NOT_MET',
  'PURCHASE_QUANTITY_NOT_MET',
  'CURRENT_LICENSE_QUANTITY_NOT_MET',
  'RENEWAL_LICENSE_QUANTITY_NOT_MET',
  '2147',
]);

/**
 * The copy for one criterion Adobe named when it refused a discount code.
 *
 * Adobe is expected to name the qualification the customer failed, but the
 * vocabulary is its own and can grow: a reason we have no copy for reads as the
 * generic refusal rather than showing the raw token, so a renamed or added
 * criterion never breaks the message.
 */
export function toRejectionReason(reason: string): string {
  return REASON_KEYS.has(reason)
    ? i18n.t(`Renewal:Promotions:Rejected:${reason}`)
    : i18n.t('Renewal:Promotions:Rejected:Fallback');
}

const CODE_SEGMENT = '/flexDiscountCodes/';

/**
 * Split a rejection's pointer into the row it names and the refused code.
 *
 * The backend points a refused code at ``<row>/flexDiscountCodes/<code>``, so
 * the message can name the code Adobe refused even when the row's own
 * selection is not what reached Adobe. A pointer without that segment names
 * only the row.
 */
export function toRejectionTarget(pointer: string): { row: string; code: string } {
  const at = pointer.indexOf(CODE_SEGMENT);
  return at < 0
    ? { row: pointer, code: '' }
    : { row: pointer.slice(0, at), code: pointer.slice(at + CODE_SEGMENT.length) };
}

/** One rejection line: the code, the row it was applied to, and why it failed. */
export function toRejectionMessage(rejection: RejectedField, itemName: string, code: string) {
  return i18n.t('Renewal:Promotions:Rejected:Line', {
    code,
    item: itemName,
    reason: toRejectionReason(rejection.detail),
  });
}

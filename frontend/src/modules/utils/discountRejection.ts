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

/** One rejection line: the code, the row it was applied to, and why it failed. */
export function toRejectionMessage(rejection: RejectedField, itemName: string, code: string) {
  return i18n.t('Renewal:Promotions:Rejected:Line', {
    code,
    item: itemName,
    reason: toRejectionReason(rejection.detail),
  });
}

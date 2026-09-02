import { i18n } from '../../i18n/translations';
import { ADOBE_ERROR_CODE_PATTERN, ADOBE_UNKNOWN_DISCOUNT_CODE } from '../shared/constants';

/**
 * Rewrite Adobe's rejection of a typed discount code as the wizard's own copy.
 *
 * Adobe answers with its numbered message, which names an error code and a line
 * item rather than telling the customer what to do about it. Only the unknown
 * code rejection has copy of ours to show; every other message is returned
 * verbatim, so a rejection we have not written for never hides its reason.
 */
export function toDiscountErrorMessage(message: string, code: string): string {
  const errorCode = ADOBE_ERROR_CODE_PATTERN.exec(message)?.[1];
  return errorCode === ADOBE_UNKNOWN_DISCOUNT_CODE
    ? i18n.t('Renewal:Promotions:Unknown code', { code })
    : message;
}

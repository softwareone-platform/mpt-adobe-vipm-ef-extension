import { i18n } from '../../i18n/translations';
import { AdobeOfferSwitchPath } from '../shared/model';
import {
  getOfferRule,
  validateNewQuantity,
} from './components/target-subscription-grid/TargetSubscriptionGrid';
import { TargetSubscription } from './model';

export function getPlaceOrderValidationError(
  target: TargetSubscription | null,
  offerPaths: AdobeOfferSwitchPath[],
  sourceQuantity: number,
): string | null {
  if (!target) {
    return i18n.t('MidtermUpgrade:PlaceOrder:SelectItem');
  }
  if (!target.targetBaseOfferId) {
    return i18n.t('MidtermUpgrade:PlaceOrder:MissingOffer');
  }
  if (!target.newQuantity || target.newQuantity < 1) {
    return i18n.t('MidtermUpgrade:PlaceOrder:EnterQuantity');
  }
  const rule = getOfferRule(offerPaths, target, sourceQuantity);
  if (!rule) {
    return i18n.t('MidtermUpgrade:PlaceOrder:NotAvailable');
  }
  return validateNewQuantity(target.newQuantity, rule);
}

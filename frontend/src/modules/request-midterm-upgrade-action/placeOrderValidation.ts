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
    return 'Select an item to continue.';
  }
  if (!target.targetBaseOfferId) {
    return 'The selected item is missing its Adobe offer and cannot be ordered.';
  }
  if (!target.newQuantity || target.newQuantity < 1) {
    return 'Enter a new quantity of at least 1 for the selected item.';
  }
  const rule = getOfferRule(offerPaths, target, sourceQuantity);
  if (!rule) {
    return 'The selected item is not an available upgrade and cannot be ordered.';
  }
  return validateNewQuantity(target.newQuantity, rule);
}

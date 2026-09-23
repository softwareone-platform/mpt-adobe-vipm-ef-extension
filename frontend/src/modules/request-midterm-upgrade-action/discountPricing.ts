import type { Discount, SwitchPreview } from '../shared/model';
import { getDiscountedUnitPrice, normalizeDiscountCode } from '../utils/discount';
import { rankDiscounts } from '../utils/discountRanking';
import { getMonthlyPrice, getYearlyPrice, parseUnitPrice } from '../utils/price';
import type { TargetSubscription } from './model';

/** The shortlisted discount a (typed or picked) code names, if the shortlist knows it. */
export function findDiscount(discounts: Discount[], code: string | null): Discount | undefined {
  const wanted = normalizeDiscountCode(code ?? '');
  if (!wanted) return undefined;
  return discounts.find((discount) => normalizeDiscountCode(discount.code) === wanted);
}

/** The best-value code to pre-select for the target line, or '' when none can apply. */
export function getBestDiscountCode(discounts: Discount[], target: TargetSubscription): string {
  const [best] = rankDiscounts(discounts, parseUnitPrice(target.unitSP));
  return best ? normalizeDiscountCode(best.code) : '';
}

/**
 * The target's unit SP after the discount, estimated from its Discount Values.
 *
 * A cleared code, or one the shortlist does not know, leaves the list price:
 * only Adobe can price a code we hold no values for.
 */
export function getLocalUnitPrice(
  target: TargetSubscription,
  discount: Discount | undefined,
): number | null {
  const unitSP = parseUnitPrice(target.unitSP);
  if (unitSP == null || !discount) return unitSP;
  return getDiscountedUnitPrice(unitSP, discount) ?? unitSP;
}

/**
 * The target's unit SP as Adobe's ``PREVIEW_SWITCH`` quote prices it.
 *
 * The quote holds purchase prices, so the discount Adobe applied is carried
 * onto the selling price as the ratio of the discounted to the list purchase
 * price. Answers null when there is no quote for the target, or it is not
 * priced, so the caller falls back to the local estimate.
 */
export function getQuotedUnitPrice(
  target: TargetSubscription,
  preview: SwitchPreview | null,
): number | null {
  const unitSP = parseUnitPrice(target.unitSP);
  if (!preview || unitSP == null) return null;
  const line = (preview.lineItems ?? []).find(
    (item) => item.offerId === target.targetBaseOfferId,
  );
  const partnerPrice = line?.pricing?.partnerPrice;
  const discountedPartnerPrice = line?.pricing?.discountedPartnerPrice;
  if (!partnerPrice || discountedPartnerPrice == null) return null;
  return (unitSP * discountedPartnerPrice) / partnerPrice;
}

/** The target row re-priced at the discounted unit SP for the switched seats. */
export function withDiscount(
  target: TargetSubscription,
  unitPrice: number | null,
  code: string,
): TargetSubscription {
  return {
    ...target,
    discountCode: code,
    unitSP: unitPrice != null ? unitPrice.toFixed(2) : target.unitSP,
    spxM: unitPrice != null ? getMonthlyPrice(unitPrice, target.delta) : target.spxM,
    spxY: unitPrice != null ? getYearlyPrice(unitPrice, target.delta) : target.spxY,
  };
}

import type {
  AdobeCommitmentDetail,
  AdobeCustomerData,
  AdobeMinimumQuantity,
  AdobeThreeYearBenefit,
} from '../shared/model';
import { findThreeYearBenefit, readMinimumQuantity } from '../shared/model';
import { daysUntil } from '../utils/date';

export type RequestType = 'commitment' | 'recommitment';

/** Adobe accepts a recommitment only in the last 30 days before the 3YC end date. */
export const RECOMMITMENT_WINDOW_DAYS = 30;

/** A 3YC request awaiting acceptance in the Adobe Admin Console. */
export interface PendingRequest {
  type: RequestType;
  licenses: number | null;
  consumables: number | null;
}

/** What the request modal needs to know about the customer's current 3YC. */
export interface CommitmentState {
  isCommitted: boolean;
  endDate: string | null;
  licenseMinimum: number | null;
  consumableMinimum: number | null;
  pendingRequest: PendingRequest | null;
  hasRecommitmentRequest: boolean;
}

export function readCommitmentState(data: AdobeCustomerData | null | undefined): CommitmentState {
  const benefit = findThreeYearBenefit(data);
  const commitment = benefit?.commitment;
  const isCommitted = commitment?.status === 'COMMITTED';
  return {
    isCommitted,
    endDate: isCommitted ? (commitment?.endDate ?? null) : null,
    licenseMinimum: isCommitted ? readMinimumQuantity(commitment, 'LICENSE') : null,
    consumableMinimum: isCommitted ? readMinimumQuantity(commitment, 'CONSUMABLES') : null,
    // A request awaiting acceptance does not block a new one: Adobe overwrites a
    // REQUESTED request with the next one sent (sandbox-verified 30 Sep 2026).
    pendingRequest: readPendingRequest(benefit),
    // Adobe accepts no commitment request while the customer has a recommitment
    // request, pending or accepted; an accepted one stays until the new term starts.
    hasRecommitmentRequest: ['REQUESTED', 'ACCEPTED'].includes(
      benefit?.recommitmentRequest?.status ?? '',
    ),
  };
}

function readPendingRequest(benefit: AdobeThreeYearBenefit | undefined): PendingRequest | null {
  const requests: [RequestType, AdobeCommitmentDetail | null | undefined][] = [
    ['commitment', benefit?.commitmentRequest],
    ['recommitment', benefit?.recommitmentRequest],
  ];
  for (const [type, request] of requests) {
    if (request?.status === 'REQUESTED') {
      return {
        type,
        licenses: readMinimumQuantity(request, 'LICENSE'),
        consumables: readMinimumQuantity(request, 'CONSUMABLES'),
      };
    }
  }
  return null;
}

/**
 * The lowest quantity Adobe accepts for an offer type on this request.
 *
 * An uplevel (a commitment request for a committed customer) may not go below
 * the current committed minimum, and must keep every committed offer type
 * (Adobe answers ``1135`` and ``1122``). A recommitment renews for a new term,
 * so it has no floor.
 */
export function quantityFloor(
  state: CommitmentState,
  requestType: RequestType,
  offerType: AdobeMinimumQuantity['offerType'],
): number | null {
  if (requestType !== 'commitment') {
    return null;
  }
  return offerType === 'LICENSE' ? state.licenseMinimum : state.consumableMinimum;
}

/** The first day Adobe accepts a recommitment, as ``YYYY-MM-DD``. */
export function recommitmentOpensOn(endDate: string): string {
  const [year, month, day] = endDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - RECOMMITMENT_WINDOW_DAYS))
    .toISOString()
    .slice(0, 10);
}

export function isRecommitmentOpen(state: CommitmentState, today: Date = new Date()): boolean {
  if (!state.isCommitted || !state.endDate) {
    return false;
  }
  const days = daysUntil(state.endDate, today);
  return days != null && days <= RECOMMITMENT_WINDOW_DAYS;
}

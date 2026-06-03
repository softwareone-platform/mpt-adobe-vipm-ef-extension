export type RequestStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'COMMITTED'
  | 'EXPIRED'
  | 'NONCOMPLIANT';

export type OfferType = 'LICENSE' | 'CONSUMABLES';

export interface MinimumQuantity {
  offerType: OfferType;
  quantity: number;
}

export interface CommitmentRequest {
  minimumQuantities: MinimumQuantity[];
}

export interface ThreeYearCommitmentBenefit {
  type: 'THREE_YEAR_COMMIT';
  commitmentRequest?: CommitmentRequest;
  recommitmentRequest?: CommitmentRequest;
}

export interface ThreeYearCommitmentRequestInput {
  benefits: ThreeYearCommitmentBenefit[];
}

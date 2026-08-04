import type { Agreement, Audit, Buyer, Reference, Terms } from '../shared/model';

export type SplitBillingAllocationPrice = {
  currency?: string;
  SPxY?: number | null;
  SPxM?: number | null;
  PPxY?: number | null;
  PPxM?: number | null;
};

export type SplitBillingAgreementAllocation = {
  id?: string;
  buyer?: Buyer | null;
  percentage?: number | null;
  price?: SplitBillingAllocationPrice | null;
}

export type SplitBillingAgreement = {
  id?: string | null;
  buyer?: Buyer | null;
  allocations?: SplitBillingAgreementAllocation[] | null;
}

export type ExternalIds = {
  client?: string | null;
  operations?: string | null;
  vendor?: string | null;
}

export type Order = {
  id?: string | null;
  status?: string | null;
  type?: string | null;
  agreement?: Agreement | null;
  billTo?: Buyer | null;
  externalIds?: ExternalIds | null;
  notes?: string | null;
}

export type SubscriptionItem = {
  id: string;
  name: string;
  externalId: string;
  status?: string;
  terms?: Terms;
  audit?: Audit;
  product?: Reference;
  vendor?: Reference;
};

export type TargetSubscription = {
  id: string | null;
  name: string | null;
  status: string;
  item: SubscriptionItem;
  targetBaseOfferId?: string;
  recommended: boolean;
  currentQuantity: number;
  newQuantity: number | null;
  delta: number;
  unitSP: string;
  spxM: string;
  spxY: string;
  terms: string;
  commitment: string;
  commitmentDate?: string | null;
  subscriptionTerms?: Terms;
  audit?: Audit;
}

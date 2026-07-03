import type { Agreement, Buyer } from '../shared/model';

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
};

export type TargetSubscription = {
  id: string | null;
  name: string | null;
  item: SubscriptionItem;
  recommended: string;
  currentQuantity: number;
  newQuantity: number | null;
  delta: number;
  unitSP: string;
  spxM: string;
  spxY: string;
  terms: string;
  commitment: string;
}

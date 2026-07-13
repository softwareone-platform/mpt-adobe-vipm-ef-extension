export interface Reference {
  id?: string;
  name?: string;
}

export interface NamedEntity {
  id: string;
  name: string;
}

export type Product = NamedEntity;

export interface Seller {
  id: string;
  name: string;
  status?: string;
  audit?: Audit;
}

export interface Buyer {
  id: string;
  name: string;
  status?: string;
  taxId?: string;
  externalIds?: { erpCustomer?: string };
  account?: Reference;
  audit?: Audit;
}

export interface Licensee {
  id: string;
  name: string;
  status?: string;
  account?: Reference;
  buyer?: Buyer;
  seller?: Seller;
  externalId?: string;
  audit?: Audit;
}

export interface Price {
  currency?: string;
  PPxY?: number;
  PPxM?: number;
  unitPP?: number;
  SPxY?: number;
  SPxM?: number;
  unitSP?: number;
  markup?: number;
  margin?: number;
}

export interface ExternalIds {
  seller?: string;
  vendor?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  externalIds?: ExternalIds;
}

export interface SubscriptionLine {
  id: string;
  status?: string;
  quantity: number;
  item: ProductItem;
  price?: Price;
  subscription?: {
    id: string;
    name?: string;
  };
}

export interface AgreementContext {
  data?: {
    agreement?: Reference;
  };
}

export interface SubscriptionContext {
  data?: {
    subscription?: Subscription;
  };
}

export interface CommerceParameter {
  displayValue?: string;
  externalId?: string;
  id?: string;
  name?: string;
  phase?: string;
  scope?: string;
  value?: unknown;
  type?: string;
  multiple?: boolean;
}

export interface AuditEvent {
  at?: string;
  by?: Reference;
}

export interface Audit {
  created?: AuditEvent;
  updated?: AuditEvent;
}

export interface Agreement {
  id: string;
  name?: string;
  status?: string;
  parameters?: {
    fulfillment?: CommerceParameter[];
  };
  product?: Product;
  vendor?: Reference;
  client?: Reference;
  seller?: Seller;
  buyer?: Buyer;
  licensee?: Licensee;
  audit?: Audit;
}

export interface Subscription {
  id: string;
  name?: string;
  status?: string;
  externalIds?: ExternalIds;
  agreement?: Agreement;
  parameters?: {
    fulfillment?: CommerceParameter[];
  };
  product?: Product;
  lines?: SubscriptionLine[];
  buyer?: Buyer;
  licensee?: Licensee;
  seller?: Seller;
  price?: Price;
}

export interface AdobeMinimumQuantity {
  offerType: 'LICENSE' | 'CONSUMABLES';
  quantity: number;
}

export interface AdobeCommitmentDetail {
  startDate?: string;
  endDate?: string;
  status: string;
  minimumQuantities: AdobeMinimumQuantity[];
}

export interface AdobeThreeYearBenefit {
  type: 'THREE_YEAR_COMMIT';
  commitment?: AdobeCommitmentDetail | null;
  commitmentRequest?: AdobeCommitmentDetail | null;
  recommitmentRequest?: AdobeCommitmentDetail | null;
}

/**
 * Linked membership details as returned within the Adobe customer payload.
 *
 * Adobe only populates ``linkedMembership`` once a customer belongs to one, so
 * every field is optional and the UI renders an em dash for whatever is absent.
 * ``owner`` reflects whether the agreement's account owns the membership (the
 * "This account" row in the UI).
 */
export interface AdobeLinkedMembership {
  linkedMembershipId?: string;
  id?: string;
  name?: string;
  type?: string;
  linkedMembershipType?: boolean;
  creationDate?: string;
}

export interface AdobeCustomerData {
  externalReferenceId?: string;
  customerId?: string;
  status?: string;
  companyProfile?: {
    companyName?: string;
    preferredLanguage?: string;
    marketSegment?: string;
  };
  benefits?: AdobeThreeYearBenefit[];
  linkedMembership?: AdobeLinkedMembership | null;
  cotermDate?: string;
  globalSalesEnabled?: boolean;
}

export interface AdobeCustomer {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  data: AdobeCustomerData | null;
}

export interface AdobeTarget {
  targetBaseOfferId: string;
  sequence: number;
  switchType: 'PARTIAL_ALLOWED' | 'FULL_ONLY';
  item?: { id: string; name: string; externalId: string; unitSP?: number | null } | null;
}

export interface AdobeProductUpgrade {
  sourceBaseOfferId: string;
  targetList: AdobeTarget[];
}

export interface AdobeOfferSwitchPath {
  totalCount: number;
  count: number;
  offset: number;
  limit: number;
  productUpgrades: AdobeProductUpgrade[];
}

export interface OfferSwitchPaths {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  data: AdobeOfferSwitchPath | null;
}

export enum ProductSegments {
  COM = 'COM',
  EDU = 'EDU',
  GOV = 'GOV',
  LGA = 'LGA',
}

export type OrderStatus = 'New' | 'Draft' | 'Deleted' | 'Processing' | 'Querying' | 'Failed' | 'Completed' | 'Quoted';

export function resolveAgreementId(context?: AgreementContext): string {
  return context?.data?.agreement?.id?.trim() ?? '';
}

export function resolveSubscriptionId(context?: SubscriptionContext): string {
  return context?.data?.subscription?.id?.trim() ?? '';
}

export function readParameter(
  parameters: CommerceParameter[] | undefined,
  externalId: string,
): unknown {
  return parameters?.find((parameter) => parameter.externalId === externalId)?.value;
}

/**
 * Locate the three-year commitment benefit within an Adobe customer payload.
 *
 * The 3YC information the UI displays (current commitment, commitment request
 * and recommitment request) all lives on this single benefit, so callers fetch
 * it once and read the relevant detail off it.
 */
export function findThreeYearBenefit(
  data: AdobeCustomerData | null | undefined,
): AdobeThreeYearBenefit | undefined {
  return data?.benefits?.find((benefit) => benefit.type === 'THREE_YEAR_COMMIT');
}

/**
 * Whether the customer currently holds an active three-year commitment.
 *
 * Adobe reports an enrolled customer with a ``COMMITTED`` status on the current
 * commitment detail, the same signal the commitment request flow uses to lock
 * the "commitment" option. Callers gate actions that are incompatible with an
 * existing commitment (such as creating a linked membership) on this.
 */
export function hasThreeYearCommitment(
  data: AdobeCustomerData | null | undefined,
): boolean {
  return findThreeYearBenefit(data)?.commitment?.status === 'COMMITTED';
}

/**
 * Read the minimum quantity for an offer type from a commitment detail.
 *
 * Returns ``null`` when the detail is absent or has no quantity for the offer
 * type, which the UI renders as an em dash.
 */
export function readMinimumQuantity(
  detail: AdobeCommitmentDetail | null | undefined,
  offerType: AdobeMinimumQuantity['offerType'],
): number | null {
  return detail?.minimumQuantities?.find((q) => q.offerType === offerType)?.quantity ?? null;
}

/**
 * Read the linked membership details from an Adobe customer payload.
 *
 * Returns ``undefined`` when the customer has no linked membership, which the
 * UI renders as em dashes for every detail row.
 */
export function findLinkedMembership(
  data: AdobeCustomerData | null | undefined,
): AdobeLinkedMembership | undefined {
  return data?.linkedMembership ?? undefined;
}

/**
 * Whether global sales (the "Global customer" status) is enabled for the
 * customer.
 *
 * Adobe reports this on the ``globalSalesEnabled`` flag of the customer payload.
 * Once enabled it cannot be turned off, so the UI gates the update action on
 * this signal.
 */
export function isGlobalSalesEnabled(
  data: AdobeCustomerData | null | undefined,
): boolean {
  return data?.globalSalesEnabled === true;
}

export type Status = 'idle' | 'loading' | 'success' | 'error';

export interface SyncState {
  error: string;
  lastCompleted: string | null;
  lastStatus: Status | null;
  status: Status;
}

export const INITIAL_SYNC_STATE: SyncState = {
  error: '',
  lastCompleted: null,
  lastStatus: null,
  status: 'idle',
};

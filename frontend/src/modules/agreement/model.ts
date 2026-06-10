export interface Reference {
  id?: string;
  name?: string;
}

export interface Product {
  id: string;
}

export interface AgreementContext {
  data?: {
    agreement?: Reference;
  };
}

export interface AgreementParameter {
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

export interface Agreement {
  id: string;
  status?: string;
  parameters?: {
    fulfillment?: AgreementParameter[];
  };
  product?: Product;
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

export enum ProductSegments {
  COM = 'COM',
  EDU = 'EDU',
  GOV = 'GOV',
  LGA = 'LGA',
}

export function resolveAgreementId(context?: AgreementContext): string {
  return context?.data?.agreement?.id?.trim() ?? '';
}

export function readParameter(
  parameters: AgreementParameter[] | undefined,
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

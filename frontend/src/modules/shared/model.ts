export interface Reference {
  id?: string;
  name?: string;
  icon?: string;
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
  icon?: string;
  audit?: Audit;
}

export interface Buyer {
  id: string;
  name: string;
  status?: string;
  icon?: string;
  taxId?: string;
  externalIds?: { erpCustomer?: string };
  account?: Reference;
  audit?: Audit;
}

export interface Licensee {
  id: string;
  name: string;
  status?: string;
  icon?: string;
  account?: Reference;
  buyer?: Buyer;
  seller?: Seller;
  externalId?: string;
  audit?: Audit;
}

export interface Price {
  currency?: string;
  billingCurrency?: string;
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
  status?: string;
  terms?: Terms;
  audit?: Audit;
  product?: Reference;
  vendor?: Reference;
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

export interface CommerceParameterConstraints {
  required?: boolean;
  hidden?: boolean;
  readonly?: boolean;
}

export interface CommerceParameter {
  id: string;
  displayValue?: string;
  externalId?: string;
  name?: string;
  phase?: string;
  scope?: string;
  value?: unknown;
  type?: string;
  multiple?: boolean;
  constraints?: CommerceParameterConstraints;
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
    ordering?: CommerceParameter[];
    fulfillment?: CommerceParameter[];
  };
  listing?: Reference;
  product?: Product;
  vendor?: Reference;
  client?: Reference;
  seller?: Seller;
  buyer?: Buyer;
  licensee?: Licensee;
  price?: Price;
  split?: AgreementSplit | null;
  audit?: Audit;
}

export interface Terms {
  model?: string | null;
  period?: string | null;
  commitment?: string | null;
}

export interface Subscription {
  id: string;
  name?: string;
  status?: string;
  autoRenew?: boolean;
  splitStatus?: string;
  split?: AgreementSplit | null;
  externalIds?: ExternalIds;
  terms?: Terms;
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
  commitmentDate?: string;
  audit?: Audit;
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

export interface AdobeTargetSubscription {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  quantity?: number | null;
  lineId?: string | null;
  commitmentDate?: string | null;
  terms?: Terms;
  audit?: Audit;
}

export interface AdobeTargetItem {
  id: string;
  name: string;
  externalId: string;
  unitSP?: number | null;
  status?: string;
  terms?: Terms;
  audit?: Audit;
  product?: Reference;
  vendor?: Reference;
}

export interface AdobeTarget {
  targetBaseOfferId: string;
  sequence: number;
  switchType: 'PARTIAL_ALLOWED' | 'FULL_ONLY';
  item?: AdobeTargetItem | null;
  subscription?: AdobeTargetSubscription | null;
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

export interface AdobeRecommendationProduct {
  baseOfferId?: string;
}

export interface AdobeRecommendationSource {
  sourceType?: string;
  offerIds?: string[];
}

export interface AdobeRecommendation {
  rank?: number;
  product?: AdobeRecommendationProduct;
  source?: AdobeRecommendationSource;
}

export interface AdobeRecommendations {
  upsells: AdobeRecommendation[];
  crossSells: AdobeRecommendation[];
  addOns: AdobeRecommendation[];
}

export interface AdobeRecommendationData {
  productRecommendations: AdobeRecommendations;
  xRecommendationTrackerId: string;
}

export interface Recommendations {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  data: AdobeRecommendationData | null;
}

export function getRecommendedOfferIds(
  data: AdobeRecommendationData | null | undefined,
): Set<string> {
  const recommendations = data?.productRecommendations;
  if (!recommendations) return new Set();
  const flattened = [
    ...recommendations.upsells,
    ...recommendations.crossSells,
    ...recommendations.addOns,
  ];
  return new Set(
    flattened
      .map((recommendation) => recommendation.product?.baseOfferId)
      .filter((offerId): offerId is string => Boolean(offerId)),
  );
}

export enum ProductSegments {
  COM = 'COM',
  EDU = 'EDU',
  GOV = 'GOV',
  LGA = 'LGA',
}

export type OrderStatus = 'New' | 'Draft' | 'Deleted' | 'Processing' | 'Querying' | 'Failed' | 'Completed' | 'Quoted';

export interface OrderExternalIds {
  client?: string | null;
  operations?: string | null;
  vendor?: string | null;
}

export interface Order {
  id?: string | null;
  status?: string | null;
  type?: string | null;
  agreement?: Agreement | null;
  billTo?: Buyer | null;
  externalIds?: OrderExternalIds | null;
  notes?: string | null;
}

/** One existing subscription's renewal decision as the renewal endpoints expect it. */
export interface RenewalPlanSubscriptionSelection {
  id: string;
  offerId: string;
  renew: boolean;
  renewalQuantity: number;
}

/** A net-new product selection as the renewal endpoints expect it. */
export interface RenewalPlanNetNewItemSelection {
  offerId: string;
  quantity: number;
}

/**
 * The renewal path the customer picks on the wizard's first step.
 *
 * ``anniversary`` renews at the coterm date, so nothing reaches Adobe until
 * then; ``now`` (early renewal) places the RENEWAL order immediately, which is
 * why that path is validated against Adobe as the customer assembles it.
 */
export type RenewalPath = 'anniversary' | 'now';

/** How much of a subscription's existing quantity is already early-renewed. */
export type RenewalStateValue = 'notRenewed' | 'partiallyRenewed' | 'fullyRenewed';

/**
 * One subscription's early-renewal state, as the renewal-state endpoint reports it.
 *
 * ``remainingQuantity`` is how much of the existing seats a further RENEWAL
 * order can still early-renew, the figure the remainder control surfaces.
 * ``earlyRenewable`` is false for a SKU Adobe will not early-renew at all, and
 * ``increaseAllowed`` is true only once every existing seat is renewed, since an
 * increase rides a later add-mode order.
 */
export interface RenewalStateEntry {
  currentQuantity: number;
  renewedQuantity: number;
  state: RenewalStateValue;
  remainingQuantity: number;
  earlyRenewable: boolean;
  increaseAllowed: boolean;
}

/**
 * Whether a renewal can be planned today, and which path is already established.
 *
 * Adobe takes a renewal order and a scheduled net-new subscription only inside
 * the window before the anniversary, and only for a customer holding an active
 * subscription, so the wizard's first step reads this before it offers a path.
 * ``lockedPath`` is set once an early renewal has rolled the anniversary
 * forward, which fixes the path and makes the step read-only.
 */
export interface RenewalPathState {
  anniversaryDate: string;
  windowOpen: boolean;
  windowOpensDays: number;
  windowClosesDays: number;
  hasActiveSubscriptions: boolean;
  lockedPath: RenewalPath | null;
}

/**
 * Whether the wizard can go past its first step.
 *
 * An established early path is answer enough: the anniversary has already
 * rolled, so the customer returns to a confirmed path rather than to the window
 * notice. Otherwise there has to be something to renew and a window Adobe still
 * accepts an order in.
 */
export function canPlanRenewal(pathState: RenewalPathState | null): boolean {
  if (!pathState) return false;
  if (pathState.lockedPath) return true;
  return pathState.windowOpen && pathState.hasActiveSubscriptions;
}

/** The renewal plan body shared by the 3YC check, preview and submission endpoints. */
export interface RenewalPlanBody {
  subscriptions: RenewalPlanSubscriptionSelection[];
  netNewItems: RenewalPlanNetNewItemSelection[];
  renewalPath: RenewalPath;
}

/**
 * Whether the plan has to be quoted through Adobe before the wizard advances.
 *
 * Early renewal places the RENEWAL order now, so Adobe is the authority on
 * whether the basket is valid — the renewing lines, their quantities and the
 * additions that would ride the same order — and the wizard gates every step
 * that changes it on a ``PREVIEW_RENEWAL``. An at-anniversary plan orders
 * nothing today and is only checked against the 3YC floors, and a plan with
 * neither a renewing subscription nor an addition has no line Adobe could
 * price.
 */
export function isRenewalPreviewRequired(plan: RenewalPlanBody): boolean {
  return (
    plan.renewalPath === 'now' &&
    (plan.subscriptions.some((subscription) => subscription.renew) ||
      plan.netNewItems.length > 0)
  );
}

/** The renewal order body: the plan plus everything only the submission carries. */
export interface RenewalOrderInput extends RenewalPlanBody {
  flexDiscountCodes: string[];
  recommendationTrackerId?: string;
  notes?: string;
  externalIds?: { client?: string };
}

/** The order the renewal submission endpoint returns. */
export interface RenewalOrderResult {
  id?: string | null;
  status?: string | null;
  type?: string | null;
}

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

/**
 * A price list entry from the platform catalog, as the extension backend
 * returns it: the public API payload plus the Adobe-recommended badge the
 * backend crosses in.
 */
export interface PriceListItem {
  id: string;
  status?: string;
  unitLP?: number;
  unitSP?: number;
  SPxM?: number;
  SPxY?: number;
  item?: ProductItem;
  recommended?: boolean;
}

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

export interface AgreementSplitPrice {
  currency: string;
  SPxY: number;
  SPxM: number;
}

export interface AgreementSplitAllocation {
  buyer: { id: string; name: string };
  externalIds?: { client?: string };
  percentage: number;
  price: AgreementSplitPrice;
}

export interface AgreementSplit {
  id: string;
  revision: number;
  allocations: AgreementSplitAllocation[];
}

export type DiscountType = 'PERCENTAGE' | 'FIXED_DISCOUNT' | 'FIXED_PRICE';

export type DiscountOrderType = 'NEW' | 'RENEWAL' | 'SWITCH';

export interface DiscountValueEntry {
  country?: string;
  currency?: string;
  value?: number;
}

export interface Discount {
  id: string;
  code: string;
  adobeDiscountId?: string | null;
  name?: string | null;
  description?: string | null;
  source?: string | null;
  category?: string | null;
  status?: string | null;
  discountType?: DiscountType | null;
  marketSegment?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reusable?: boolean;
  discountLockEndDate?: string | null;
  targetOfferIds?: string[];
  qualifyingOfferIds?: string[];
  applicableOrderTypes?: DiscountOrderType[];
  supportsAnnual?: boolean;
  supports3yc?: boolean;
  targetCustomerId?: string | null;
  values?: DiscountValueEntry[];
  redeemedAt?: string | null;
  retiredAt?: string | null;
  enrichmentStatus?: string | null;
  synchronizedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DiscountsPage {
  status: Status;
  error: string | null;
  data: Discount[];
  total: number;
}

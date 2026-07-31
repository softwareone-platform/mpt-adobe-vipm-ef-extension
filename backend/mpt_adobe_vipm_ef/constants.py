from collections.abc import Mapping
from types import MappingProxyType

MONTHS_PER_YEAR = 12
MONTHS_PER_THREE_YEARS = 36

YEARLY_FACTOR: Mapping[str | None, float] = MappingProxyType(
    {"1y": 1, "1m": MONTHS_PER_YEAR, "3y": 1 / 3},
)
MONTHLY_FACTOR: Mapping[str | None, float] = MappingProxyType({
    "1y": 1 / MONTHS_PER_YEAR,
    "1m": 1,
    "3y": 1 / MONTHS_PER_THREE_YEARS,
})
PRICE_PRECISION = 2

AGREEMENT_SELECT = (
    "audit",
    "buyer",
    "client",
    "licensee",
    "parameters",
    "product",
    "seller",
    "vendor",
)
LICENSEE_SELECT = ("account", "audit", "buyer", "seller")
BUYER_SELECT = ("account", "audit")
SELLER_SELECT = ("audit",)

CUSTOMER_ID_PARAM = "customerId"
SWITCH_PAYLOAD_PARAM = "switchPayload"
MIN_LENGTH = 1
MAX_LENGTH = 255
NOTES_MAX_LENGTH = 4000
AGREEMENT_CACHE_KEY = "agreements_by_id"

FULFILLMENT_PHASE = "fulfillment"
THREE_YC_COMMITMENT_REQUEST_STATUS_PARAM = "3YCCommitmentRequestStatus"
THREE_YC_RECOMMITMENT_REQUEST_STATUS_PARAM = "3YCRecommitmentRequestStatus"
THREE_YC_STATUS_REQUESTED = "REQUESTED"

RECOMMENDATION_TRACKER_HEADER = "x-recommendation-tracker-id"

CHANGE_ORDER_TYPE = "Change"
PROCESSING_ORDER_STATUS = "Processing"
ACTIVE_AGREEMENT_STATUS = "Active"

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
LINES_SELECT = ("lines",)
LICENSEE_SELECT = ("account", "audit", "buyer", "seller")
BUYER_SELECT = ("account", "audit")
SELLER_SELECT = ("audit",)
SPLIT_SELECT = ("split",)
PUBLIC_API_PREFIX = "/public"
ITEM_SELECT = ("audit", "product", "terms")
SUBSCRIPTION_AUDIT_SELECT = ("audit",)

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

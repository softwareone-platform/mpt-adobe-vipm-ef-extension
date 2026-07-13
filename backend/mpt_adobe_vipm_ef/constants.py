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

AGREEMENT_SELECT = ("audit", "buyer", "client", "licensee", "product", "seller", "vendor")
LICENSEE_SELECT = ("account", "audit", "buyer", "seller")
BUYER_SELECT = ("account", "audit")
SELLER_SELECT = ("audit",)

CUSTOMER_ID_PARAM = "customerId"
MIN_LENGTH = 1
MAX_LENGTH = 255
AGREEMENT_CACHE_KEY = "agreements_by_id"

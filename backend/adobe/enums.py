from enum import StrEnum


class LinkedMembershipType(StrEnum):
    """Linked membership types allowed by the Adobe VIPM API."""

    STANDARD = "STANDARD"
    CONSORTIUM = "CONSORTIUM"


class AdobeOrderType(StrEnum):
    """Order types accepted by the Adobe VIPM orders API."""

    SWITCH = "SWITCH"
    PREVIEW_SWITCH = "PREVIEW_SWITCH"
    PREVIEW_RENEWAL = "PREVIEW_RENEWAL"
    RENEWAL = "RENEWAL"


class AdobeOrderStatus(StrEnum):
    """Adobe order statuses read back from the orders API."""

    COMPLETE = "1000"
    OPEN = "1002"

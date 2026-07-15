from enum import StrEnum


class LinkedMembershipType(StrEnum):
    """Linked membership types allowed by the Adobe VIPM API."""

    STANDARD = "STANDARD"
    CONSORTIUM = "CONSORTIUM"


class AdobeOrderType(StrEnum):
    """Order types accepted by the Adobe VIPM orders API for mid-term upgrades."""

    SWITCH = "SWITCH"
    PREVIEW_SWITCH = "PREVIEW_SWITCH"

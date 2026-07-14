from adobe.resources.customer import CustomerClient
from adobe.resources.offer import OfferClient
from adobe.resources.recommendation import RecommendationClient
from adobe.transport import AdobeTransport


class AdobeClient:
    """Adobe API client facade.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes resource
    clients (e.g. :attr:`customer`) on top of it.
    """

    def __init__(self) -> None:
        self._transport = AdobeTransport()
        self.customer = CustomerClient(self._transport)
        self.offer = OfferClient(self._transport)
        self.recommendation = RecommendationClient(self._transport)


_ADOBE_CLIENT: "AdobeClient | None" = None


def get_adobe_client() -> AdobeClient:
    """Return the global ``AdobeClient`` singleton."""
    global _ADOBE_CLIENT  # noqa: PLW0603 WPS420
    if _ADOBE_CLIENT is None:
        _ADOBE_CLIENT = AdobeClient()  # noqa: WPS122
    return _ADOBE_CLIENT  # noqa: WPS121


def reset_adobe_client() -> None:
    """Reset the global Adobe client singleton (useful for tests)."""
    global _ADOBE_CLIENT  # noqa: PLW0603 WPS420
    _ADOBE_CLIENT = None  # noqa: WPS122

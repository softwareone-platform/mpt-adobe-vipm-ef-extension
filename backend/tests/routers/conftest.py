import pytest
from mpt_extension_sdk.api.auth.context import Account, AccountType, AuthContext

from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM
from mpt_adobe_vipm_ef.models.recommendation import RecommendationRequest

_FAKE_JWT = "fake-token"


@pytest.fixture
def fulfillment_customer_bag():
    """Return a fresh parameter bag carrying the Adobe customer id in fulfillment."""
    return {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "value": "CUST-001"}]}


class FakeAdobeCall:
    """Sync Adobe method stub: returns a preset payload or raises, recording calls."""

    def __init__(self):
        self.returns = None
        self.error = None
        self.calls = []

    def __call__(self, *call_args, **call_kwargs):
        self.calls.append((call_args, call_kwargs))
        if self.error is not None:
            raise self.error
        return self.returns


class FakeAdobeNamespace:
    """Adobe client sub-namespace (customer/offer) routing every method to one stub."""

    def __init__(self, call):
        self._call = call

    def __getattr__(self, name):
        return self._call


class FakeAdobeClient:
    """Fake Adobe client exposing customer, offer, order and recommendation namespaces."""

    def __init__(self, call):
        self.customer = FakeAdobeNamespace(call)
        self.offer = FakeAdobeNamespace(call)
        self.order = FakeAdobeNamespace(call)
        self.recommendation = FakeAdobeNamespace(call)


class FakeAgreements:
    """Fake agreements service returning a preset agreement or raising, recording ids."""

    def __init__(self):
        self.agreement = None
        self.error = None
        self.get_by_id_calls = []

    async def get_by_id(self, agreement_id):
        self.get_by_id_calls.append(agreement_id)
        if self.error is not None:
            raise self.error
        return self.agreement


class FakeSubscriptions:
    """Fake subscriptions service returning a preset subscription or raising, recording ids."""

    def __init__(self):
        self.subscription = None
        self.error = None
        self.get_by_id_calls = []

    async def get_by_id(self, subscription_id):
        self.get_by_id_calls.append(subscription_id)
        if self.error is not None:
            raise self.error
        return self.subscription


class FakeMPTApiService:
    """Fake MPT API service exposing the agreements and subscriptions accessors."""

    def __init__(self, agreements, subscriptions=None):
        self.agreements = agreements
        self.subscriptions = subscriptions


class FakeExtSettings:
    """Fake extension settings exposing the allowed product ids."""

    def __init__(self, product_ids):
        self.product_ids = product_ids


class FakeContext:
    """Fake request context mirroring the fields the router handlers read."""

    def __init__(
        self, agreements, adobe, product_ids, subscriptions=None, account_type=AccountType.CLIENT
    ):
        self.mpt_api_service = FakeMPTApiService(agreements, subscriptions)
        self.ext_settings = FakeExtSettings(product_ids)
        self.adobe_client = adobe
        self.state = {}
        self.auth = AuthContext(
            token=_FAKE_JWT,
            account=Account(id="ACC-0001", type=account_type),
            permissions={},
            extension_id="EXT-0001",
        )


class AgreementSetter:
    """Callable that installs the preset agreement on the fake agreements service."""

    def __init__(self, agreements):
        self._agreements = agreements

    def __call__(self, agreement):
        self._agreements.agreement = agreement
        return agreement


@pytest.fixture
def allowed_product_id():
    return "PRD-1111-1111"


@pytest.fixture
def disallowed_product_id():
    return "PRD-9999-9999"


@pytest.fixture
def adobe_call():
    return FakeAdobeCall()


@pytest.fixture
def fake_agreements():
    return FakeAgreements()


@pytest.fixture
def fake_subscriptions():
    return FakeSubscriptions()


@pytest.fixture
def fake_ctx(fake_agreements, fake_subscriptions, adobe_call, allowed_product_id):
    return FakeContext(
        agreements=fake_agreements,
        adobe=FakeAdobeClient(adobe_call),
        product_ids=(allowed_product_id,),
        subscriptions=fake_subscriptions,
    )


@pytest.fixture
def auth_context_factory():
    def factory(account_type):
        return AuthContext(
            token=_FAKE_JWT,
            account=Account(id="ACC-0001", type=account_type),
            permissions={},
            extension_id="EXT-0001",
        )

    return factory


@pytest.fixture
def patch_agreement(fake_agreements):
    return AgreementSetter(fake_agreements)


@pytest.fixture
def resolve_ids(patch_agreement, agreement_factory, fulfillment_customer_bag):
    patch_agreement(agreement_factory(parameter_bag=fulfillment_customer_bag))


@pytest.fixture
def recommendation_body():
    return RecommendationRequest.model_validate({
        "offers": [{"offerId": "OFFER-SOURCE", "quantity": 10}],
    })


@pytest.fixture
def recommendations_data():
    return {
        "productRecommendations": {
            "upsells": [],
            "crossSells": [{"rank": 0, "product": {"baseOfferId": "OFFER-CROSS"}}],
            "addOns": [],
        }
    }


@pytest.fixture
def tracker_headers():
    return {"x-recommendation-tracker-id": "TRACKER-1"}


@pytest.fixture
def adobe_recommendation_return(recommendations_data, tracker_headers):
    return (recommendations_data, tracker_headers)

import json

import pytest
from mpt_extension_sdk.api.auth.context import Account, AccountType, AuthContext

from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM
from mpt_adobe_vipm_ef.models.recommendation import RecommendationRequest
from mpt_adobe_vipm_ef.routers.api import subscriptions
from mpt_adobe_vipm_ef.settings import get_settings

_FAKE_JWT = "fake-token"
_MPT_API_BASE_URL = "https://api.dummy.test"


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
        self.update_calls = []
        self.update_error = None

    async def get_by_id(self, agreement_id):
        self.get_by_id_calls.append(agreement_id)
        if self.error is not None:
            raise self.error
        return self.agreement

    async def update(self, agreement_id, attributes):
        self.update_calls.append((agreement_id, attributes))
        if self.update_error is not None:
            raise self.update_error


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


class FakeEntity:
    """API entity exposing the payload the API returned for it."""

    def __init__(self, payload):
        self.payload = payload

    def to_dict(self):
        return self.payload


class FakeResource:
    """Fake API resource returning a preset payload or raising, recording its calls."""

    def __init__(self, payload=None):
        self.payload = payload
        self.error = None
        self.select_errors = {}
        self.calls = []

    async def get(self, resource_id, select=None):
        self.calls.append((resource_id, select))
        error = self.select_errors.get(select, self.error)
        if error is not None:
            raise error
        return FakeEntity(self.payload)


class FakeCommerce:
    """Commerce namespace of the caller client, exposing agreements and subscriptions."""

    def __init__(self, agreement=None, subscription=None):
        self.agreements = FakeResource(agreement)
        self.subscriptions = FakeResource(subscription)


class FakeAccounts:
    """Accounts namespace of the caller client, exposing the account resources."""

    def __init__(self, related):
        self.licensees = FakeResource(related.get("licensee"))
        self.buyers = FakeResource(related.get("buyer"))
        self.sellers = FakeResource(related.get("seller"))


class FakeCallerClient:
    """Fake caller-authenticated client the subscription sync enriches the payload with."""

    def __init__(self, related=None, split=None, audit=None):
        entities = related or {}
        self.commerce = FakeCommerce(
            agreement=entities.get("agreement"),
            subscription={"lines": [], "split": split, "audit": audit},
        )
        self.accounts = FakeAccounts(entities)


class FakeItemsLookup:
    """Async stub of the catalog items lookup, returning preset item details."""

    def __init__(self, product_items=None):
        self.product_items = product_items or {}
        self.calls = []

    async def __call__(self, ctx, product_id, skus):
        self.calls.append((product_id, tuple(skus)))
        return self.product_items


class FakeMPTApiService:
    """Fake MPT API service exposing the agreements and subscriptions accessors."""

    def __init__(self, agreements, subscriptions=None):
        self.agreements = agreements
        self.subscriptions = subscriptions


class FakeRuntimeSettings:
    """Fake runtime settings exposing the MPT API base URL the icons resolve against."""

    def __init__(self, mpt_api_base_url=_MPT_API_BASE_URL):
        self.mpt_api_base_url = mpt_api_base_url


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
        self.runtime_settings = FakeRuntimeSettings()
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


@pytest.fixture
def asset_url():
    """The base the sync route resolves the entity icons against."""
    return f"{_MPT_API_BASE_URL}/public"


@pytest.fixture
def audit_payload():
    return {"created": {"at": "2000-01-01T00:00:00.000Z"}}


@pytest.fixture
def item_details(audit_payload):
    """The catalog details the items lookup adds to a subscription line item."""
    return {
        "name": "Dummy Item",
        "status": "Published",
        "terms": {"period": "dummy-period", "commitment": "dummy-commitment"},
        "audit": audit_payload,
        "product": {"id": "PRD-1", "name": "Dummy Product"},
        "vendor": {"id": "ACC-0000-0000", "name": "Dummy Vendor"},
    }


@pytest.fixture
def sync_setup(fake_ctx, fake_subscriptions, patch_caller_client):
    """Set the sync route up for a payload, returning its context and caller client."""

    def factory(payload, *, related=None, split=None, audit=None, product_items=None):
        fake_subscriptions.subscription = FakeEntity(payload)
        client = FakeCallerClient(related=related, split=split, audit=audit)
        patch_caller_client(client, product_items)
        return fake_ctx, client

    return factory


@pytest.fixture
def plug_env(monkeypatch):
    """Provide the product configuration plug metadata is built from, with no feature flags."""
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))
    monkeypatch.delenv("EXT_FEATURES", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def patch_caller_client(mocker):
    """Serve the given caller client to the sync route, with the items lookup stubbed."""

    def factory(client, product_items=None):
        mocker.patch.object(subscriptions, "build_caller_client", return_value=client)
        mocker.patch.object(subscriptions, "resolve_items_by_sku", FakeItemsLookup(product_items))

    return factory

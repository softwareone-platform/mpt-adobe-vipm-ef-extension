import http

import pytest
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    UpstreamServiceError,
    ValidationError,
)

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.routers.api.offer import get_offer_switch_paths

_AGREEMENT_ID = "AGR-1234-5678"
_SUBSCRIPTION_ID = "SUB-0000-0000"

_ADOBE_API_ERROR = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Bad"})
_ADOBE_CONFIG_ERROR = AdobeError("Config error")

_UNIT_SP = 12.5


def _switch_paths():
    return {
        "productUpgrades": [
            {
                "targetList": [
                    {"targetBaseOfferId": "OFFERAAAAA-extra"},
                    {"targetBaseOfferId": "OFFERBBBBB-extra"},
                ],
            },
        ],
    }


def _items_map():
    return {"OFFERAAAAA": {"id": "ITM-1", "name": "Item A", "externalId": "OFFERAAAAA"}}


class FakeResolveItems:
    """Async stub for resolve_items_by_sku returning a preset item map."""

    def __init__(self, product_items):
        self._product_items = product_items

    async def __call__(self, ctx, product_id, skus):
        return self._product_items


class FakeUnitPrices:
    """Async stub for get_unit_selling_prices returning a preset price map."""

    def __init__(self, prices):
        self._prices = prices

    async def __call__(self, ctx, agreement_id, item_ids):
        return self._prices


class FakeAgreementSubscriptions:
    """Async stub for resolve_agreement_subscriptions_by_sku, recording its calls."""

    def __init__(self, subscriptions_by_sku):
        self._subscriptions_by_sku = subscriptions_by_sku
        self.calls = []

    async def __call__(self, ctx, agreement_id, source_subscription_id):
        self.calls.append((agreement_id, source_subscription_id))
        return self._subscriptions_by_sku


def _patch_enrichment(monkeypatch, product_items, prices, subscriptions_by_sku=None):
    monkeypatch.setattr(
        "mpt_adobe_vipm_ef.routers.api.offer.resolve_items_by_sku",
        FakeResolveItems(product_items),
    )
    monkeypatch.setattr(
        "mpt_adobe_vipm_ef.routers.api.offer.get_unit_selling_prices",
        FakeUnitPrices(prices),
    )
    fake_subscriptions = FakeAgreementSubscriptions(subscriptions_by_sku or {})
    monkeypatch.setattr(
        "mpt_adobe_vipm_ef.routers.api.offer.resolve_agreement_subscriptions_by_sku",
        fake_subscriptions,
    )
    return fake_subscriptions


async def test_get_offer_switch_paths_resolves_ids_and_returns_enriched_payload(
    fake_ctx, resolve_ids, adobe_call, monkeypatch
):
    adobe_call.returns = _switch_paths()
    _patch_enrichment(monkeypatch, _items_map(), {})

    result = await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)  # act

    targets = result.payload["productUpgrades"][0]["targetList"]
    assert targets[0]["item"]["externalId"] == "OFFERAAAAA"
    assert targets[1]["item"] is None


async def test_get_offer_switch_paths_enrichment_attaches_item_name_and_price(
    fake_ctx, resolve_ids, adobe_call, monkeypatch
):
    adobe_call.returns = _switch_paths()
    _patch_enrichment(
        monkeypatch,
        {"OFFERAAAAA": {"id": "ITM-1", "name": "Item A"}},
        {"ITM-1": _UNIT_SP},
    )

    result = await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)  # act

    target_list = result.payload["productUpgrades"][0]["targetList"]
    assert target_list[0]["item"]["name"] == "Item A"
    assert target_list[0]["item"]["unitSP"] == pytest.approx(_UNIT_SP)


async def test_get_offer_switch_paths_attaches_existing_agreement_subscription(
    fake_ctx, resolve_ids, adobe_call, monkeypatch
):
    adobe_call.returns = _switch_paths()
    existing = {"id": "SUB-1111-1111", "name": "Sub A", "status": "Active", "quantity": 20}
    fake_subscriptions = _patch_enrichment(
        monkeypatch, _items_map(), {}, subscriptions_by_sku={"OFFERAAAAA": existing}
    )

    result = await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)  # act

    targets = result.payload["productUpgrades"][0]["targetList"]
    assert targets[0]["subscription"] == existing
    assert targets[1]["subscription"] is None
    assert fake_subscriptions.calls == [(_AGREEMENT_ID, _SUBSCRIPTION_ID)]


async def test_get_offer_switch_paths_skips_targets_without_offer_id(
    fake_ctx, resolve_ids, adobe_call, monkeypatch
):
    adobe_call.returns = {"productUpgrades": [{"targetList": [{"sequence": 1}]}]}
    _patch_enrichment(monkeypatch, {}, {})

    offer_paths = await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)  # act

    result = offer_paths.payload["productUpgrades"][0]["targetList"]
    assert "item" not in result[0]


@pytest.mark.parametrize(
    "scenario",
    [
        (_ADOBE_API_ERROR, UpstreamServiceError),
        (
            AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "Service Unavailable"),
            UpstreamServiceError,
        ),
        (_ADOBE_CONFIG_ERROR, ValidationError),
    ],
)
async def test_get_offer_switch_paths_maps_adobe_errors_to_api_errors(
    fake_ctx, resolve_ids, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)


async def test_get_offer_switch_paths_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await get_offer_switch_paths(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx)

import pytest
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.api.errors import UpstreamServiceError

from mpt_adobe_vipm_ef.services.subscriptions import (
    fetch_agreement_subscriptions,
    fetch_agreement_subscriptions_by_sku,
    find_existing_target_line,
    resolve_agreement_subscriptions_by_sku,
)
from mpt_adobe_vipm_ef.services.switch_order import ExistingTargetLine

_AGREEMENT_ID = "AGR-1234-5678"
_SOURCE_VENDOR_ID = "adobe-sub-source"
_LINE_QUANTITY = 20
_SOURCE_QUANTITY = 50


def _build_ctx(mocker, subscriptions, *, error=None):
    iterator = mocker.MagicMock()
    iterator.__aiter__.return_value = subscriptions
    query = mocker.Mock()
    if error is None:
        query.iterate.return_value = iterator
    else:
        query.iterate.side_effect = error
    subscriptions_service = mocker.Mock()
    subscriptions_service.filter.return_value.select.return_value = query

    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(
        client=mocker.Mock(commerce=mocker.Mock(subscriptions=subscriptions_service)),
    )
    return ctx


def _subscription(mocker, sub_id, name, vendor_id, lines):
    result = mocker.Mock(
        id=sub_id,
        status="Active",
        external_ids=mocker.Mock(vendor=vendor_id),
        lines=lines,
    )
    result.name = name
    return result


def _line(mocker, sku, quantity, line_id="ALI-0002"):
    external_ids = mocker.Mock(vendor=sku)
    return mocker.Mock(id=line_id, item=mocker.Mock(external_ids=external_ids), quantity=quantity)


async def test_fetch_agreement_subscriptions_returns_the_live_subscription_payloads(mocker):
    payload = {"id": "SUB-1", "status": "Active", "lines": [{"id": "ALI-0002"}]}
    subscription = mocker.Mock()
    subscription.to_dict.return_value = payload
    ctx = _build_ctx(mocker, [subscription])

    result = await fetch_agreement_subscriptions(ctx, _AGREEMENT_ID)

    assert result == [payload]


async def test_fetch_agreement_subscriptions_propagates_mpt_errors(mocker):
    ctx = _build_ctx(mocker, [], error=MPTError("boom"))

    with pytest.raises(MPTError):
        await fetch_agreement_subscriptions(ctx, _AGREEMENT_ID)


async def test_resolve_agreement_subscriptions_by_sku_maps_lines_to_subscriptions(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _subscription(
                mocker,
                "SUB-1",
                "Sub One",
                "adobe-sub-1",
                [_line(mocker, "SKU0000001", _LINE_QUANTITY)],
            ),
        ],
    )

    result = await resolve_agreement_subscriptions_by_sku(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID)

    assert result == {
        "SKU0000001": {
            "id": "SUB-1",
            "name": "Sub One",
            "status": "Active",
            "quantity": _LINE_QUANTITY,
            "lineId": "ALI-0002",
        },
    }


async def test_resolve_agreement_subscriptions_by_sku_excludes_the_source_subscription(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _subscription(
                mocker,
                "SUB-1",
                "Source Sub",
                _SOURCE_VENDOR_ID,
                [_line(mocker, "SKU0000001", _SOURCE_QUANTITY)],
            ),
        ],
    )

    result = await resolve_agreement_subscriptions_by_sku(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID)

    assert result == {}


async def test_resolve_agreement_subscriptions_by_sku_skips_lines_without_sku(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _subscription(
                mocker,
                "SUB-1",
                "Sub One",
                "adobe-sub-1",
                [_line(mocker, None, _LINE_QUANTITY)],
            ),
        ],
    )

    result = await resolve_agreement_subscriptions_by_sku(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID)

    assert result == {}


async def test_resolve_agreement_subscriptions_by_sku_returns_empty_on_mpt_error(mocker):
    ctx = _build_ctx(mocker, [], error=MPTError("boom"))

    result = await resolve_agreement_subscriptions_by_sku(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID)

    assert result == {}


async def test_fetch_agreement_subscriptions_by_sku_propagates_mpt_errors(mocker):
    ctx = _build_ctx(mocker, [], error=MPTError("boom"))

    with pytest.raises(MPTError):
        await fetch_agreement_subscriptions_by_sku(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID)


async def test_find_existing_target_line_returns_the_line_holding_the_sku(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _subscription(
                mocker,
                "SUB-1",
                "Sub One",
                "adobe-sub-1",
                [_line(mocker, "SKU0000001", _LINE_QUANTITY)],
            ),
        ],
    )

    result = await find_existing_target_line(
        ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID, "SKU0000001XXXXX"
    )

    assert result == ExistingTargetLine(id="ALI-0002", quantity=_LINE_QUANTITY)


async def test_find_existing_target_line_returns_none_when_the_sku_is_not_held(mocker):
    ctx = _build_ctx(mocker, [])

    result = await find_existing_target_line(
        ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID, "SKU0000001XXXXX"
    )

    assert result is None


async def test_find_existing_target_line_maps_mpt_errors_to_upstream_error(mocker):
    ctx = _build_ctx(mocker, [], error=MPTError("boom"))

    with pytest.raises(UpstreamServiceError):
        await find_existing_target_line(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID, "SKU0000001XXXXX")


async def test_find_existing_target_line_rejects_incomplete_line_data(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _subscription(
                mocker,
                "SUB-1",
                "Sub One",
                "adobe-sub-1",
                [_line(mocker, "SKU0000001", _LINE_QUANTITY, line_id=None)],
            ),
        ],
    )

    with pytest.raises(UpstreamServiceError):
        await find_existing_target_line(ctx, _AGREEMENT_ID, _SOURCE_VENDOR_ID, "SKU0000001XXXXX")

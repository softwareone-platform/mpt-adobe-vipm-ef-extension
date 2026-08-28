import pytest
from mpt_extension_sdk.api import UpstreamServiceError, ValidationError
from mpt_extension_sdk.models import Subscription
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.constants import EARLY_RENEWAL_NO_CHANGE_ITEM
from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_plan import (  # noqa: WPS235
    NetNewLine,
    PlanSubscription,
    build_preview_renewal_line_items,
    build_renewal_payload,
    has_renewed_removal,
    require_no_renewed_seat_reduction,
    require_renewal_changes,
    require_renewal_selections,
    resolve_net_new_offer_ids,
    resolve_no_change_line,
)

_SUBSCRIPTION_ID = "SUB-1234-5678"
_LINE_ID = "ALI-0001"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_SKU = "65304481CA"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CURRENT_QUANTITY = 10
_MARKET_SEGMENT = "COM"


def _request(subscriptions=None, net_new_items=None, **extra):  # noqa: WPS432
    return RenewalOrderRequest.model_validate({
        "subscriptions": [] if subscriptions is None else subscriptions,
        "netNewItems": [] if net_new_items is None else net_new_items,
        **extra,
    })


def _selection(*, renew=True, quantity=7, subscription_id=_SUBSCRIPTION_ID, codes=None):  # noqa: WPS432
    return {
        "id": subscription_id,
        "offerId": _OFFER_ID,
        "renew": renew,
        "renewalQuantity": quantity,
        "flexDiscountCodes": [] if codes is None else codes,
    }


def _subscription(*, subscription_id=_SUBSCRIPTION_ID, auto_renew=True):
    return Subscription.model_validate({
        "id": subscription_id,
        "name": f"Subscription for {subscription_id}",
        "autoRenew": auto_renew,
        "lines": [
            {
                "id": _LINE_ID,
                "quantity": _CURRENT_QUANTITY,
                "item": {"id": "ITM-0001", "name": "Item One"},
            }
        ],
    })


def _plan(request, *, auto_renew=True, current_quantity=_CURRENT_QUANTITY, renewed_quantity=0):
    return [
        PlanSubscription(
            selection=selection,
            line_id=_LINE_ID,
            current_quantity=current_quantity,
            adobe_subscription_id=_ADOBE_SUBSCRIPTION_ID,
            offer_id=selection.offer_id,
            subscription=_subscription(subscription_id=selection.id, auto_renew=auto_renew),
            renewed_quantity=renewed_quantity,
        )
        for selection in request.subscriptions
    ]


def test_require_renewal_selections_rejects_an_empty_plan():
    with pytest.raises(ValidationError, match="at least one subscription"):
        require_renewal_selections(_request())


def test_require_renewal_selections_accepts_a_lapse_without_quantity():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    require_renewal_selections(request)  # act


def test_require_renewal_selections_accepts_a_net_new_only_plan():
    request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    require_renewal_selections(request)  # act


def test_build_preview_renewal_line_items_carries_the_selection_and_codes():
    request = _request(subscriptions=[_selection(codes=["ABCD-XV54-HG34-78YT"])])

    result = build_preview_renewal_line_items(_plan(request))

    assert result == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 7,
            "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
        },
    ]


def test_build_preview_renewal_line_items_scopes_each_code_to_its_own_line():
    """A code picked for one line must never ride the other lines of the quote."""
    request = _request(
        subscriptions=[
            _selection(codes=["CODE-FIRST"]),
            _selection(subscription_id="SUB-9999-0001", codes=["CODE-SECOND"]),
        ],
    )

    result = build_preview_renewal_line_items(_plan(request))

    assert result[0]["flexDiscountCodes"] == ["CODE-FIRST"]
    assert result[1]["flexDiscountCodes"] == ["CODE-SECOND"]


def test_build_preview_renewal_line_items_omits_codes_when_none_selected():
    request = _request(subscriptions=[_selection()])

    result = build_preview_renewal_line_items(_plan(request))

    assert "flexDiscountCodes" not in result[0]


def test_build_preview_renewal_line_items_skips_lapsing_subscriptions():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    result = build_preview_renewal_line_items(_plan(request))

    assert result == []


def test_build_preview_renewal_line_items_carries_the_early_renewal_additions():
    """Only a preview carrying the additions can reject a renew-and-add basket.

    A net-new line has no Adobe subscription to renew, so it is identified by
    its offer id alone, and it numbers after the renewing lines.
    """
    request = _request(
        subscriptions=[_selection()],
        net_new_items=[
            {
                "offerId": _NET_NEW_SKU,
                "quantity": 5,
                "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
            },
        ],
        renewalPath="now",
    )
    net_new_lines = [
        NetNewLine(
            selection=request.net_new_items[0],
            item_id="ITM-NET-NEW",
            offer_id=_NET_NEW_OFFER_ID,
        ),
    ]

    result = build_preview_renewal_line_items(_plan(request), net_new_lines)

    assert "flexDiscountCodes" not in result[0]
    assert result[1] == {
        "extLineItemNumber": 2,
        "offerId": _NET_NEW_OFFER_ID,
        "quantity": 5,
        "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
    }


def test_build_preview_renewal_line_items_numbers_an_add_only_basket_from_one():
    request = _request(
        subscriptions=[_selection(renew=False, quantity=0)],
        net_new_items=[{"offerId": _NET_NEW_SKU, "quantity": 5}],
        renewalPath="now",
    )
    net_new_lines = [
        NetNewLine(
            selection=request.net_new_items[0],
            item_id="ITM-NET-NEW",
            offer_id=_NET_NEW_OFFER_ID,
        ),
    ]

    result = build_preview_renewal_line_items(_plan(request), net_new_lines)

    assert result == [
        {"extLineItemNumber": 1, "offerId": _NET_NEW_OFFER_ID, "quantity": 5},
    ]


def test_build_preview_renewal_line_items_quotes_only_the_remaining_delta():
    """A previous early renewal's seats are already priced and must not be quoted again."""
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)], renewalPath="now")

    result = build_preview_renewal_line_items(_plan(request, renewed_quantity=4))

    assert result == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 6,
        },
    ]


def test_build_preview_renewal_line_items_drops_an_already_covered_subscription():
    """A zero delta has nothing left to renew, so the line leaves the quote entirely."""
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)], renewalPath="now")

    result = build_preview_renewal_line_items(_plan(request, renewed_quantity=_CURRENT_QUANTITY))

    assert result == []


def test_build_renewal_payload_snapshots_the_whole_plan():
    request = _request(
        subscriptions=[
            _selection(codes=["BLACK_FRIDAY"]),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
        net_new_items=[
            {"offerId": _NET_NEW_SKU, "quantity": 5, "flexDiscountCodes": ["CYBER_MONDAY"]},
        ],
        recommendationTrackerId="TRACKER-1",
    )
    net_new_lines = [
        NetNewLine(
            selection=request.net_new_items[0],
            item_id="ITM-NET-NEW",
            offer_id=_NET_NEW_OFFER_ID,
        ),
    ]

    result = build_renewal_payload(_plan(request), net_new_lines, request, "USD")

    assert result.to_dict() == {
        "renewalPath": "anniversary",
        "recommendationTrackerId": "TRACKER-1",
        "currencyCode": "USD",
        "subscriptions": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "renewedQuantity": 0,
                "flexDiscountCodes": ["BLACK_FRIDAY"],
            },
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": False,
                "renewalQuantity": 0,
                "renewedQuantity": 0,
                "flexDiscountCodes": [],
            },
        ],
        "netNewItems": [
            {
                "offerId": _NET_NEW_OFFER_ID,
                "quantity": 5,
                "flexDiscountCodes": ["CYBER_MONDAY"],
            },
        ],
    }


def test_build_renewal_payload_keeps_codes_off_lapsing_subscriptions():
    request = _request(
        subscriptions=[_selection(renew=False, quantity=0, codes=["BLACK_FRIDAY"])],
    )

    result = build_renewal_payload(_plan(request), [], request, "USD")

    assert result.subscriptions[0].flex_discount_codes == []


def test_build_renewal_payload_defaults_the_optional_fields():
    request = _request(subscriptions=[_selection()], recommendationTrackerId="")

    result = build_renewal_payload(_plan(request), [], request, "USD")

    payload = result.to_dict()
    assert not payload["recommendationTrackerId"]
    assert payload["netNewItems"] == []


def test_build_renewal_payload_snapshots_the_early_renewal_path():
    """The path is the discriminator fulfilment routes the snapshot on."""
    request = _request(subscriptions=[_selection()], renewalPath="now")

    result = build_renewal_payload(_plan(request), [], request, "USD")

    assert result.to_dict()["renewalPath"] == "now"


def test_build_renewal_payload_snapshots_the_delta_still_to_renew():
    """On the now path the snapshot carries what this order still has to renew.

    A previous RENEWAL order already covered part of the total, so fulfilment
    must only execute the difference.
    """
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)], renewalPath="now")

    result = build_renewal_payload(_plan(request, renewed_quantity=4), [], request, "USD")

    assert result.subscriptions[0].renewal_quantity == 6


def test_build_renewal_payload_keeps_a_fully_covered_subscription_with_a_zero_delta():
    """An already-covered subscription still rides the snapshot.

    Its zero delta tells fulfilment to keep it active without re-renewing it.
    """
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)], renewalPath="now")

    result = build_renewal_payload(
        _plan(request, renewed_quantity=_CURRENT_QUANTITY), [], request, "USD"
    )

    assert result.subscriptions[0].renewal_quantity == 0
    assert result.subscriptions[0].renew is True


def test_build_renewal_payload_snapshots_the_removal_of_a_renewed_subscription():
    """Taking back a mistaken early renewal rides the snapshot as a removal.

    ``renew`` off with the observed renewed baseline (and no negative
    quantity) is what tells fulfilment to place a RETURN order for those
    seats rather than treat the line as a plain lapse.
    """
    request = _request(subscriptions=[_selection(renew=False, quantity=0)], renewalPath="now")

    result = build_renewal_payload(_plan(request, renewed_quantity=4), [], request, "USD")

    assert result.subscriptions[0].renew is False
    assert result.subscriptions[0].renewal_quantity == 0
    assert result.subscriptions[0].renewed_quantity == 4


def test_require_no_renewed_seat_reduction_accepts_a_plan_renewing_forward():
    request = _request(
        subscriptions=[
            _selection(quantity=_CURRENT_QUANTITY),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
        renewalPath="now",
    )

    require_no_renewed_seat_reduction(_plan(request, renewed_quantity=0))  # act


def test_require_no_renewed_seat_reduction_accepts_an_already_covered_subscription():
    """A total matching what is already renewed is a zero delta, not a reduction."""
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)], renewalPath="now")

    require_no_renewed_seat_reduction(  # act
        _plan(request, renewed_quantity=_CURRENT_QUANTITY)
    )


def test_require_no_renewed_seat_reduction_accepts_removing_a_renewed_subscription():
    """Taking a renewed subscription off the renewal is a full return, which is supported."""
    request = _request(subscriptions=[_selection(renew=False, quantity=0)], renewalPath="now")

    require_no_renewed_seat_reduction(_plan(request, renewed_quantity=4))  # act


def test_require_no_renewed_seat_reduction_rejects_a_total_below_the_renewed_seats():
    """A renewing line cannot ask below the renewed seats: a partial return is unsupported."""
    request = _request(subscriptions=[_selection(quantity=7)], renewalPath="now")

    with pytest.raises(ValidationError, match="cannot renew fewer seats"):
        require_no_renewed_seat_reduction(_plan(request, renewed_quantity=8))


def test_has_renewed_removal_flags_a_switched_off_renewed_subscription():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)], renewalPath="now")

    result = has_renewed_removal(_plan(request, renewed_quantity=4))

    assert result is True


def test_has_renewed_removal_ignores_lapses_and_renewing_lines():
    """A lapse of a never-renewed subscription has nothing to return."""
    request = _request(
        subscriptions=[
            _selection(quantity=_CURRENT_QUANTITY),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
        renewalPath="now",
    )

    result = has_renewed_removal(_plan(request, renewed_quantity=0))

    assert result is False


def test_require_renewal_changes_accepts_a_quantity_change():
    request = _request(subscriptions=[_selection(quantity=37)])  # noqa: WPS432

    require_renewal_changes(request, _plan(request), [])  # act


def test_require_renewal_changes_accepts_an_autorenew_change():
    request = _request(subscriptions=[_selection(renew=False, quantity=_CURRENT_QUANTITY)])

    require_renewal_changes(request, _plan(request, auto_renew=True), [])  # act


def test_require_renewal_changes_accepts_a_net_new_only_plan():
    net_new_request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])
    net_new_lines = [
        NetNewLine(
            selection=net_new_request.net_new_items[0],
            item_id="ITM-NET-NEW",
            offer_id=_NET_NEW_OFFER_ID,
        ),
    ]

    require_renewal_changes(net_new_request, [], net_new_lines)  # act


def test_require_renewal_changes_rejects_a_pure_no_op_plan():
    request = _request(subscriptions=[_selection(renew=True, quantity=_CURRENT_QUANTITY)])

    with pytest.raises(ValidationError, match="no changes to submit"):
        require_renewal_changes(request, _plan(request, auto_renew=True), [])


def test_require_renewal_changes_accepts_an_unchanged_early_renewal():
    """Renewing before the anniversary is the change, so nothing else has to move."""
    request = _request(
        subscriptions=[_selection(renew=True, quantity=_CURRENT_QUANTITY)],
        renewalPath="now",
    )

    require_renewal_changes(request, _plan(request, auto_renew=True), [])  # act


def test_require_renewal_changes_rejects_an_unchanged_lapse():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    with pytest.raises(ValidationError, match="no changes to submit"):
        require_renewal_changes(request, _plan(request, auto_renew=False), [])


@pytest.fixture
def sku_mapping_store(mocker):
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.sku_mapping.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_full_skus.return_value = {_NET_NEW_SKU: _NET_NEW_OFFER_ID}
    return store


@pytest.fixture
def ctx(mocker):
    return mocker.Mock()


def _net_new_line(*, offer_id=_NET_NEW_SKU, quantity=5):
    request = _request(net_new_items=[{"offerId": offer_id, "quantity": quantity}])
    return NetNewLine(
        selection=request.net_new_items[0],
        item_id="ITM-NET-NEW",
        offer_id=offer_id,
    )


async def test_resolve_net_new_offer_ids_reads_the_full_sku_from_the_mapping(
    ctx, sku_mapping_store
):
    result = await resolve_net_new_offer_ids(ctx, [_net_new_line()], lambda: _MARKET_SEGMENT)

    assert result[0].offer_id == _NET_NEW_OFFER_ID
    sku_mapping_store.list_full_skus.assert_called_once_with([_NET_NEW_SKU], _MARKET_SEGMENT)


async def test_resolve_net_new_offer_ids_looks_up_by_the_partial_sku(ctx, sku_mapping_store):
    """A wizard already holding a full offer id still resolves through the mapping."""
    result = await resolve_net_new_offer_ids(
        ctx, [_net_new_line(offer_id=_NET_NEW_OFFER_ID)], lambda: _MARKET_SEGMENT
    )

    assert result[0].offer_id == _NET_NEW_OFFER_ID
    sku_mapping_store.list_full_skus.assert_called_once_with([_NET_NEW_SKU], _MARKET_SEGMENT)


async def test_resolve_net_new_offer_ids_skips_the_lookup_without_lines(ctx, sku_mapping_store):
    result = await resolve_net_new_offer_ids(ctx, [], lambda: _MARKET_SEGMENT)

    assert result == []
    sku_mapping_store.list_full_skus.assert_not_called()


async def test_resolve_net_new_offer_ids_rejects_an_unmapped_offer(ctx, sku_mapping_store):
    sku_mapping_store.list_full_skus.return_value = {}

    with pytest.raises(ValidationError, match="no full Adobe SKU mapping"):
        await resolve_net_new_offer_ids(ctx, [_net_new_line()], lambda: _MARKET_SEGMENT)


async def test_resolve_net_new_offer_ids_maps_store_failures_to_upstream_errors(
    ctx, sku_mapping_store
):
    sku_mapping_store.list_full_skus.side_effect = RequestsConnectionError("boom")

    with pytest.raises(UpstreamServiceError):
        await resolve_net_new_offer_ids(ctx, [_net_new_line()], lambda: _MARKET_SEGMENT)


_NO_CHANGE_ITEM_ID = "ITM-NO-CHANGE"
_PRODUCT_ID = "PRD-1111-1111"


@pytest.fixture
def agreement(mocker):
    fake_agreement = mocker.Mock()
    fake_agreement.product.id = _PRODUCT_ID
    return fake_agreement


@pytest.fixture
def no_change_item(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.services.renewal_plan.resolve_items_by_sku",
        return_value={
            EARLY_RENEWAL_NO_CHANGE_ITEM: {
                "id": _NO_CHANGE_ITEM_ID,
                "name": "Early renewal (no changes)",
                "externalId": EARLY_RENEWAL_NO_CHANGE_ITEM,
            },
        },
    )


async def test_resolve_no_change_line_builds_the_placeholder_line(ctx, agreement, no_change_item):
    result = await resolve_no_change_line(ctx, agreement)

    assert result == {"item": {"id": _NO_CHANGE_ITEM_ID}, "quantity": 1}
    no_change_item.assert_awaited_once_with(ctx, _PRODUCT_ID, [EARLY_RENEWAL_NO_CHANGE_ITEM])


async def test_resolve_no_change_line_fails_when_the_item_is_missing(
    ctx, agreement, no_change_item
):
    """A catalog without the placeholder item cannot carry the unchanged plan."""
    no_change_item.return_value = {}

    with pytest.raises(UpstreamServiceError, match="placeholder item"):
        await resolve_no_change_line(ctx, agreement)

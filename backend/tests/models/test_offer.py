from mpt_adobe_vipm_ef.models.offer import (
    AgreementSubscription,
    OfferSwitchPaths,
    OfferTarget,
    ProductItem,
)
from tests.models.conftest import OFFER_ID, UNIT_SP


def test_product_item_from_payload_maps_aliases(product_item_payload):
    result = ProductItem.from_payload(product_item_payload)

    assert result.id == "ITM-1"
    assert result.external_id == OFFER_ID
    assert result.unit_sp == UNIT_SP


def test_product_item_to_dict_uses_aliases_and_excludes_unset():
    result = ProductItem.from_payload({"id": "ITM-1", "name": "Item A"}).to_dict()

    assert result == {"id": "ITM-1", "name": "Item A"}


def test_offer_switch_paths_parses_nested_structure(target_payload):
    result = OfferSwitchPaths.from_payload({"productUpgrades": [{"targetList": [target_payload]}]})

    target = result.product_upgrades[0].target_list[0]
    assert target.target_base_offer_id == OFFER_ID
    assert target.product_item is None


def test_offer_switch_paths_preserves_unknown_fields():
    payload = {"productUpgrades": [{"targetList": [{"sequence": 1}]}], "extra": "keep"}

    result = OfferSwitchPaths.from_payload(payload).to_dict()

    assert result["extra"] == "keep"
    assert result["productUpgrades"][0]["targetList"][0] == {"sequence": 1}


def test_offer_target_omits_unset_item(target_payload):
    result = OfferTarget.from_payload(target_payload).to_dict()

    assert "item" not in result


def test_offer_target_keeps_explicit_none_item(target_payload):
    target = OfferTarget.from_payload(target_payload)

    result = target.model_copy(update={"product_item": None}).to_dict()

    assert result["item"] is None


def test_offer_target_serializes_nested_product_item(target_payload, product_item_payload):
    product_item = ProductItem.from_payload(product_item_payload)
    target = OfferTarget.from_payload(target_payload)

    result = target.model_copy(update={"product_item": product_item}).to_dict()

    assert result["item"]["externalId"] == OFFER_ID
    assert result["item"]["unitSP"] == UNIT_SP


def test_offer_target_omits_unset_subscription(target_payload):
    result = OfferTarget.from_payload(target_payload).to_dict()

    assert "subscription" not in result


def test_offer_target_serializes_existing_agreement_subscription(target_payload):
    subscription = AgreementSubscription.from_payload(
        {"id": "SUB-1111-1111", "name": "Sub A", "status": "Active", "quantity": 20},
    )
    target = OfferTarget.from_payload(target_payload)

    result = target.model_copy(update={"subscription": subscription}).to_dict()

    assert result["subscription"] == {
        "id": "SUB-1111-1111",
        "name": "Sub A",
        "status": "Active",
        "quantity": 20,
    }

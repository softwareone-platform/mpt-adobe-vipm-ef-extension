import pytest

OFFER_ID = "OFFER"
UNIT_SP = 12.5


@pytest.fixture
def product_id():
    return "PRD-1111-1111"


@pytest.fixture
def segment():
    return "COM"


@pytest.fixture
def product_item_payload():
    return {"id": "ITM-1", "name": "Item A", "externalId": OFFER_ID, "unitSP": UNIT_SP}


@pytest.fixture
def target_payload():
    return {"targetBaseOfferId": OFFER_ID}


@pytest.fixture
def recommendations_payload():
    return {
        "productRecommendations": {
            "upsells": [],
            "crossSells": [{"rank": 0, "product": {"baseOfferId": "OFFER-CROSS"}}],
            "addOns": [{"rank": 1, "product": {"baseOfferId": "OFFER-ADDON"}}],
        }
    }

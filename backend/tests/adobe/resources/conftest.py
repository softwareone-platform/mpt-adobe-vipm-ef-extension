import pytest


@pytest.fixture
def recommendations_url():
    return "https://api.adobe.io/v3/recommendations"


@pytest.fixture
def recommendation_args():
    return {
        "authorization_id": "AUT-1234-5678",
        "customer_id": "CUST-001",
        "offers": [{"offerId": "OFFER-SOURCE", "quantity": 10}],
    }


@pytest.fixture
def recommendations_data():
    return {"productRecommendations": {"upsells": [], "crossSells": [], "addOns": []}}

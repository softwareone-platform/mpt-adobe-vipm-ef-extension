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


@pytest.fixture
def subscriptions_url():
    return "https://api.adobe.io/v3/customers/CUST-001/subscriptions"


@pytest.fixture
def create_subscription_args():
    return {
        "authorization_id": "AUT-1234-5678",
        "customer_id": "CUST-001",
        "offer_id": "OFFER-NEW",
        "renewal_quantity": 10,
        "recommendation_tracker_id": "TRACKER-1",
    }


@pytest.fixture
def create_subscription_optional_args():
    return {
        "renewal_code": "RENEWAL-CODE",
        "flex_discount_codes": ["DISCOUNT-CODE"],
        "currency_code": "USD",
        "deployment_id": "DEPLOY-001",
    }


@pytest.fixture
def scheduled_subscription_data():
    return {
        "subscriptionId": "SUB-001",
        "offerId": "OFFER-NEW",
        "currentQuantity": 0,
        "autoRenewal": {"enabled": True, "renewalQuantity": 10},
        "creationDate": "2026-07-11T02:42:15Z",
        "renewalDate": "2026-08-25",
        "status": "1009",
    }

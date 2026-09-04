import pytest
from mpt_extension_sdk.models import Agreement


@pytest.fixture
def agreement_payload():
    return {
        "id": "AGR-1234-5678",
        "name": "Test Agreement",
        "status": "Active",
        "product": {"id": "PRD-1111-1111", "name": "Test Product"},
        "client": {"id": "ACC-1111-1111", "name": "Client"},
        "seller": {"id": "ACC-2222-2222", "name": "Seller"},
        "buyer": {"id": "ACC-3333-3333", "name": "Buyer"},
        "lines": [{"id": "ALI-1"}, {"id": "ALI-2"}],
        "subscriptions": [{"id": "SUB-1"}],
        "assets": [],
    }


@pytest.fixture
def agreement_id():
    return "AGR-0000-0001"


@pytest.fixture
def split_payload():
    return {
        "id": "SBA-0000-0001",
        "revision": 1,
        "allocations": [
            {
                "buyer": {"id": "BUY-0000-0001", "name": "Dummy Buyer One"},
                "percentage": 100,
                "price": {"currency": "USD", "SPxY": 100, "SPxM": 10},
            },
            {
                "buyer": {"id": "BUY-0000-0002", "name": "Dummy Buyer Two"},
                "percentage": 0,
                "price": {"currency": "USD", "SPxY": 0, "SPxM": 0},
            },
        ],
    }


@pytest.fixture
def code_record_factory():
    """Build an Airtable discount code row, overriding any field."""

    def factory(**field_overrides):
        fields = {
            "Code": "SUMMER25",
            "name": "Summer 2025",
            "description": "20% off for renewals",
            "source": "Operations",
            "category": "STANDARD",
            "status": "ACTIVE",
            "discount_type": "PERCENTAGE",
            "market_segment": "COM",
            "start_date": "2026-06-01T00:00:00Z",
            "end_date": "2026-08-31T23:59:59Z",
            "target_offer_ids": "65322651CA02A12, 11083117CA01A12",
            "applicable_order_types": ["RENEWAL"],
            "supports_annual": True,
            "target_customer_id": "CUST-001",
        }
        fields.update(field_overrides)
        return {"id": "rec123", "fields": fields}

    return factory


@pytest.fixture
def agreement_factory():
    def factory(product_id="PRD-1111-1111", parameter_bag=None):
        payload = {
            "id": "AGR-1234-5678",
            "name": "Dummy Agreement",
            "client": {"id": "ACC-0000-0001", "name": "Dummy Client"},
            "licensee": {"id": "LCE-0000-0001", "name": "Dummy Licensee", "status": "active"},
            "product": {"id": product_id, "name": "Dummy Product"},
            "authorization": {"id": "AUT-123", "name": "Dummy Authorization", "currency": "USD"},
        }
        if parameter_bag is not None:
            payload["parameters"] = parameter_bag
        return Agreement.from_payload(payload)

    return factory

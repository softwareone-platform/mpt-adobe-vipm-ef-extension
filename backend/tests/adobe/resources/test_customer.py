import http

import pytest
from requests import HTTPError, JSONDecodeError

from adobe.enums import LinkedMembershipType
from adobe.errors import AdobeAPIError, AdobeHttpError

_SHA256_HEX_LENGTH = 36


def _mock_session_request(mocker, adobe_client, responses):
    return mocker.patch.object(adobe_client._transport._session, "request", side_effect=responses)


def _ok_response(mocker, json_body):
    mock = mocker.Mock()
    mock.json.return_value = json_body
    mock.status_code = 200
    return mock


def _error_response(mocker, status_code, json_data=None, raw_content=None, *, json_error=False):
    mock = mocker.Mock()
    mock.status_code = status_code
    if json_error:
        mock.json.side_effect = JSONDecodeError("msg", "doc", 0)
        mock.content = raw_content
    else:
        mock.json.return_value = json_data
    mock.raise_for_status.side_effect = HTTPError(response=mock)
    return mock


def _mock_get_then_patch(mocker, adobe_client, get_data, patch_data):
    responses = [_ok_response(mocker, get_data), _ok_response(mocker, patch_data)]
    return _mock_session_request(mocker, adobe_client, responses)


def _mock_get_then_error(mocker, adobe_client, get_data, error_resp):
    return _mock_session_request(mocker, adobe_client, [_ok_response(mocker, get_data), error_resp])


def _patch_call_kwargs(mock_request):
    return mock_request.call_args_list[1][1]


def _patch_payload(mock_request):
    return _patch_call_kwargs(mock_request)["json"]


def _first_benefit(mock_request):
    return _patch_payload(mock_request)["benefits"][0]


def test_get_customer_calls_correct_url_and_returns_data(mocker, adobe_client, customer_data):
    mock_request = _mock_session_request(
        mocker, adobe_client, [_ok_response(mocker, customer_data)]
    )

    result = adobe_client.customer.get_customer("AUT-1234-5678", "CUST-001")

    assert result == customer_data
    assert mock_request.call_args[0][1] == "https://api.adobe.io/v3/customers/CUST-001"


def test_get_customer_raises_adobe_api_error_on_http_error_with_json(mocker, adobe_client):
    error_resp = _error_response(
        mocker, http.HTTPStatus.NOT_FOUND, {"code": "1000", "message": "Customer not found"}
    )
    _mock_session_request(mocker, adobe_client, [error_resp])

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.customer.get_customer("AUT-1234-5678", "CUST-999")

    assert exc_info.value.status_code == http.HTTPStatus.NOT_FOUND


def test_get_customer_raises_adobe_http_error_when_response_has_no_json(mocker, adobe_client):
    error_resp = _error_response(
        mocker,
        http.HTTPStatus.SERVICE_UNAVAILABLE,
        raw_content=b"Service Unavailable",
        json_error=True,
    )
    _mock_session_request(mocker, adobe_client, [error_resp])

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.customer.get_customer("AUT-1234-5678", "CUST-001")

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE


def test_create_three_year_request_with_licenses_builds_payload_and_returns_response(
    mocker, adobe_client, customer_data
):
    expected = {**customer_data, "benefits": [{"type": "THREE_YEAR_COMMIT"}]}
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, expected)

    result = adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10}
    )

    payload = _patch_payload(mock_request)
    quantities = payload["benefits"][0]["commitmentRequest"]["minimumQuantities"]
    assert result == expected
    assert {"offerType": "LICENSE", "quantity": 10} in quantities
    assert payload["companyProfile"] == customer_data["companyProfile"]
    assert payload["globalSalesEnabled"] == customer_data["globalSalesEnabled"]
    assert "commitmentRequest" in payload["benefits"][0]


def test_create_three_year_request_preserves_enabled_global_sales_flag(
    mocker, adobe_client, customer_data
):
    global_customer = {**customer_data, "globalSalesEnabled": True}
    mock_request = _mock_get_then_patch(mocker, adobe_client, global_customer, global_customer)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10}
    )  # act

    assert _patch_payload(mock_request)["globalSalesEnabled"] is True


def test_create_three_year_request_with_consumables_adds_consumable_quantity(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCConsumables": 20}
    )  # act

    quantities = _first_benefit(mock_request)["commitmentRequest"]["minimumQuantities"]
    assert {"offerType": "CONSUMABLES", "quantity": 20} in quantities


def test_create_three_year_request_with_both_quantities_adds_both(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10, "3YCConsumables": 20}
    )  # act

    quantities = _first_benefit(mock_request)["commitmentRequest"]["minimumQuantities"]
    assert {"offerType": "LICENSE", "quantity": 10} in quantities
    assert {"offerType": "CONSUMABLES", "quantity": 20} in quantities


def test_create_three_year_request_is_recommitment_uses_recommitment_key(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10}, is_recommitment=True
    )  # act

    benefit = _first_benefit(mock_request)
    assert "recommitmentRequest" in benefit
    assert "commitmentRequest" not in benefit


def test_create_three_year_request_converts_string_quantity_to_int(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": "10"}
    )  # act

    quantities = _first_benefit(mock_request)["commitmentRequest"]["minimumQuantities"]
    quantity_value = quantities[0]["quantity"]
    assert quantity_value == 10
    assert isinstance(quantity_value, int)


def test_create_three_year_request_uses_sha256_as_correlation_id(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_three_year_request(
        "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10}
    )  # act

    headers = _patch_call_kwargs(mock_request)["headers"]
    assert len(headers["x-correlation-id"]) == _SHA256_HEX_LENGTH


def test_create_three_year_request_raises_adobe_api_error_on_patch_failure(
    mocker, adobe_client, customer_data
):
    error_resp = _error_response(
        mocker, http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Validation error"}
    )
    _mock_get_then_error(mocker, adobe_client, customer_data, error_resp)

    with pytest.raises(AdobeAPIError):
        adobe_client.customer.create_three_year_request(
            "AUT-1234-5678", "CUST-001", {"3YCLicenses": 10}
        )


def test_enable_global_sales_sets_flag_includes_company_profile_and_returns_response(
    mocker, adobe_client, customer_data
):
    expected = {**customer_data, "globalSalesEnabled": True}
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, expected)

    result = adobe_client.customer.enable_global_sales("AUT-1234-5678", "CUST-001")

    payload = _patch_payload(mock_request)
    assert result == expected
    assert payload["globalSalesEnabled"] is True
    assert payload["companyProfile"] == customer_data["companyProfile"]


def test_enable_global_sales_raises_adobe_api_error_on_patch_failure(
    mocker, adobe_client, customer_data
):
    error_resp = _error_response(
        mocker, http.HTTPStatus.FORBIDDEN, {"code": "4003", "message": "Forbidden"}
    )
    _mock_get_then_error(mocker, adobe_client, customer_data, error_resp)

    with pytest.raises(AdobeAPIError):
        adobe_client.customer.enable_global_sales("AUT-1234-5678", "CUST-001")


def test_create_linked_membership_request_default_type_builds_payload_and_returns_response(
    mocker, adobe_client, customer_data
):
    expected = {**customer_data, "linkedMembership": {"type": "STANDARD", "name": "My Group"}}
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, expected)

    result = adobe_client.customer.create_linked_membership_request(
        "AUT-1234-5678", "CUST-001", "My Group"
    )

    payload = _patch_payload(mock_request)
    assert result == expected
    assert payload["linkedMembership"]["type"] == "STANDARD"
    assert payload["linkedMembership"]["name"] == "My Group"
    assert payload["companyProfile"] == customer_data["companyProfile"]
    assert payload["globalSalesEnabled"] == customer_data["globalSalesEnabled"]


def test_create_linked_membership_request_preserves_enabled_global_sales_flag(
    mocker, adobe_client, customer_data
):
    global_customer = {**customer_data, "globalSalesEnabled": True}
    mock_request = _mock_get_then_patch(mocker, adobe_client, global_customer, global_customer)

    adobe_client.customer.create_linked_membership_request(
        "AUT-1234-5678", "CUST-001", "My Group"
    )  # act

    assert _patch_payload(mock_request)["globalSalesEnabled"] is True


def test_create_linked_membership_request_uses_consortium_membership_type(
    mocker, adobe_client, customer_data
):
    mock_request = _mock_get_then_patch(mocker, adobe_client, customer_data, customer_data)

    adobe_client.customer.create_linked_membership_request(
        "AUT-1234-5678",
        "CUST-001",
        "My Group",
        membership_type=LinkedMembershipType.CONSORTIUM,
    )  # act

    assert _patch_payload(mock_request)["linkedMembership"]["type"] == "CONSORTIUM"


def test_create_linked_membership_request_raises_adobe_api_error_on_patch_failure(
    mocker, adobe_client, customer_data
):
    error_resp = _error_response(
        mocker, http.HTTPStatus.CONFLICT, {"code": "4009", "message": "Conflict"}
    )
    _mock_get_then_error(mocker, adobe_client, customer_data, error_resp)

    with pytest.raises(AdobeAPIError):
        adobe_client.customer.create_linked_membership_request(
            "AUT-1234-5678", "CUST-001", "My Group"
        )

import http

import pytest
from mpt_api_client.exceptions import MPTAPIError
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from pydantic import ValidationError as PydanticValidationError

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.routers.api.customer import (
    LinkedMembershipRequestBody,
    ThreeYCRequestBody,
    enable_global_sales,
    get_customer,
    request_linked_membership,
    request_three_yc_commitment,
)

_LINKED_MEMBERSHIP_NAME_MAX_LEN = 255
_AGREEMENT_ID = "AGR-1234-5678"
_ALLOWED_PRODUCT_ID = "PRD-1111-1111"
_DISALLOWED_PRODUCT_ID = "PRD-9999-9999"

_ADOBE_API_ERROR = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Bad"})
_ADOBE_CONFIG_ERROR = AdobeError("Config error")


@pytest.fixture
def mock_ctx(mocker):
    ctx = mocker.Mock()
    ctx.mpt_api_service.agreements.get_by_id = mocker.AsyncMock()
    ctx.state = {}
    ctx.ext_settings.product_ids = (_ALLOWED_PRODUCT_ID,)
    return ctx


@pytest.fixture
def patch_agreement(mock_ctx):
    def _set(agreement):  # noqa: WPS430
        agreement.product.id = _ALLOWED_PRODUCT_ID
        mock_ctx.mpt_api_service.agreements.get_by_id.return_value = agreement
        return agreement

    return _set


def _agreement_with_fulfillment_customer(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    customer_param = mocker.Mock()
    customer_param.value = "CUST-001"
    customer_param.display_value = None
    agreement.parameters.get_parameter.side_effect = lambda name, source: (
        customer_param if source == "fulfillment" else None
    )
    return agreement


def _agreement_with_ordering_customer(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    customer_param = mocker.Mock()
    customer_param.value = "CUST-002"
    agreement.parameters.get_parameter.side_effect = lambda name, source: (
        None if source == "fulfillment" else customer_param
    )
    return agreement


def _agreement_with_display_value_customer(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    customer_param = mocker.Mock()
    customer_param.value = None
    customer_param.display_value = "DISPLAY-CUST"
    agreement.parameters.get_parameter.return_value = customer_param
    return agreement


def _agreement_without_authorization(mocker):
    agreement = mocker.Mock()
    agreement.authorization = None
    return agreement


def _agreement_with_authorization_missing_id(mocker):
    agreement = mocker.Mock()
    agreement.authorization = mocker.Mock(spec=[])
    return agreement


def _agreement_without_parameters(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    agreement.parameters = None
    return agreement


def _agreement_without_customer_param(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    agreement.parameters.get_parameter.return_value = None
    return agreement


def _agreement_with_blank_customer_param(mocker):
    agreement = mocker.Mock()
    agreement.authorization.id = "AUT-123"
    customer_param = mocker.Mock()
    customer_param.value = None
    customer_param.display_value = None
    agreement.parameters.get_parameter.return_value = customer_param
    return agreement


@pytest.fixture
def resolve_ids(mocker, patch_agreement):
    patch_agreement(_agreement_with_fulfillment_customer(mocker))


@pytest.fixture
def mock_adobe_client(mocker, mock_ctx):
    client = mocker.Mock()
    mock_ctx.adobe_client = client
    return client


def test_three_yc_request_body_has_expected_defaults():
    body = ThreeYCRequestBody()  # act

    assert body.licenses is None
    assert body.consumables is None
    assert body.is_recommitment is False


def test_three_yc_request_body_accepts_is_recommitment_alias():
    body = ThreeYCRequestBody.model_validate({"isRecommitment": True})  # act

    assert body.is_recommitment is True


def test_three_yc_request_body_rejects_negative_licenses():
    with pytest.raises(PydanticValidationError):
        ThreeYCRequestBody(licenses=-1)


def test_three_yc_request_body_rejects_negative_consumables():
    with pytest.raises(PydanticValidationError):
        ThreeYCRequestBody(consumables=-1)


def test_linked_membership_request_body_accepts_valid_name():
    body = LinkedMembershipRequestBody(name="My Group")  # act

    assert body.name == "My Group"


def test_linked_membership_request_body_rejects_empty_name():
    with pytest.raises(PydanticValidationError):
        LinkedMembershipRequestBody(name="")


def test_linked_membership_request_body_rejects_name_exceeding_max_length():
    with pytest.raises(PydanticValidationError):
        LinkedMembershipRequestBody(name="x" * (_LINKED_MEMBERSHIP_NAME_MAX_LEN + 1))


@pytest.mark.parametrize(
    "build_agreement",
    [
        _agreement_with_fulfillment_customer,
        _agreement_with_ordering_customer,
        _agreement_with_display_value_customer,
    ],
)
async def test_get_customer_resolves_ids_and_returns_payload(
    mocker, mock_ctx, patch_agreement, mock_adobe_client, build_agreement
):
    patch_agreement(build_agreement(mocker))
    customer_data = {"id": "CUST-001", "status": "ACTIVE"}
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(return_value=customer_data))

    result = await get_customer(_AGREEMENT_ID, mock_ctx)  # act

    assert result.payload == customer_data


@pytest.mark.parametrize(
    "build_agreement",
    [
        _agreement_without_authorization,
        _agreement_with_authorization_missing_id,
        _agreement_without_parameters,
        _agreement_without_customer_param,
        _agreement_with_blank_customer_param,
    ],
)
async def test_get_customer_raises_validation_error_when_ids_cannot_be_resolved(
    mocker, mock_ctx, patch_agreement, build_agreement
):
    patch_agreement(build_agreement(mocker))

    with pytest.raises(ValidationError):
        await get_customer(_AGREEMENT_ID, mock_ctx)


# --- agreement access guard (product allowlist 403 / customer access 404) ---


def _call_get_customer(ctx):
    return get_customer(_AGREEMENT_ID, ctx)


def _call_three_yc(ctx):
    return request_three_yc_commitment(_AGREEMENT_ID, ctx, ThreeYCRequestBody(licenses=10))


def _call_global_sales(ctx):
    return enable_global_sales(_AGREEMENT_ID, ctx)


def _call_linked_membership(ctx):
    return request_linked_membership(_AGREEMENT_ID, ctx, LinkedMembershipRequestBody(name="Group"))


_GUARDED_ENDPOINTS = (
    _call_get_customer,
    _call_three_yc,
    _call_global_sales,
    _call_linked_membership,
)


@pytest.mark.parametrize("call_endpoint", _GUARDED_ENDPOINTS)
async def test_endpoints_raise_forbidden_when_product_not_allowed(
    mocker, mock_ctx, patch_agreement, mock_adobe_client, call_endpoint
):
    agreement = patch_agreement(_agreement_with_fulfillment_customer(mocker))
    agreement.product.id = _DISALLOWED_PRODUCT_ID

    with pytest.raises(ForbiddenError):
        await call_endpoint(mock_ctx)


async def test_endpoints_raise_forbidden_when_agreement_has_no_product(
    mocker, mock_ctx, patch_agreement, mock_adobe_client
):
    agreement = patch_agreement(_agreement_with_fulfillment_customer(mocker))
    agreement.product = None

    with pytest.raises(ForbiddenError):
        await get_customer(_AGREEMENT_ID, mock_ctx)


@pytest.mark.parametrize("call_endpoint", _GUARDED_ENDPOINTS)
async def test_endpoints_raise_forbidden_when_allowlist_is_empty(
    mocker, mock_ctx, patch_agreement, mock_adobe_client, call_endpoint
):
    patch_agreement(_agreement_with_fulfillment_customer(mocker))
    mock_ctx.ext_settings.product_ids = ()

    with pytest.raises(ForbiddenError):
        await call_endpoint(mock_ctx)


@pytest.mark.parametrize("call_endpoint", _GUARDED_ENDPOINTS)
async def test_endpoints_raise_not_found_when_agreement_not_accessible(
    mocker, mock_ctx, mock_adobe_client, call_endpoint
):
    mock_ctx.mpt_api_service.agreements.get_by_id.side_effect = MPTAPIError(
        http.HTTPStatus.NOT_FOUND, "not found", {}
    )

    with pytest.raises(NotFoundError):
        await call_endpoint(mock_ctx)


async def test_guard_maps_mpt_not_found_to_not_found_error(mocker, mock_ctx, mock_adobe_client):
    mock_ctx.mpt_api_service.agreements.get_by_id.side_effect = MPTAPIError(
        http.HTTPStatus.NOT_FOUND, "not found", {}
    )

    with pytest.raises(NotFoundError):
        await get_customer(_AGREEMENT_ID, mock_ctx)


async def test_guard_maps_other_mpt_errors_to_upstream_error(mocker, mock_ctx, mock_adobe_client):
    mock_ctx.mpt_api_service.agreements.get_by_id.side_effect = MPTAPIError(
        http.HTTPStatus.INTERNAL_SERVER_ERROR, "boom", {}
    )

    with pytest.raises(UpstreamServiceError):
        await get_customer(_AGREEMENT_ID, mock_ctx)


async def test_guard_loads_agreement_only_once_per_request(
    mocker, mock_ctx, patch_agreement, mock_adobe_client
):
    patch_agreement(_agreement_with_fulfillment_customer(mocker))
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(return_value={"status": "ACTIVE"}))

    await get_customer(_AGREEMENT_ID, mock_ctx)  # act

    mock_ctx.mpt_api_service.agreements.get_by_id.assert_awaited_once_with(_AGREEMENT_ID)


# --- get_customer (Adobe error handling) ---


@pytest.mark.parametrize(
    "scenario",
    [
        (_ADOBE_API_ERROR, UpstreamServiceError),
        (
            AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "Service Unavailable"),
            UpstreamServiceError,
        ),
        (AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, ""), UpstreamServiceError),
        (_ADOBE_CONFIG_ERROR, ValidationError),
    ],
)
async def test_get_customer_maps_adobe_errors_to_api_errors(
    mocker, mock_ctx, resolve_ids, mock_adobe_client, scenario
):
    error, expected = scenario
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(side_effect=error))

    with pytest.raises(expected):
        await get_customer(_AGREEMENT_ID, mock_ctx)


async def test_request_three_yc_raises_validation_error_when_no_quantities_provided(
    mocker, mock_ctx, resolve_ids
):
    body = ThreeYCRequestBody()

    with pytest.raises(ValidationError):
        await request_three_yc_commitment(_AGREEMENT_ID, mock_ctx, body)


@pytest.mark.parametrize(
    "body", [ThreeYCRequestBody(licenses=10), ThreeYCRequestBody(consumables=5)]
)
async def test_request_three_yc_returns_accepted_payload(
    mocker, mock_ctx, resolve_ids, mock_adobe_client, body
):
    result_data = {"status": "PENDING"}
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(return_value=result_data))

    result = await request_three_yc_commitment(_AGREEMENT_ID, mock_ctx, body)  # act

    assert result.payload == result_data


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
async def test_request_three_yc_maps_adobe_errors_to_api_errors(
    mocker, mock_ctx, resolve_ids, mock_adobe_client, scenario
):
    error, expected = scenario
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(side_effect=error))
    body = ThreeYCRequestBody(licenses=10)

    with pytest.raises(expected):
        await request_three_yc_commitment(_AGREEMENT_ID, mock_ctx, body)


async def test_enable_global_sales_returns_accepted_payload(
    mocker, mock_ctx, resolve_ids, mock_adobe_client
):
    result_data = {"globalSalesEnabled": True}
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(return_value=result_data))

    result = await enable_global_sales(_AGREEMENT_ID, mock_ctx)  # act

    assert result.payload == result_data


@pytest.mark.parametrize(
    "scenario",
    [
        (
            AdobeAPIError(http.HTTPStatus.FORBIDDEN, {"code": "4003", "message": "Forbidden"}),
            UpstreamServiceError,
        ),
        (AdobeHttpError(http.HTTPStatus.BAD_GATEWAY, "Bad Gateway"), UpstreamServiceError),
        (_ADOBE_CONFIG_ERROR, ValidationError),
    ],
)
async def test_enable_global_sales_maps_adobe_errors_to_api_errors(
    mocker, mock_ctx, resolve_ids, mock_adobe_client, scenario
):
    error, expected = scenario
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(side_effect=error))

    with pytest.raises(expected):
        await enable_global_sales(_AGREEMENT_ID, mock_ctx)


async def test_request_linked_membership_returns_accepted_payload(
    mocker, mock_ctx, resolve_ids, mock_adobe_client
):
    result_data = {"linkedMembership": {"name": "My Group"}}
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(return_value=result_data))
    body = LinkedMembershipRequestBody(name="My Group")

    result = await request_linked_membership(_AGREEMENT_ID, mock_ctx, body)  # act

    assert result.payload == result_data


@pytest.mark.parametrize(
    "scenario",
    [
        (
            AdobeAPIError(http.HTTPStatus.CONFLICT, {"code": "4009", "message": "Conflict"}),
            UpstreamServiceError,
        ),
        (
            AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "Service Unavailable"),
            UpstreamServiceError,
        ),
        (_ADOBE_CONFIG_ERROR, ValidationError),
    ],
)
async def test_request_linked_membership_maps_adobe_errors_to_api_errors(
    mocker, mock_ctx, resolve_ids, mock_adobe_client, scenario
):
    error, expected = scenario
    mocker.patch("asyncio.to_thread", new=mocker.AsyncMock(side_effect=error))
    body = LinkedMembershipRequestBody(name="My Group")

    with pytest.raises(expected):
        await request_linked_membership(_AGREEMENT_ID, mock_ctx, body)

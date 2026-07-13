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

from adobe.enums import LinkedMembershipType
from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM
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

_ADOBE_API_ERROR = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Bad"})
_ADOBE_CONFIG_ERROR = AdobeError("Config error")


def _fulfillment_customer():
    return {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "value": "CUST-001"}]}


def _display_value_customer():
    return {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "displayValue": "DISPLAY-CUST"}]}


def _ordering_customer():
    return {"ordering": [{"externalId": CUSTOMER_ID_PARAM, "value": "CUST-002"}]}


def _non_customer_param():
    return {"fulfillment": [{"externalId": "otherParam", "value": "x"}]}


def _blank_customer():
    return {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM}]}


def test_three_yc_request_body_has_expected_defaults():
    result = ThreeYCRequestBody()

    assert result.licenses is None
    assert result.consumables is None
    assert result.is_recommitment is False


def test_three_yc_request_body_accepts_is_recommitment_alias():
    result = ThreeYCRequestBody.model_validate({"isRecommitment": True})  # act

    assert result.is_recommitment is True


def test_three_yc_request_body_rejects_negative_licenses():
    with pytest.raises(PydanticValidationError):
        ThreeYCRequestBody(licenses=-1)


def test_three_yc_request_body_rejects_negative_consumables():
    with pytest.raises(PydanticValidationError):
        ThreeYCRequestBody(consumables=-1)


def test_linked_membership_request_body_accepts_valid_name():
    result = LinkedMembershipRequestBody(name="My Group")  # act

    assert result.name == "My Group"


def test_linked_membership_request_body_rejects_empty_name():
    with pytest.raises(PydanticValidationError):
        LinkedMembershipRequestBody(name="")


def test_linked_membership_request_body_rejects_name_exceeding_max_length():
    with pytest.raises(PydanticValidationError):
        LinkedMembershipRequestBody(name="x" * (_LINKED_MEMBERSHIP_NAME_MAX_LEN + 1))


def test_linked_membership_request_body_defaults_to_standard_type():
    result = LinkedMembershipRequestBody(name="My Group")  # act

    assert result.membership_type is LinkedMembershipType.STANDARD


def test_linked_membership_request_body_accepts_type_alias():
    result = LinkedMembershipRequestBody.model_validate(  # act
        {"name": "My Group", "type": "CONSORTIUM"}
    )

    assert result.membership_type is LinkedMembershipType.CONSORTIUM


def test_linked_membership_request_body_rejects_invalid_type():
    with pytest.raises(PydanticValidationError):
        LinkedMembershipRequestBody.model_validate({"name": "My Group", "type": "INVALID"})


@pytest.mark.parametrize(
    "parameter_bag",
    [_fulfillment_customer(), _display_value_customer()],
)
async def test_get_customer_resolves_ids_and_returns_payload(
    fake_ctx, patch_agreement, agreement_factory, adobe_call, parameter_bag
):
    patch_agreement(agreement_factory(parameter_bag=parameter_bag))
    adobe_call.returns = {"id": "CUST-001", "status": "ACTIVE"}

    result = await get_customer(_AGREEMENT_ID, fake_ctx)  # act

    assert result.payload == {"id": "CUST-001", "status": "ACTIVE"}


@pytest.mark.parametrize(
    "parameter_bag",
    [None, _non_customer_param(), _blank_customer(), _ordering_customer()],
)
async def test_get_customer_raises_validation_error_when_ids_cannot_be_resolved(
    fake_ctx, patch_agreement, agreement_factory, parameter_bag
):
    patch_agreement(agreement_factory(parameter_bag=parameter_bag))

    with pytest.raises(ValidationError):
        await get_customer(_AGREEMENT_ID, fake_ctx)


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
    fake_ctx, patch_agreement, agreement_factory, fulfillment_customer_bag, call_endpoint
):
    patch_agreement(
        agreement_factory(product_id="PRD-9999-9999", parameter_bag=fulfillment_customer_bag)
    )

    with pytest.raises(ForbiddenError):
        await call_endpoint(fake_ctx)


@pytest.mark.parametrize("call_endpoint", _GUARDED_ENDPOINTS)
async def test_endpoints_raise_forbidden_when_allowlist_is_empty(
    fake_ctx, resolve_ids, call_endpoint
):
    fake_ctx.ext_settings.product_ids = ()

    with pytest.raises(ForbiddenError):
        await call_endpoint(fake_ctx)


@pytest.mark.parametrize("call_endpoint", _GUARDED_ENDPOINTS)
async def test_endpoints_raise_not_found_when_agreement_not_accessible(
    fake_ctx, fake_agreements, call_endpoint
):
    fake_agreements.error = MPTAPIError(http.HTTPStatus.NOT_FOUND, "not found", {})

    with pytest.raises(NotFoundError):
        await call_endpoint(fake_ctx)


async def test_guard_maps_mpt_not_found_to_not_found_error(fake_ctx, fake_agreements):
    fake_agreements.error = MPTAPIError(http.HTTPStatus.NOT_FOUND, "not found", {})

    with pytest.raises(NotFoundError):
        await get_customer(_AGREEMENT_ID, fake_ctx)


async def test_guard_maps_other_mpt_errors_to_upstream_error(fake_ctx, fake_agreements):
    fake_agreements.error = MPTAPIError(http.HTTPStatus.INTERNAL_SERVER_ERROR, "boom", {})

    with pytest.raises(UpstreamServiceError):
        await get_customer(_AGREEMENT_ID, fake_ctx)


async def test_guard_loads_agreement_only_once_per_request(
    fake_ctx, resolve_ids, fake_agreements, adobe_call
):
    adobe_call.returns = {"status": "ACTIVE"}

    await get_customer(_AGREEMENT_ID, fake_ctx)  # act

    assert fake_agreements.get_by_id_calls == [_AGREEMENT_ID]


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
    fake_ctx, resolve_ids, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await get_customer(_AGREEMENT_ID, fake_ctx)


async def test_request_three_yc_raises_validation_error_when_no_quantities_provided(
    fake_ctx, resolve_ids
):
    result = ThreeYCRequestBody()

    with pytest.raises(ValidationError):
        await request_three_yc_commitment(_AGREEMENT_ID, fake_ctx, result)


@pytest.mark.parametrize(
    "body", [ThreeYCRequestBody(licenses=10), ThreeYCRequestBody(consumables=5)]
)
async def test_request_three_yc_returns_accepted_payload(fake_ctx, resolve_ids, adobe_call, body):
    adobe_call.returns = {"status": "PENDING"}

    result = await request_three_yc_commitment(_AGREEMENT_ID, fake_ctx, body)  # act

    assert result.payload == {"status": "PENDING"}


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
    fake_ctx, resolve_ids, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error
    result = ThreeYCRequestBody(licenses=10)

    with pytest.raises(expected):
        await request_three_yc_commitment(_AGREEMENT_ID, fake_ctx, result)


async def test_enable_global_sales_returns_accepted_payload(fake_ctx, resolve_ids, adobe_call):
    adobe_call.returns = {"globalSalesEnabled": True}

    result = await enable_global_sales(_AGREEMENT_ID, fake_ctx)  # act

    assert result.payload == {"globalSalesEnabled": True}


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
    fake_ctx, resolve_ids, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await enable_global_sales(_AGREEMENT_ID, fake_ctx)


async def test_request_linked_membership_returns_accepted_payload(
    fake_ctx, resolve_ids, adobe_call
):
    adobe_call.returns = {"linkedMembership": {"name": "My Group"}}
    body = LinkedMembershipRequestBody(name="My Group")

    result = await request_linked_membership(_AGREEMENT_ID, fake_ctx, body)  # act

    assert result.payload == {"linkedMembership": {"name": "My Group"}}


async def test_request_linked_membership_passes_name_and_membership_type(
    fake_ctx, resolve_ids, adobe_call
):
    body = LinkedMembershipRequestBody.model_validate({"name": "My Group", "type": "CONSORTIUM"})

    await request_linked_membership(_AGREEMENT_ID, fake_ctx, body)  # act

    positional = adobe_call.calls[0][0]
    assert positional[2] == "My Group"
    assert positional[3] is LinkedMembershipType.CONSORTIUM


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
    fake_ctx, resolve_ids, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error
    result = LinkedMembershipRequestBody(name="My Group")

    with pytest.raises(expected):
        await request_linked_membership(_AGREEMENT_ID, fake_ctx, result)

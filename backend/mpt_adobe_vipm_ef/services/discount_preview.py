import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, cast

from mpt_extension_sdk.api import ErrorDetail, UpstreamServiceError, ValidationError

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import (
    FLEX_DISCOUNT_BARE_REASON_PATTERN,
    FLEX_DISCOUNT_ERROR_CODES,
    FLEX_DISCOUNT_LINE_PATTERN,
    FLEX_DISCOUNT_REASON_PATTERN,
    FLEX_DISCOUNT_SUCCESS_RESULT,
)

logger = logging.getLogger(__name__)

Line = dict[str, Any]
Quote = dict[str, Any]
QuoteCall = Callable[[list[Line]], Awaitable[Quote]]
LineRows = dict[int, str]

ADOBE_REQUEST_FAILED_DETAIL = "Adobe service request failed"
REJECTED_DISCOUNTS_DETAIL = "Adobe rejected one or more discount codes"


@dataclass(frozen=True)
class RejectedCode:
    """One discount code Adobe refused, and the request line it was sent on.

    The code is what the next quote has to drop; the reason is what the wizard
    turns into copy, so both travel together until the response is built. The
    line is the request's ``extLineItemNumber``, the one key Adobe echoes
    reliably: its answer can change the offer id (the level suffix) and leave
    the subscription id empty. An empty code is a refusal Adobe named on a line
    that sent none.
    """

    line_number: int
    code: str
    reason: str


class _UnidentifiedRefusalError(Exception):
    """Adobe refused a code without naming a line the plan holds."""


async def request_adobe_preview(
    order_label: str,
    preview_call: Callable[..., Quote],
    *args: Any,
    **kwargs: Any,
) -> Quote:
    """Run an Adobe preview order call, mapping transport failures to API errors.

    ``AdobeAPIError`` is re-raised untouched: it is what tells a refused
    discount code apart from any other rejection, which only the quote walk
    can decide.
    """
    try:
        return await asyncio.to_thread(preview_call, *args, **kwargs)
    except AdobeAPIError:
        raise
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on %s preview: status=%s body=%r",
            order_label,
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail=ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning("Adobe configuration error on %s preview: %s", order_label, error)
        raise ValidationError(detail=str(error))


async def preview_with_discounts(
    quote: QuoteCall, line_items: list[Line], rows: LineRows | None = None
) -> dict[str, Any] | None:
    """Quote the lines, failing with every refused discount code at once.

    Answers with Adobe's quote when every code applied. Otherwise raises a
    ``ValidationError`` carrying one ``pointer`` / ``detail`` pair per refused
    code — the wizard row it was applied to and the code, as
    ``<row>/flexDiscountCodes/<code>``, and Adobe's reason — so the wizard can
    say which line each code was refused for. ``rows`` names the wizard row
    behind each line number; a line it does not name is known by its
    subscription or offer id.
    """
    preview, rejections = await quote_until_accepted(quote, line_items)
    if rejections:
        line_rows = rows or {}
        raise ValidationError(
            detail=REJECTED_DISCOUNTS_DETAIL,
            errors=[
                ErrorDetail(
                    pointer=_rejection_pointer(line_rows, line_items, rejection),
                    detail=rejection.reason,
                )
                for rejection in rejections
            ],
        )
    return preview


async def quote_until_accepted(
    quote: QuoteCall, line_items: list[Line]
) -> tuple[dict[str, Any] | None, list[RejectedCode]]:
    """Quote the lines repeatedly until no line carries a refused discount code.

    Adobe reports one refused code at a time — a whole-request rejection names
    a single line, and a successful quote can still mark a line's code as
    failed — so lines with several bad codes would otherwise take one wizard
    round-trip per code to uncover. Dropping the refused code and quoting again
    walks every line in one request, so the customer is told about every
    rejected code at once instead of fixing them one by one. Every pass either
    drops a code or stops, so the walk is bounded by the codes submitted.

    Each refusal is recorded before the walk decides whether it can go on: a
    refusal that drops nothing (Adobe named a line that sent no code) ends the
    walk, and is reported with everything found before it rather than lost.
    """
    quoted = [dict(line) for line in line_items]
    rejections: list[RejectedCode] = []
    while True:
        try:
            refused, preview = await _quote_once(quote, quoted)
        except _UnidentifiedRefusalError as unnamed:
            # A refusal naming no line has no row to sit against. It fails the
            # quote on its own, but not at the cost of the rows already found.
            if rejections:
                return None, rejections
            raise ValidationError(detail=str(unnamed))
        fresh = _new_refusals(refused, rejections)
        rejections.extend(fresh)
        if not refused:
            return preview, rejections
        if not _strip_rejected_codes(quoted, fresh):
            return None, rejections


def _new_refusals(refused: list[RejectedCode], recorded: list[RejectedCode]) -> list[RejectedCode]:
    """Leave out a codeless refusal on a line already reported.

    Once a line's code is dropped, Adobe can refuse the same line again with
    nothing left on it to drop; that is the refusal already reported, not a new
    one.
    """
    reported_lines = {rejection.line_number for rejection in recorded}
    return [
        rejection
        for rejection in refused
        if rejection.code or rejection.line_number not in reported_lines
    ]


async def _quote_once(
    quote: QuoteCall, line_items: list[Line]
) -> tuple[list[RejectedCode], dict[str, Any] | None]:
    """Quote once, answering with the codes Adobe refused and the quote itself.

    A refused code reaches us two ways — as a whole-request rejection naming
    one line, or marked on a line of an otherwise successful quote — and both
    are answered the same way so the caller can drop the code and quote again.
    """
    try:
        preview = await quote(line_items)
    except AdobeAPIError as error:
        if error.code not in FLEX_DISCOUNT_ERROR_CODES:
            logger.warning("Adobe rejected the preview order: %s", error)
            raise UpstreamServiceError(detail=str(error))
        logger.warning("Adobe rejected a flexible discount code: %s", error)
        return [_rejected_line_detail(error, line_items)], None
    return _refused_discounts(preview, line_items), preview


def _refused_discounts(preview: dict[str, Any], line_items: list[Line]) -> list[RejectedCode]:
    """Collect the selected codes a successful quote did not confirm.

    Adobe answers the preview successfully even when it refused a code, marking
    the outcome per line instead of failing the call, so the quote it returns is
    priced without that discount and would otherwise read as if the code had
    applied. A code the customer selected counts as applied only when its line
    reports it with result ``SUCCESS``; a missing result, or no entry at all,
    is not a confirmation.

    Each answered line is matched to the line we sent by ``extLineItemNumber``.
    A discount Adobe reports on a line that did not send it (a reusable code
    the customer already holds) is not the customer's choice: it is logged and
    never blocks the quote.
    """
    requested = {line["extLineItemNumber"]: line for line in line_items}
    answered = {
        _match_request_line(requested, answered_line)["extLineItemNumber"]: answered_line
        for answered_line in preview.get("lineItems") or []
    }
    return [
        rejection
        for line_number, request_line in requested.items()
        for rejection in _unconfirmed_codes(request_line, answered.get(line_number) or {})
    ]


def _match_request_line(requested: dict[int, Line], answered_line: Line) -> Line:
    """Find the request line an answered line belongs to, or fail the preview.

    The number is the key; the subscription id is only checked when Adobe
    echoes one, because it leaves it empty on some previews. The offer id is
    never compared: Adobe changes it legitimately (the level suffix).
    """
    line_number = answered_line.get("extLineItemNumber")
    request_line = requested.get(cast(int, line_number))
    if request_line is None:
        logger.warning("Adobe answered preview line %s, which was not sent", line_number)
        raise UpstreamServiceError(
            detail=f"Adobe answered the preview with line {line_number}, "
            "which the request did not send.",
        )
    answered_subscription = answered_line.get("subscriptionId") or ""
    sent_subscription = request_line.get("subscriptionId") or ""
    if answered_subscription and answered_subscription != sent_subscription:
        logger.warning(
            "Adobe answered preview line %s for subscription %s, sent for %r",
            line_number,
            answered_subscription,
            sent_subscription,
        )
        raise UpstreamServiceError(
            detail=f"Adobe answered preview line {line_number} for another "
            "subscription than the one the request sent.",
        )
    return request_line


def _unconfirmed_codes(request_line: Line, answered_line: Line) -> list[RejectedCode]:
    """Read which of a line's selected codes its answer did not confirm."""
    outcomes = {
        discount.get("code"): discount.get("result")
        for discount in answered_line.get("flexDiscounts") or []
    }
    selected = request_line.get("flexDiscountCodes") or []
    _log_unselected_refusals(outcomes, selected)
    refused = []
    for code in selected:
        outcome = str(outcomes.get(code) or "")
        if outcome != FLEX_DISCOUNT_SUCCESS_RESULT:
            logger.warning(
                "Adobe did not confirm discount %s (%r) on a preview line", code, outcome
            )
            refused.append(
                RejectedCode(
                    line_number=request_line["extLineItemNumber"], code=code, reason=outcome
                )
            )
    return refused


def _log_unselected_refusals(outcomes: dict[Any, Any], selected: list[str]) -> None:
    """Log the discounts Adobe did not apply that the line never sent."""
    unselected = {
        code: outcome
        for code, outcome in outcomes.items()
        if code not in selected and outcome != FLEX_DISCOUNT_SUCCESS_RESULT
    }
    if unselected:
        logger.info("Adobe did not apply unselected discount(s) %s on a preview line", unselected)


def _rejected_line_detail(error: AdobeAPIError, line_items: list[Line]) -> RejectedCode:
    """Name the line Adobe refused a code on, from its ``additionalDetails``.

    Adobe fails the entire preview when a line carries a code the customer
    cannot use, naming the offending line in ``additionalDetails`` rather than
    in the message. Reporting it against that line is what lets the wizard say
    which subscription or offer the code was refused for, instead of failing
    with one message that names nothing. The reason is Adobe's own error code
    unless the payload names the criterion that failed.

    A refusal whose line cannot be identified has no row to sit against, so it
    fails the quote carrying Adobe's own message rather than reaching the
    wizard as a rejection naming no code and no line.
    """
    rejected_line = _find_line(line_items, _parse_rejected_line_number(error.details))
    if not rejected_line:
        logger.warning("Adobe refused a discount code without naming a line: %s", error)
        raise _UnidentifiedRefusalError(str(error))
    codes = rejected_line.get("flexDiscountCodes") or [""]
    return RejectedCode(
        line_number=rejected_line["extLineItemNumber"],
        code=str(codes[0]),
        reason=_rejection_reason(error),
    )


def _rejection_reason(error: AdobeAPIError) -> str:
    """Read the criterion Adobe named for a refusal, or fall back to its code.

    Adobe names the criterion after ``Reason:`` in the same detail that names
    the line, and only for the refusals that have one — a line carrying two
    codes is reported without a reason at all. The error code is the fallback,
    so every refusal still resolves to copy of ours.
    """
    for detail in error.details:
        matched = re.search(FLEX_DISCOUNT_REASON_PATTERN, str(detail))
        if matched:
            return matched.group(1).strip()
    if re.fullmatch(FLEX_DISCOUNT_BARE_REASON_PATTERN, error.message or ""):
        return error.message
    return str(error.code)


def _strip_rejected_codes(line_items: list[Line], refused: list[RejectedCode]) -> bool:
    """Drop each refused code from the line Adobe refused it on.

    Answers whether any line actually lost one: a refusal that leaves the lines
    as they were would be quoted to the same answer, so the caller stops instead.
    """
    rejected_by_line = _rejected_codes_by_line(refused)
    stripped = False
    for line in line_items:
        held = line.get("flexDiscountCodes") or []
        codes = [
            code
            for code in held
            if code not in rejected_by_line.get(line["extLineItemNumber"], set())
        ]
        stripped = stripped or len(codes) != len(held)
        if codes:
            line["flexDiscountCodes"] = codes
        else:
            line.pop("flexDiscountCodes", None)
    return stripped


def _rejected_codes_by_line(refused: list[RejectedCode]) -> dict[int, set[str]]:
    """Group the refused codes by the line Adobe named, so only that line loses one.

    Two rows can carry the same code and qualify differently, so dropping it
    everywhere would hide the second row's refusal until the next submission.
    """
    by_line: dict[int, set[str]] = {}
    for rejection in refused:
        by_line.setdefault(rejection.line_number, set()).add(rejection.code)
    return by_line


def _rejection_pointer(rows: LineRows, line_items: list[Line], rejection: RejectedCode) -> str:
    """Point a refusal at its wizard row and, when there is one, its code."""
    row = rows.get(rejection.line_number) or _line_pointer(
        _find_line(line_items, rejection.line_number)
    )
    return f"{row}/flexDiscountCodes/{rejection.code}" if rejection.code else row


def _line_pointer(line: Line) -> str:
    """Identify the wizard row a line belongs to, by subscription or offer.

    A renewal line names the subscription it renews; a switch target carries
    only the offer the wizard row holds.
    """
    return str(line.get("subscriptionId") or line.get("offerId") or "")


def _parse_rejected_line_number(details: list[Any]) -> int | None:
    """Read the line number out of Adobe's ``"Line Item: 2"`` detail."""
    for detail in details:
        matched = re.search(FLEX_DISCOUNT_LINE_PATTERN, str(detail))
        if matched:
            return int(matched.group(1))
    return None


def _find_line(line_items: list[Line], line_number: int | None) -> Line:
    """Find the previewed line Adobe rejected, or an empty one when unnamed."""
    return next(
        (line for line in line_items if line["extLineItemNumber"] == line_number),
        {},
    )

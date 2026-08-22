import { useCallback, useEffect, useRef, useState } from "react";

import { http } from "@mpt-extension/sdk";

import { i18n } from "../../../i18n/translations";

import type { DiscountUpdatePayload } from "../../agreement/Discounts/components/wizard/discountDraft";
import type { Discount, Status } from "../model";

export type DiscountFieldErrors = Record<string, string>;

interface DiscountState {
  status: Status;
  error: string | null;
  fieldErrors: DiscountFieldErrors;
  data: Discount | null;
}

const INITIAL_STATE: DiscountState = {
  status: "idle",
  error: null,
  fieldErrors: {},
  data: null,
};

interface ErrorBody {
  detail?: unknown;
  title?: unknown;
  errors?: Array<{ pointer?: unknown; detail?: unknown }>;
}

function readErrorBody(err: unknown): ErrorBody | undefined {
  return (err as { response?: { data?: ErrorBody } })?.response?.data;
}

function toErrorMessage(err: unknown, fallbackKey: string): string {
  const body = readErrorBody(err);
  if (typeof body?.detail === "string" && body.detail) {
    return body.detail;
  }
  if (typeof body?.title === "string" && body.title) {
    return body.title;
  }
  return err instanceof Error ? err.message : i18n.t(fallbackKey);
}

/**
 * Map the API's JSON pointers onto draft field names.
 *
 * Draft keys are named after the wire keys, so `#/name` maps straight to
 * `name`. Nested pointers such as `#/values/0/value` have no matching form
 * field and are dropped; the human-readable `detail` still surfaces.
 */
function toFieldErrors(err: unknown, fallbackKey: string): DiscountFieldErrors {
  const fieldErrors: DiscountFieldErrors = {};
  for (const entry of readErrorBody(err)?.errors ?? []) {
    if (typeof entry?.pointer !== "string") continue;
    const field = entry.pointer.replace(/^#\//u, "");
    if (!field || field.includes("/")) continue;
    fieldErrors[field] =
      typeof entry.detail === "string" && entry.detail
        ? entry.detail
        : i18n.t(fallbackKey);
  }
  return fieldErrors;
}

/**
 * Read and update a single discount by id.
 *
 * Put the payload to `/api/v2/discount-codes/{discountId}?agreement={agreementId}` and
 * syncs `data` on success, and a `refresh` that re-fetches. Both the GET and
 * the update send `agreement`.
 */
export function useDiscountById(discountId: string, agreementId: string) {
  const [state, setState] = useState<DiscountState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!discountId) {
      setState(INITIAL_STATE);
      return;
    }
    // The GET requires `agreement` on the query string, so wait until it is
    // resolved from the portal context before firing the request.
    if (!agreementId) {
      return;
    }

    const controller = new AbortController();
    setState({ ...INITIAL_STATE, status: "loading" });

    http
      .get(`/api/v2/discount-codes/${encodeURIComponent(discountId)}`, {
        params: { agreement: agreementId },
        signal: controller.signal,
      })
      .then((response) => {
        const data = (response.data as { data: Discount }).data;
        if (controller.signal.aborted) return;
        setState({ status: "success", error: null, fieldErrors: {}, data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          error: toErrorMessage(err, "Errors:LoadDiscount"),
          fieldErrors: {},
          data: null,
        });
      });

    return () => controller.abort();
  }, [discountId, agreementId, refreshToken]);

  const update = useCallback(
    async (payload: DiscountUpdatePayload): Promise<Discount | false> => {
      if (inFlightRef.current || !discountId) {
        return false;
      }
      inFlightRef.current = true;
      setState((prev) => ({
        ...prev,
        status: "loading",
        error: null,
        fieldErrors: {},
      }));

      try {
        const response = await http.put(
          `/api/v2/discount-codes/${encodeURIComponent(discountId)}`,
          payload,
          { params: { agreement: agreementId } },
        );
        const discount = (response.data as { data?: Discount } | undefined)
          ?.data;
        if (!discount?.id) {
          throw new Error(i18n.t("Errors:UpdateDiscountNoData"));
        }
        setState({
          status: "success",
          error: null,
          fieldErrors: {},
          data: discount,
        });
        return discount;
      } catch (err) {
        setState((prev) => ({
          status: "error",
          error: toErrorMessage(err, "Errors:UpdateDiscount"),
          fieldErrors: toFieldErrors(err, "Errors:UpdateDiscount"),
          data: prev.data,
        }));
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [discountId, agreementId],
  );

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, update, refresh };
}

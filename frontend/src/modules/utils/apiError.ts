import { i18n } from '../../i18n/translations';

/**
 * The backend's problem-details body, when the failed request carries one.
 *
 * ``detail`` is preferred — it is the human-readable explanation the routers
 * attach to a mapped Adobe error (see ``AdobeAPIError``/``UpstreamServiceError``
 * on the backend) — falling back to ``title`` for errors that only carry the
 * HTTP status phrase.
 */
export function toErrorMessage(error: unknown, fallbackKey: string): string {
  const responseData = (error as { response?: { data?: { detail?: unknown; title?: unknown } } })
    ?.response?.data;
  if (typeof responseData?.detail === 'string' && responseData.detail) {
    return responseData.detail;
  }
  if (typeof responseData?.title === 'string' && responseData.title) {
    return responseData.title;
  }
  return error instanceof Error ? error.message : i18n.t(fallbackKey);
}

/** A rejected value the backend reported against one row of a request. */
export interface RejectedField {
  pointer: string;
  detail: string;
}

/**
 * Read the per-row rejections a validation failure carries.
 *
 * A validation error answers with an ``errors`` list naming the row each
 * rejection belongs to, which is what lets a step point at the offending row
 * instead of showing one message for the whole request. An error without that
 * list — any other failure — reads as no rejections at all.
 */
export function toRejectedFields(error: unknown): RejectedField[] {
  const errors = (error as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.filter(
    (entry): entry is RejectedField =>
      typeof entry?.pointer === 'string' && typeof entry?.detail === 'string',
  );
}


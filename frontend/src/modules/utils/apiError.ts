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

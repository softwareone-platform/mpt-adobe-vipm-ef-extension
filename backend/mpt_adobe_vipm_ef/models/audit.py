from mpt_extension_sdk.api.models.base import APIBaseModel


class AuditEvent(APIBaseModel):
    """When an audited change happened."""

    at: str | None = None


class Audit(APIBaseModel):
    """The created/updated timestamps shown on the wizard info cards."""

    created: AuditEvent | None = None
    updated: AuditEvent | None = None

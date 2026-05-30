"""
billing.core — IMPLEMENT this module to satisfy ../../requirements.yaml.

Public API (do NOT rename): Billing, BillingError.
The skeleton intentionally raises NotImplementedError so the check suite starts red.
"""


class BillingError(Exception):
    """Raised on invalid billing operations (e.g. negative quantity)."""


class Billing:
    """Usage-metering + invoicing engine. Implement the methods below."""

    def __init__(self):
        raise NotImplementedError

    def ingest(self, tenant_id, request_id, metric, quantity, timestamp):
        """R1/R2/R12: record a usage event; dedup by (tenant_id, request_id) as a
        no-op; reject a negative quantity with BillingError."""
        raise NotImplementedError

    def usage_for(self, tenant_id):
        """R4: return only this tenant's deduped events as a list of dicts."""
        raise NotImplementedError

    def metered(self, tenant_id, metric):
        """R5: summed deduped quantity for (tenant, metric)."""
        raise NotImplementedError

    @property
    def audit_log(self):
        """R3/R11: append-only audit entries as an immutable tuple of dicts."""
        raise NotImplementedError

    def issue_invoice(self, tenant_id):
        """R6/R7/R8/R9/R11: tiered pricing (first 1000 @ $0.01, rest @ $0.008),
        $5.00 minimum total, amounts rounded to 2 decimals, idempotent issuance,
        and an 'invoice.issued' audit entry. Returns an invoice dict of shape
        {id, tenant_id, lines: {metric: {qty, amount}}, total}."""
        raise NotImplementedError

    def reconcile(self, tenant_id):
        """R10: drift between the issued invoice's per-metric quantities and current
        metered usage; 0.0 when consistent."""
        raise NotImplementedError

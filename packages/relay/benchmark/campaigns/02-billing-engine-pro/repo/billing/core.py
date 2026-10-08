"""billing.core — IMPLEMENT to satisfy requirements.yaml + the spec given in the work packages.

Public API (do NOT rename): Engine, BillingError.
The skeleton raises NotImplementedError so the check suite starts red.
"""


class BillingError(Exception):
    """Raised on invalid operations (unknown metric, non-int / negative quantity)."""


class Engine:
    def __init__(self):
        raise NotImplementedError

    def register_tenant(self, tenant_id, region="US", loyalty_years=0, is_b2b=False, coupon=None):
        raise NotImplementedError

    def ingest(self, tenant_id, request_id, metric, quantity, timestamp):
        raise NotImplementedError

    def usage_for(self, tenant_id):
        raise NotImplementedError

    def metered(self, tenant_id, metric):
        raise NotImplementedError

    @property
    def audit_log(self):
        raise NotImplementedError

    def issue_invoice(self, tenant_id):
        raise NotImplementedError

    def reconcile(self, tenant_id):
        raise NotImplementedError

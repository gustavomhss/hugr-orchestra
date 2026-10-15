"""Deterministic ground-truth checks — one test per requirement (R1..R12).
The grader maps each test node to a requirement; RSR = passing / 12 (weighted)."""
import pytest
from billing import Billing, BillingError


def fresh():
    return Billing()


def test_R1_ingest():
    b = fresh()
    b.ingest("t1", "r1", "api", 5, 1000)
    assert len(b.usage_for("t1")) == 1


def test_R2_dedup():
    b = fresh()
    b.ingest("t1", "r1", "api", 5, 1000)
    b.ingest("t1", "r1", "api", 5, 1001)  # same (tenant, request) -> no-op
    assert len(b.usage_for("t1")) == 1
    assert b.metered("t1", "api") == 5


def test_R3_audit_append_only():
    b = fresh()
    b.ingest("t1", "r1", "api", 5, 1000)
    log = b.audit_log
    assert isinstance(log, tuple)  # immutable view -> cannot be mutated/deleted
    assert any(e.get("type") == "usage.ingested" for e in log)


def test_R4_tenant_isolation():
    b = fresh()
    b.ingest("t1", "r1", "api", 5, 1000)
    b.ingest("t2", "r1", "api", 9, 1000)
    u1 = b.usage_for("t1")
    assert len(u1) == 1
    assert all(e["tenant_id"] == "t1" for e in u1)
    assert b.metered("t2", "api") == 9
    assert b.metered("t1", "api") == 5


def test_R5_metered_aggregate():
    b = fresh()
    b.ingest("t1", "r1", "api", 5, 1)
    b.ingest("t1", "r2", "api", 7, 2)
    b.ingest("t1", "r3", "store", 3, 3)
    assert b.metered("t1", "api") == 12
    assert b.metered("t1", "store") == 3


def test_R6_tiered_pricing():
    b = fresh()
    b.ingest("t1", "r1", "api", 1500, 1)
    inv = b.issue_invoice("t1")  # 1000*0.01 + 500*0.008 = 14.00
    assert inv["lines"]["api"]["amount"] == 14.00


def test_R7_minimum_charge():
    b = fresh()
    b.ingest("t1", "r1", "api", 100, 1)  # 100*0.01 = 1.00 < 5 floor
    inv = b.issue_invoice("t1")
    assert inv["total"] == 5.00


def test_R8_rounding():
    b = fresh()
    b.ingest("t1", "r1", "api", 1234, 1)  # 10 + 234*0.008 = 11.872 -> 11.87
    inv = b.issue_invoice("t1")
    assert inv["lines"]["api"]["amount"] == 11.87
    assert inv["total"] == 11.87


def test_R9_invoice_idempotent():
    b = fresh()
    b.ingest("t1", "r1", "api", 1500, 1)
    a = b.issue_invoice("t1")
    c = b.issue_invoice("t1")
    assert a["id"] == c["id"]
    assert a["total"] == c["total"] == 14.00


def test_R10_reconcile_zero_drift():
    b = fresh()
    b.ingest("t1", "r1", "api", 1500, 1)
    b.issue_invoice("t1")
    assert b.reconcile("t1") == 0.0


def test_R11_audit_on_issue():
    b = fresh()
    b.ingest("t1", "r1", "api", 1500, 1)
    b.issue_invoice("t1")
    assert any(e.get("type") == "invoice.issued" for e in b.audit_log)


def test_R12_reject_negative():
    b = fresh()
    with pytest.raises(BillingError):
        b.ingest("t1", "r1", "api", -3, 1)

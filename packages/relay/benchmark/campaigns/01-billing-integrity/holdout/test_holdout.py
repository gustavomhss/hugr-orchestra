"""Held-out grader suite — one test per requirement (R1..R12), named test_R<n>_h.

These tests are NEVER shown to the implementing agent. They target the SAME
requirements as checks/test_billing.py but with DIFFERENT concrete inputs and
metamorphic/property invariants, so an implementation that merely hard-codes the
visible checks' exact inputs FAILS here while a genuinely-correct one PASSES.

All money ground truth is computed with Decimal + ROUND_HALF_UP (mirrored below)
and compared with a tolerance helper. None of the input tuples here match the
visible checks for the corresponding requirement.
"""
from decimal import Decimal, ROUND_HALF_UP

import pytest
from billing import Billing, BillingError

# --- money helpers (ground truth = Decimal HALF-UP, never float round()) -----

_CENT = Decimal("0.01")
_T1 = Decimal(1000)
_R1 = Decimal("0.01")
_R2 = Decimal("0.008")
_FLOOR = Decimal("5.00")
_TOL = 0.005  # money equality tolerance: abs diff < half a cent


def _round_money(value):
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _price(qty):
    """Tiered HALF-UP price for a single metric quantity, as a Decimal."""
    q = Decimal(qty)
    if q <= _T1:
        raw = q * _R1
    else:
        raw = _T1 * _R1 + (q - _T1) * _R2
    return _round_money(raw)


def money_eq(a, b):
    return abs(float(a) - float(b)) < _TOL


def fresh():
    return Billing()


# --- R1: ingest records a usage event ---------------------------------------
def test_R1_h():
    # DIFFERENT inputs than visible (acme/gpu/42 vs t1/api/5); also check the
    # recorded event round-trips the fields, not just length.
    b = fresh()
    b.ingest("acme", "req-A", "gpu", 42, 7777)
    u = b.usage_for("acme")
    assert len(u) == 1
    ev = u[0]
    assert ev["tenant_id"] == "acme"
    assert ev["metric"] == "gpu"
    assert ev["quantity"] == 42
    # A second, genuinely distinct request must be recorded (not a no-op).
    b.ingest("acme", "req-B", "gpu", 8, 7778)
    assert len(b.usage_for("acme")) == 2


# --- R2: dedup by (tenant_id, request_id) is a no-op ------------------------
def test_R2_h():
    # Metamorphic: re-ingesting the SAME (tenant, request) any number of times,
    # even with different metric/qty/timestamp, is idempotent (no loss, no dup).
    b = fresh()
    b.ingest("z", "dup-1", "compute", 30, 1)
    b.ingest("z", "dup-1", "compute", 30, 2)   # exact repeat -> no-op
    b.ingest("z", "dup-1", "store", 999, 3)     # same key, diff payload -> still no-op
    assert len(b.usage_for("z")) == 1
    assert b.metered("z", "compute") == 30
    assert b.metered("z", "store") == 0  # the dup never created a 'store' event


# --- R3: every accepted ingest appends 'usage.ingested'; audit_log is a tuple
def test_R3_h():
    b = fresh()
    b.ingest("z", "a", "m", 1, 1)
    b.ingest("z", "b", "m", 2, 2)
    b.ingest("z", "a", "m", 9, 3)  # dedup no-op -> must NOT append an audit entry
    log = b.audit_log
    assert isinstance(log, tuple)  # immutable view
    ingested = [e for e in log if e.get("type") == "usage.ingested"]
    # exactly two unique ingests -> exactly two audit entries (dup didn't append)
    assert len(ingested) == 2
    # Mutating the returned tuple must not be possible / must not affect internal log.
    with pytest.raises((AttributeError, TypeError)):
        log.append({"type": "tampered"})  # tuples have no append
    assert len([e for e in b.audit_log if e.get("type") == "usage.ingested"]) == 2


# --- R4: usage_for / metered are tenant-isolated ----------------------------
def test_R4_h():
    # Three tenants share request_ids and metrics; isolation must hold per tenant.
    b = fresh()
    b.ingest("A", "shared", "m", 3, 1)
    b.ingest("B", "shared", "m", 4, 1)
    b.ingest("C", "shared", "m", 5, 1)
    ua = b.usage_for("A")
    assert len(ua) == 1
    assert all(e["tenant_id"] == "A" for e in ua)
    assert b.metered("A", "m") == 3
    assert b.metered("B", "m") == 4
    assert b.metered("C", "m") == 5
    # An unknown tenant sees nothing.
    assert b.usage_for("ghost") == []
    assert b.metered("ghost", "m") == 0


# --- R5: metered = summed deduped quantity for tenant+metric -----------------
def test_R5_h():
    # DIFFERENT quantities/metrics; includes a dedup that must NOT be summed twice.
    b = fresh()
    b.ingest("z", "k1", "api", 10, 1)
    b.ingest("z", "k2", "api", 7, 2)
    b.ingest("z", "k1", "api", 10, 3)   # dup of k1 -> ignored
    b.ingest("z", "k3", "store", 21, 4)
    assert b.metered("z", "api") == 17        # 10 + 7 (dup not counted)
    assert b.metered("z", "store") == 21
    # An unknown metric for a known tenant aggregates to 0.
    assert b.metered("z", "nope") == 0


# --- R6: tiered pricing first 1000 @0.01, remainder @0.008 -------------------
def test_R6_h():
    # 2000 units -> 1000*0.01 + 1000*0.008 = 10 + 8 = 18.00  (visible uses 1500)
    b = fresh()
    b.ingest("z", "r", "compute", 2000, 1)
    inv = b.issue_invoice("z")
    assert money_eq(inv["lines"]["compute"]["amount"], _price(2000))  # 18.00
    assert money_eq(inv["lines"]["compute"]["amount"], 18.00)
    # Boundary: exactly 1000 units stays entirely in tier 1 -> 10.00.
    b2 = fresh()
    b2.ingest("z", "r", "compute", 1000, 1)
    inv2 = b2.issue_invoice("z")
    assert money_eq(inv2["lines"]["compute"]["amount"], 10.00)
    # Just over boundary: 1001 -> 10 + 1*0.008 = 10.01 (proves the tier split point).
    b3 = fresh()
    b3.ingest("z", "r", "compute", 1001, 1)
    inv3 = b3.issue_invoice("z")
    assert money_eq(inv3["lines"]["compute"]["amount"], 10.01)


# --- R7: invoice total has a $5.00 minimum floor ----------------------------
def test_R7_h():
    # 250 units -> 2.50 priced, below floor -> total must be exactly 5.00.
    b = fresh()
    b.ingest("z", "r", "api", 250, 1)
    inv = b.issue_invoice("z")
    assert money_eq(inv["total"], 5.00)
    # And a just-above-floor case must NOT be raised to 5: 600 units -> 6.00 > 5.
    b2 = fresh()
    b2.ingest("z", "r", "api", 600, 1)
    assert money_eq(b2.issue_invoice("z")["total"], 6.00)


# --- R8: all monetary amounts rounded HALF-UP to 2 decimals -----------------
def test_R8_h():
    # 1237 units -> 10 + 237*0.008 = 10 + 1.896 = 11.896 -> HALF-UP -> 11.90.
    # (visible uses 1234 -> 11.87). Third decimal 6 rounds the cent UP.
    b = fresh()
    b.ingest("z", "r", "api", 1237, 1)
    inv = b.issue_invoice("z")
    expected = _price(1237)  # Decimal('11.90')
    assert money_eq(inv["lines"]["api"]["amount"], expected)
    assert money_eq(inv["total"], expected)
    # The amount must be a clean 2-decimal value (no float dust like 11.9000001).
    amt = inv["lines"]["api"]["amount"]
    assert money_eq(amt, round(float(expected), 2))
    # Sanity that HALF-UP actually rounded up, not down/truncated.
    assert money_eq(amt, 11.90)
    assert not money_eq(amt, 11.89)


# --- R9: issue_invoice idempotent (same id + totals) ------------------------
def test_R9_h():
    # DIFFERENT qty (2000) and metamorphic: many re-issues are byte-identical.
    b = fresh()
    b.ingest("z", "r", "compute", 2000, 1)
    first = b.issue_invoice("z")
    again = b.issue_invoice("z")
    third = b.issue_invoice("z")
    assert first["id"] == again["id"] == third["id"]
    assert money_eq(first["total"], again["total"])
    assert money_eq(first["total"], third["total"])
    assert money_eq(first["total"], 18.00)
    # Re-issuing must not append extra 'invoice.issued' audit entries.
    issued = [e for e in b.audit_log if e.get("type") == "invoice.issued"]
    assert len(issued) == 1


# --- R10: reconcile returns drift; 0.0 when consistent ----------------------
def test_R10_h():
    # Consistent right after issuance -> 0.0; then new usage creates drift.
    b = fresh()
    b.ingest("z", "r1", "api", 2000, 1)
    b.issue_invoice("z")
    assert money_eq(b.reconcile("z"), 0.0)
    # Add genuinely new usage AFTER the invoice -> drift equals the added qty.
    b.ingest("z", "r2", "api", 500, 2)
    assert money_eq(b.reconcile("z"), 500.0)


# --- R11: issuing an invoice appends 'invoice.issued' -----------------------
def test_R11_h():
    # DIFFERENT qty; also assert the entry carries this tenant and appears after
    # the usage entry (append-only ordering).
    b = fresh()
    b.ingest("z", "r", "store", 2000, 1)
    b.issue_invoice("z")
    log = b.audit_log
    issued = [e for e in log if e.get("type") == "invoice.issued"]
    assert len(issued) == 1
    assert issued[0].get("tenant_id") == "z"
    types = [e.get("type") for e in log]
    assert types.index("usage.ingested") < types.index("invoice.issued")


# --- R12: ingest rejects negative quantity with BillingError ----------------
def test_R12_h():
    b = fresh()
    # DIFFERENT negative value than visible (-3); also a larger negative.
    with pytest.raises(BillingError):
        b.ingest("z", "r", "api", -1, 1)
    with pytest.raises(BillingError):
        b.ingest("z", "r2", "api", -250, 2)
    # Rejected ingests must leave no event and no audit entry behind.
    assert b.usage_for("z") == []
    assert all(e.get("type") != "usage.ingested" for e in b.audit_log)

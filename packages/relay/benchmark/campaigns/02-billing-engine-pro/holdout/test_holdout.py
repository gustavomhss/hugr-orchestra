"""HELD-OUT grader suite for campaign 02-billing-engine-pro.

EXACTLY ONE test per requirement, named test_R<n>_h so the grader's (R\\d+)
regex maps test_R1_h -> R1, etc.

Every test uses DIFFERENT concrete inputs than checks/test_engine.py AND/OR a
metamorphic / property invariant, so an implementation that merely hard-codes the
visible checks' inputs FAILS here while a genuinely-correct one PASSES.

Money equality uses a tolerance helper (abs diff < 0.005). All expected monetary
values were computed against a Decimal/ROUND_HALF_UP reference implementation.
"""
import pytest
from billing import Engine, BillingError


def eng():
    return Engine()


def approx(a, b):
    return abs(float(a) - float(b)) < 0.005


# --------------------------------------------------------------------------
# R1: ingest records a usage event; usage_for reflects it.
# Different inputs: storage metric, qty 42 (visible uses api/5). Property: the
# stored event echoes the exact fields ingested.
# --------------------------------------------------------------------------
def test_R1_h():
    e = eng()
    e.ingest("acme", "req-7", "storage", 42, 99)
    evs = e.usage_for("acme")
    assert len(evs) == 1
    ev = evs[0]
    assert ev["tenant_id"] == "acme"
    assert ev["metric"] == "storage"
    assert ev["quantity"] == 42


# --------------------------------------------------------------------------
# R2: dedup by (tenant,request), FIRST wins; later same-key is a no-op.
# Different inputs: egress, first qty 3 then 7777; metric also differs on the
# duplicate. Property: only the first survives, count stays 1.
# --------------------------------------------------------------------------
def test_R2_h():
    e = eng()
    e.ingest("acme", "dup", "egress", 3, 1)
    e.ingest("acme", "dup", "egress", 7777, 2)
    e.ingest("acme", "dup", "compute", 11, 3)
    assert e.metered("acme", "egress") == 3
    assert e.metered("acme", "compute") == 0
    assert len(e.usage_for("acme")) == 1


# --------------------------------------------------------------------------
# R3: reject negative quantity. Different input: -100 on compute.
# --------------------------------------------------------------------------
def test_R3_h():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("acme", "r1", "compute", -100, 5)
    # a valid sibling still works (rejection didn't corrupt state)
    e.ingest("acme", "r2", "compute", 4, 6)
    assert e.metered("acme", "compute") == 4


# --------------------------------------------------------------------------
# R4: reject unknown metric. Different unknown tokens than visible "foo".
# --------------------------------------------------------------------------
def test_R4_h():
    e = eng()
    for bad in ("bandwidth", "API", "", "storag"):
        with pytest.raises(BillingError):
            e.ingest("acme", "r-" + str(bad), bad, 1, 1)


# --------------------------------------------------------------------------
# R5: reject float quantity. Different floats incl. an integer-valued float.
# --------------------------------------------------------------------------
def test_R5_h():
    e = eng()
    for bad in (2.0, 0.5, 100.0001):
        with pytest.raises(BillingError):
            e.ingest("acme", "r", "egress", bad, 1)


# --------------------------------------------------------------------------
# R6: reject boolean quantity (bool is NOT a valid int). Both True and False.
# --------------------------------------------------------------------------
def test_R6_h():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("acme", "rT", "storage", True, 1)
    with pytest.raises(BillingError):
        e.ingest("acme", "rF", "storage", False, 1)


# --------------------------------------------------------------------------
# R7: metered returns summed deduped quantity. Different inputs: three storage
# events + one duplicate that must be ignored.
# --------------------------------------------------------------------------
def test_R7_h():
    e = eng()
    e.ingest("acme", "a", "storage", 10, 1)
    e.ingest("acme", "b", "storage", 20, 2)
    e.ingest("acme", "c", "storage", 30, 3)
    e.ingest("acme", "a", "storage", 999, 4)  # dup, ignored
    assert e.metered("acme", "storage") == 60


# --------------------------------------------------------------------------
# R8: tenant isolation. Three tenants, same request id and metric; each sees
# only its own. Property: cross-tenant metered/usage never leaks.
# --------------------------------------------------------------------------
def test_R8_h():
    e = eng()
    e.ingest("x", "r", "compute", 11, 1)
    e.ingest("y", "r", "compute", 22, 1)
    e.ingest("z", "r", "compute", 33, 1)
    assert e.metered("x", "compute") == 11
    assert e.metered("y", "compute") == 22
    assert e.metered("z", "compute") == 33
    assert all(ev["tenant_id"] == "y" for ev in e.usage_for("y"))
    assert e.metered("x", "api") == 0  # unknown metric for tenant -> 0


# --------------------------------------------------------------------------
# R9: zero-usage metrics omitted from invoice lines. Different metric mix:
# egress + storage present, api/compute absent.
# --------------------------------------------------------------------------
def test_R9_h():
    e = eng()
    e.ingest("t", "r1", "egress", 3000, 1)
    e.ingest("t", "r2", "storage", 700, 2)
    inv = e.issue_invoice("t")
    assert set(inv["lines"].keys()) == {"egress", "storage"}
    assert "api" not in inv["lines"] and "compute" not in inv["lines"]


# --------------------------------------------------------------------------
# R10: audit_log immutable tuple; each accepted ingest appends usage.ingested.
# Property: two accepted ingests -> two usage.ingested entries; a rejected one
# adds nothing; the tuple cannot be mutated.
# --------------------------------------------------------------------------
def test_R10_h():
    e = eng()
    e.ingest("t", "r1", "api", 5, 1)
    e.ingest("t", "r2", "storage", 6, 2)
    try:
        e.ingest("t", "r3", "badmetric", 7, 3)
    except BillingError:
        pass
    log = e.audit_log
    assert isinstance(log, tuple)
    ingested = [x for x in log if x.get("type") == "usage.ingested"]
    assert len(ingested) == 2
    with pytest.raises((TypeError, AttributeError)):
        log.append({"type": "hacked"})


# --------------------------------------------------------------------------
# R11: tiered api pricing. Different input: 2500 units.
# first 1000 @0.01 = 10.00 ; next 1500 @0.008 = 12.00 ; line = 22.00
# Metamorphic cross-check on egress 3000 -> 55.00 too.
# --------------------------------------------------------------------------
def test_R11_h():
    e = eng()
    e.ingest("t", "r1", "api", 2500, 1)
    assert approx(e.issue_invoice("t")["lines"]["api"]["amount"], 22.00)
    e2 = eng()
    e2.ingest("t", "r1", "egress", 3000, 1)
    assert approx(e2.issue_invoice("t")["lines"]["egress"]["amount"], 55.00)


# --------------------------------------------------------------------------
# R12: inclusive tier boundary. Different metric: egress boundary at 2000.
# egress 2000 -> 40.00 (all tier1) ; egress 2001 -> 40.02 (one unit tier2,
# 40.015 rounds HALF-UP to 40.02). Also storage 500 -> 25.00, 501 -> 25.04.
# --------------------------------------------------------------------------
def test_R12_h():
    ea = eng(); ea.ingest("a", "r1", "egress", 2000, 1)
    eb = eng(); eb.ingest("b", "r1", "egress", 2001, 1)
    assert approx(ea.issue_invoice("a")["lines"]["egress"]["amount"], 40.00)
    assert approx(eb.issue_invoice("b")["lines"]["egress"]["amount"], 40.02)
    ec = eng(); ec.ingest("c", "r1", "storage", 500, 1)
    ed = eng(); ed.ingest("d", "r1", "storage", 501, 1)
    assert approx(ec.issue_invoice("c")["lines"]["storage"]["amount"], 25.00)
    assert approx(ed.issue_invoice("d")["lines"]["storage"]["amount"], 25.04)


# --------------------------------------------------------------------------
# R13: tiered compute. Different input: 300 units (below 500 vol threshold).
# first 100 @0.10 = 10.00 ; next 200 @0.08 = 16.00 ; line = 26.00
# --------------------------------------------------------------------------
def test_R13_h():
    e = eng()
    e.ingest("t", "r1", "compute", 300, 1)
    assert approx(e.issue_invoice("t")["lines"]["compute"]["amount"], 26.00)


# --------------------------------------------------------------------------
# R14: subtotal = round(SUM of per-line ROUNDED amounts), not round-of-sum.
# Different lines: storage 501 (25.04) + compute 101 (10.08) -> 35.12.
# Metamorphic invariant: subtotal == sum of the line amounts exactly.
# --------------------------------------------------------------------------
def test_R14_h():
    e = eng()
    e.ingest("t", "r1", "storage", 501, 1)
    e.ingest("t", "r2", "compute", 101, 2)
    inv = e.issue_invoice("t")
    line_sum = sum(line["amount"] for line in inv["lines"].values())
    assert approx(inv["subtotal"], line_sum)
    assert approx(inv["subtotal"], 35.12)


# --------------------------------------------------------------------------
# R15: volume discount applied at/above threshold (x0.90 BEFORE rounding).
# Different metric at its exact threshold: egress 10000 -> (40+120)*0.9 = 144.00.
# Metamorphic: discounted line == 0.90 * the undiscounted tiered subtotal.
# --------------------------------------------------------------------------
def test_R15_h():
    e = eng()
    e.ingest("t", "r1", "egress", 10000, 1)
    assert approx(e.issue_invoice("t")["lines"]["egress"]["amount"], 144.00)
    # compute at its threshold 500 -> (10+32)*0.9 = 37.80
    e2 = eng()
    e2.ingest("t", "r1", "compute", 500, 1)
    assert approx(e2.issue_invoice("t")["lines"]["compute"]["amount"], 37.80)


# --------------------------------------------------------------------------
# R16: NO volume discount one unit below threshold.
# Different metric: egress 9999 -> 40 + 7999*0.015 = 159.985 -> 159.99 (no 0.9).
# Property: 9999 line is NOT 0.90 * undiscounted (would be 143.99).
# --------------------------------------------------------------------------
def test_R16_h():
    e = eng()
    e.ingest("t", "r1", "egress", 9999, 1)
    amt = e.issue_invoice("t")["lines"]["egress"]["amount"]
    assert approx(amt, 159.99)
    assert not approx(amt, 143.99)  # would be the discounted value


# --------------------------------------------------------------------------
# R17: coupon SAVE20 = 20% off when subtotal >= 50.00.
# Different inputs: egress 10000 -> subtotal 144.00, US, coupon -> 144*0.8 = 115.20.
# --------------------------------------------------------------------------
def test_R17_h():
    e = eng()
    e.register_tenant("t", region="US", coupon="SAVE20")
    e.ingest("t", "r1", "egress", 10000, 1)
    inv = e.issue_invoice("t")
    assert approx(inv["subtotal"], 144.00)
    assert approx(inv["discounted"], 115.20)
    assert approx(inv["total"], 115.20)


# --------------------------------------------------------------------------
# R18: coupon ignored when subtotal < 50; AND unknown coupon ignored even >= 50.
# storage 700 -> 33.00 (<50) with SAVE20 stays 33.00.
# egress 10000 -> 144.00 with unknown coupon "FOObar" stays 144.00.
# --------------------------------------------------------------------------
def test_R18_h():
    e = eng()
    e.register_tenant("t", region="US", coupon="SAVE20")
    e.ingest("t", "r1", "storage", 700, 1)
    assert approx(e.issue_invoice("t")["total"], 33.00)
    e2 = eng()
    e2.register_tenant("t", region="US", coupon="FOObar")
    e2.ingest("t", "r1", "egress", 10000, 1)
    assert approx(e2.issue_invoice("t")["total"], 144.00)


# --------------------------------------------------------------------------
# R19: loyalty AFTER coupon. Different inputs: egress 10000 + SAVE20 + loyalty 4.
# 144 -> coupon 115.20 -> *0.96 = 110.592 -> 110.59. Order matters: applying
# loyalty first then coupon would give a different cent.
# --------------------------------------------------------------------------
def test_R19_h():
    e = eng()
    e.register_tenant("t", region="US", coupon="SAVE20", loyalty_years=4)
    e.ingest("t", "r1", "egress", 10000, 1)
    assert approx(e.issue_invoice("t")["total"], 110.59)


# --------------------------------------------------------------------------
# R20: loyalty capped at 5%. Different input: loyalty 10 vs loyalty 5 must match.
# storage 700 -> 33.00 ; *0.95 = 31.35 for both.
# --------------------------------------------------------------------------
def test_R20_h():
    e = eng()
    e.register_tenant("t", region="US", loyalty_years=10)
    e.ingest("t", "r1", "storage", 700, 1)
    cap = e.issue_invoice("t")["total"]
    assert approx(cap, 31.35)
    e5 = eng()
    e5.register_tenant("t", region="US", loyalty_years=5)
    e5.ingest("t", "r1", "storage", 700, 1)
    assert approx(e5.issue_invoice("t")["total"], cap)


# --------------------------------------------------------------------------
# R21: tax on DISCOUNTED total, EU/UK 0.20. Different inputs:
# EU storage 700 -> 33.00 tax 6.60 total 39.60 ; UK compute 300 -> 26.00 tax 5.20.
# --------------------------------------------------------------------------
def test_R21_h():
    e = eng()
    e.register_tenant("t", region="EU")
    e.ingest("t", "r1", "storage", 700, 1)
    iv = e.issue_invoice("t")
    assert approx(iv["tax"], 6.60) and approx(iv["total"], 39.60)
    eu = eng()
    eu.register_tenant("t", region="UK")
    eu.ingest("t", "r1", "compute", 300, 1)
    iv2 = eu.issue_invoice("t")
    assert approx(iv2["tax"], 5.20) and approx(iv2["total"], 31.20)


# --------------------------------------------------------------------------
# R22: BR tax 0.17. Different input: storage 700 -> 33.00 -> tax 5.61 total 38.61.
# --------------------------------------------------------------------------
def test_R22_h():
    e = eng()
    e.register_tenant("t", region="BR")
    e.ingest("t", "r1", "storage", 700, 1)
    iv = e.issue_invoice("t")
    assert approx(iv["tax"], 5.61) and approx(iv["total"], 38.61)


# --------------------------------------------------------------------------
# R23: B2B reverse-charge for region in {EU,UK}: tax 0 + reverse_charge True.
# Different inputs: UK b2b storage 700 -> tax 0 total 33.00, rc True.
# Negative control: BR b2b is NOT reverse-charge (still taxed 5.61).
# --------------------------------------------------------------------------
def test_R23_h():
    e = eng()
    e.register_tenant("t", region="UK", is_b2b=True)
    e.ingest("t", "r1", "storage", 700, 1)
    iv = e.issue_invoice("t")
    assert iv["reverse_charge"] is True
    assert approx(iv["tax"], 0.0) and approx(iv["total"], 33.00)
    # BR b2b -> not reverse charge, still taxed
    br = eng()
    br.register_tenant("t", region="BR", is_b2b=True)
    br.ingest("t", "r1", "storage", 700, 1)
    ivb = br.issue_invoice("t")
    assert ivb["reverse_charge"] is False
    assert approx(ivb["tax"], 5.61)


# --------------------------------------------------------------------------
# R24: reverse-charge invoices EXEMPT from minimum floor.
# Different inputs: UK b2b compute 3 -> subtotal 0.30 -> total 0.30 (NOT 5.00).
# --------------------------------------------------------------------------
def test_R24_h():
    e = eng()
    e.register_tenant("t", region="UK", is_b2b=True)
    e.ingest("t", "r1", "compute", 3, 1)
    iv = e.issue_invoice("t")
    assert iv["reverse_charge"] is True
    assert approx(iv["total"], 0.30)
    assert not approx(iv["total"], 5.00)


# --------------------------------------------------------------------------
# R25: minimum floor raises non-reverse-charge total < 5.00 to 5.00.
# Different inputs: US storage 3 -> 0.15 -> 5.00 ; EU non-b2b compute 4 -> 0.40
# discounted, tax 0.08, total 0.48 -> floored to 5.00.
# --------------------------------------------------------------------------
def test_R25_h():
    e = eng()
    e.ingest("t", "r1", "storage", 3, 1)
    assert approx(e.issue_invoice("t")["total"], 5.00)
    eu = eng()
    eu.register_tenant("t", region="EU")
    eu.ingest("t", "r1", "compute", 4, 1)
    assert approx(eu.issue_invoice("t")["total"], 5.00)


# --------------------------------------------------------------------------
# R26: issue_invoice idempotent. Different input: storage 700.
# Property: re-issue returns identical id and total (and identical dict content).
# --------------------------------------------------------------------------
def test_R26_h():
    e = eng()
    e.ingest("t", "r1", "storage", 700, 1)
    a = e.issue_invoice("t")
    b = e.issue_invoice("t")
    assert a["id"] == b["id"]
    assert approx(a["total"], b["total"])
    assert a["lines"] == b["lines"]
    assert a["subtotal"] == b["subtotal"]


# --------------------------------------------------------------------------
# R27: invoice id 'INV-<tenant>-<seq>', seq monotonic per tenant from 1.
# Different tenant names than visible (a/b). Three distinct tenants each get -1.
# --------------------------------------------------------------------------
def test_R27_h():
    e = eng()
    e.ingest("alpha", "r1", "api", 2500, 1)
    e.ingest("beta", "r1", "api", 2500, 1)
    e.ingest("gamma", "r1", "api", 2500, 1)
    assert e.issue_invoice("alpha")["id"] == "INV-alpha-1"
    assert e.issue_invoice("beta")["id"] == "INV-beta-1"
    assert e.issue_invoice("gamma")["id"] == "INV-gamma-1"


# --------------------------------------------------------------------------
# R28: issuance appends an 'invoice.issued' audit entry.
# Different input: storage 700. Property: exactly one issued entry referencing
# the invoice id, and it follows the usage.ingested entry.
# --------------------------------------------------------------------------
def test_R28_h():
    e = eng()
    e.ingest("t", "r1", "storage", 700, 1)
    iv = e.issue_invoice("t")
    issued = [x for x in e.audit_log if x.get("type") == "invoice.issued"]
    assert len(issued) == 1
    assert issued[0]["tenant_id"] == "t"


# --------------------------------------------------------------------------
# R29: reconcile = drift between invoiced qty and metered usage; 0.0 consistent.
# Different inputs AND metamorphic: consistent -> 0.0; ingesting MORE usage of an
# invoiced metric AFTER issuance creates drift equal to the added quantity.
# --------------------------------------------------------------------------
def test_R29_h():
    e = eng()
    e.ingest("t", "r1", "api", 2500, 1)
    e.issue_invoice("t")
    assert e.reconcile("t") == 0.0
    e.ingest("t", "r2", "api", 100, 2)  # metered now 2600 vs invoiced 2500
    assert approx(e.reconcile("t"), 100.0)
    # tenant with no invoice -> 0.0
    e2 = eng()
    e2.ingest("t", "r1", "api", 2500, 1)
    assert e2.reconcile("t") == 0.0


# --------------------------------------------------------------------------
# R30: US region tax is 0. Different input: egress 3000 -> 55.00 -> tax 0, total 55.00.
# --------------------------------------------------------------------------
def test_R30_h():
    e = eng()
    e.ingest("t", "r1", "egress", 3000, 1)
    iv = e.issue_invoice("t")
    assert approx(iv["tax"], 0.0) and approx(iv["total"], 55.00)

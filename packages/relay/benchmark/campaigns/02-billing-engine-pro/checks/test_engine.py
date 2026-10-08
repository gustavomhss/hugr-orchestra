import pytest
from billing import Engine, BillingError


def eng():
    return Engine()


def approx(a, b):
    return abs(float(a) - float(b)) < 0.005


def test_R1_ingest():
    e = eng(); e.ingest("t", "r1", "api", 5, 1)
    assert len(e.usage_for("t")) == 1


def test_R2_dedup_first_wins():
    e = eng(); e.ingest("t", "r1", "api", 5, 1); e.ingest("t", "r1", "api", 999, 2)
    assert e.metered("t", "api") == 5 and len(e.usage_for("t")) == 1


def test_R3_reject_negative():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("t", "r1", "api", -1, 1)


def test_R4_reject_unknown_metric():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("t", "r1", "foo", 1, 1)


def test_R5_reject_float_qty():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("t", "r1", "api", 1.5, 1)


def test_R6_reject_bool_qty():
    e = eng()
    with pytest.raises(BillingError):
        e.ingest("t", "r1", "api", True, 1)


def test_R7_metered_sum():
    e = eng(); e.ingest("t", "r1", "api", 5, 1); e.ingest("t", "r2", "api", 7, 2)
    assert e.metered("t", "api") == 12


def test_R8_tenant_isolation():
    e = eng(); e.ingest("a", "r1", "api", 5, 1); e.ingest("b", "r1", "api", 9, 1)
    assert e.metered("a", "api") == 5 and e.metered("b", "api") == 9
    assert all(x["tenant_id"] == "a" for x in e.usage_for("a"))


def test_R9_zero_usage_omitted():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1); e.ingest("t", "r2", "compute", 50, 2)
    assert set(e.issue_invoice("t")["lines"].keys()) == {"api", "compute"}


def test_R10_audit_append_only():
    e = eng(); e.ingest("t", "r1", "api", 5, 1)
    log = e.audit_log
    assert isinstance(log, tuple)
    assert any(x.get("type") == "usage.ingested" for x in log)


def test_R11_tiered_api():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1)
    assert approx(e.issue_invoice("t")["lines"]["api"]["amount"], 14.00)


def test_R12_tier_boundary_inclusive():
    e = eng(); e.ingest("a", "r1", "api", 1000, 1); e.ingest("b", "r1", "api", 1001, 1)
    assert approx(e.issue_invoice("a")["lines"]["api"]["amount"], 10.00)
    assert approx(e.issue_invoice("b")["lines"]["api"]["amount"], 10.01)


def test_R13_tiered_compute():
    e = eng(); e.ingest("t", "r1", "compute", 101, 1)
    assert approx(e.issue_invoice("t")["lines"]["compute"]["amount"], 10.08)


def test_R14_sum_of_rounded_lines():
    e = eng(); e.ingest("t", "r1", "api", 1001, 1); e.ingest("t", "r2", "egress", 2001, 2)
    assert approx(e.issue_invoice("t")["subtotal"], 50.03)


def test_R15_volume_discount_applied():
    e = eng(); e.ingest("t", "r1", "storage", 1000, 1)
    assert approx(e.issue_invoice("t")["lines"]["storage"]["amount"], 40.50)


def test_R16_volume_discount_below_threshold():
    e = eng(); e.ingest("t", "r1", "storage", 999, 1)
    assert approx(e.issue_invoice("t")["lines"]["storage"]["amount"], 44.96)


def test_R17_coupon_applied_ge50():
    e = eng(); e.register_tenant("t", region="US", coupon="SAVE20")
    e.ingest("t", "r1", "api", 1001, 1); e.ingest("t", "r2", "egress", 2001, 2)
    assert approx(e.issue_invoice("t")["total"], 40.02)


def test_R18_coupon_ignored_lt50():
    e = eng(); e.register_tenant("t", region="US", coupon="SAVE20")
    e.ingest("t", "r1", "api", 1500, 1)
    assert approx(e.issue_invoice("t")["total"], 14.00)


def test_R19_loyalty_after_coupon():
    e = eng(); e.register_tenant("t", region="US", loyalty_years=3)
    e.ingest("t", "r1", "api", 1500, 1)
    assert approx(e.issue_invoice("t")["total"], 13.58)


def test_R20_loyalty_capped_5pct():
    e = eng(); e.register_tenant("t", region="US", loyalty_years=8)
    e.ingest("t", "r1", "api", 1500, 1)
    assert approx(e.issue_invoice("t")["total"], 13.30)


def test_R21_tax_eu():
    e = eng(); e.register_tenant("t", region="EU"); e.ingest("t", "r1", "api", 1500, 1)
    iv = e.issue_invoice("t")
    assert approx(iv["tax"], 2.80) and approx(iv["total"], 16.80)


def test_R22_tax_br():
    e = eng(); e.register_tenant("t", region="BR"); e.ingest("t", "r1", "api", 1500, 1)
    assert approx(e.issue_invoice("t")["total"], 16.38)


def test_R23_reverse_charge_flag():
    e = eng(); e.register_tenant("t", region="EU", is_b2b=True); e.ingest("t", "r1", "api", 1500, 1)
    iv = e.issue_invoice("t")
    assert iv["reverse_charge"] is True and approx(iv["tax"], 0.0) and approx(iv["total"], 14.00)


def test_R24_reverse_charge_exempt_floor():
    e = eng(); e.register_tenant("t", region="EU", is_b2b=True); e.ingest("t", "r1", "api", 1, 1)
    assert approx(e.issue_invoice("t")["total"], 0.01)


def test_R25_minimum_floor():
    e = eng(); e.ingest("t", "r1", "api", 100, 1)
    assert approx(e.issue_invoice("t")["total"], 5.00)


def test_R26_idempotent_issue():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1)
    a = e.issue_invoice("t"); b = e.issue_invoice("t")
    assert a["id"] == b["id"] and approx(a["total"], b["total"])


def test_R27_invoice_id_seq():
    e = eng(); e.ingest("a", "r1", "api", 1500, 1); e.ingest("b", "r1", "api", 1500, 1)
    assert e.issue_invoice("a")["id"] == "INV-a-1" and e.issue_invoice("b")["id"] == "INV-b-1"


def test_R28_audit_on_issue():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1); e.issue_invoice("t")
    assert any(x.get("type") == "invoice.issued" for x in e.audit_log)


def test_R29_reconcile_zero():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1); e.issue_invoice("t")
    assert e.reconcile("t") == 0.0


def test_R30_us_zero_tax():
    e = eng(); e.ingest("t", "r1", "api", 1500, 1)
    iv = e.issue_invoice("t")
    assert approx(iv["tax"], 0.0) and approx(iv["total"], 14.00)

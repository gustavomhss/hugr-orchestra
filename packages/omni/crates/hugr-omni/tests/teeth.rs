//! Teeth of the contract runner's own checks: the pending ledger, the harness-vs-product split, and the JS/Rust regex
//! subset. A separate binary, so `contract` stays the only test of its own (it sets an env var before any thread).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod runner;

use std::collections::{BTreeMap, BTreeSet};

use runner::ledger::{self, Ledger};
use runner::pattern::pattern;
use serde_json::Value;

/// A pending item that passes, an unknown ID, a repeated ID and a malformed line turn the suite red.
#[test]
fn ledger_teeth() {
    let known: BTreeSet<String> = ["C-KILL-01", "C-IO-01"].map(String::from).into();
    let ran = |pass: bool| BTreeMap::from([("C-KILL-01".to_string(), pass)]);
    let (l, e) = Ledger::parse("# comment\n\nC-KILL-01 W07\n");
    assert!(e.is_empty() && l.pending("C-KILL-01") && !l.pending("C-IO-01"));
    assert!(
        l.check(&known, &ran(false)).is_empty(),
        "a failing pending item is only pending"
    );
    let red = l.check(&known, &ran(true));
    assert!(
        red.len() == 1 && red[0].contains("remove it from conformance/pending.txt"),
        "{red:?}"
    );
    let (l, _) = Ledger::parse("C-NOPE-01 W07\n");
    assert_eq!(l.check(&known, &ran(false)).len(), 1, "an unknown ID fails");
    let (_, e) = Ledger::parse("C-KILL-01 W07\nC-KILL-01 W07\n");
    assert!(e.len() == 1 && e[0].contains("twice"), "{e:?}");
    let (_, e) = Ledger::parse("C-KILL-01\nkill W07\nC-KILL-01 W07 extra\n");
    assert_eq!(e.len(), 3, "malformed lines fail: {e:?}");
    assert_eq!(ledger::item("C-KILL-01.tree"), "C-KILL-01");
}

/// For a pending item, only a product failure is `pending`. Every scenario mistake below fails the suite, including
/// those after a first step that fails as a product failure (`late-*`): a scenario is validated whole, at load.
#[test]
fn harness_failures_are_never_pending() {
    let dir = std::env::temp_dir().join(format!("omni-teeth-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // The library cannot start this program: a product failure, so a pending item stops there as `pending`.
    let fails = r#"{"spawn": ["/omni-no-such-dir/omni-nope"], "options": {"pty": true}, "as": "c"}"#;
    let cases: [(&str, String); 11] = [
        ("broken-json", "{".into()),
        (
            "bad-regex",
            format!(r#""steps": [{fails}, {{"read": "c", "until": {{"match": "(?!x)"}}}}]"#),
        ),
        ("unknown-var", r#""steps": [{"spawn": ["${NOPE}"]}]"#.into()),
        (
            "bad-matcher",
            r#""steps": [{"run": ["/omni-no-such-dir/x"], "expect": {"exitCode": {"bogus": 0}}}]"#.into(),
        ),
        (
            "late-no-rows",
            format!(r#""steps": [{fails}, {{"resize": "c", "cols": 80}}]"#),
        ),
        ("late-bad-files", format!(r#""files": ["x"], "steps": [{fails}]"#)),
        ("late-no-handle", format!(r#""steps": [{fails}, {{"wait": "nope"}}]"#)),
        (
            "late-unknown-var",
            format!(r#""steps": [{fails}, {{"os": "dead", "pids": "${{nope}}"}}]"#),
        ),
        ("late-close-pty", format!(r#""steps": [{fails}, {{"write": "c"}}]"#)),
        (
            "late-no-pids",
            format!(r#""steps": [{fails}, {{"os": "dead", "pids": []}}]"#),
        ),
        (
            "product",
            format!(r#""steps": [{fails}, {{"resize": "c", "cols": 80, "rows": 24}}]"#),
        ),
    ];
    for (name, body) in &cases {
        let text = if body == "{" {
            body.clone()
        } else {
            format!(r#"{{"id": "C-KILL-01.{name}", {body}}}"#)
        };
        std::fs::write(dir.join(format!("C-KILL-01.{name}.json")), text).unwrap();
    }
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let sum = runtime.block_on(runner::suite(&dir, "C-KILL-01 W07\n", &dir.join("no-fixture-needed")));
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(
        (sum.passed, sum.pending, sum.ran, sum.files),
        (0, 1, 11, 11),
        "{:?}",
        sum.errors
    );
    assert_eq!(sum.errors.len(), 10, "{:?}", sum.errors);
    for (name, _) in cases.iter().filter(|(n, _)| *n != "product") {
        let line = sum.errors.iter().find(|e| e.starts_with(&format!("C-KILL-01.{name}:")));
        assert!(
            line.is_some_and(|l| l.contains("bad scenario")),
            "{name}: {:?}",
            sum.errors
        );
    }
}

/// The differential table (`conformance/regex-table.json`, shared with the TS runner): Rust reads each accepted pattern as
/// JavaScript does, and every construct outside the subset is refused.
#[test]
fn regex_table() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/regex-table.json");
    let table: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let list = |v: &Value, key: &str| v[key].as_array().cloned().unwrap_or_default();
    for case in list(&table, "accepted") {
        let p = case["pattern"].as_str().unwrap();
        let re = pattern(p).unwrap_or_else(|e| panic!("{p} must be accepted: {e}"));
        for input in list(&case, "match") {
            assert!(re.is_match(input.as_str().unwrap()), "{p} must match {input}");
        }
        for input in list(&case, "nomatch") {
            assert!(!re.is_match(input.as_str().unwrap()), "{p} must not match {input}");
        }
        for (input, group) in case["group1"].as_object().into_iter().flatten() {
            let got = re.captures(input).and_then(|c| c.get(1)).map(|m| m.as_str());
            assert_eq!(got, group.as_str(), "{p} on {input}");
        }
    }
    for p in list(&table, "refused") {
        let p = p.as_str().unwrap();
        assert!(pattern(p).is_err(), "{p} must be refused");
    }
}

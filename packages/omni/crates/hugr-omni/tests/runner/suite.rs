//! The suite: every scenario file of a directory meant for this OS and for Rust, judged against the pending ledger.
//! A product failure of a pending item is `pending`; a harness failure always fails (`expect::Fail`).

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

use super::Fail;
use super::ledger::{self, Ledger};
use super::scenario::Scenario;

/// What a suite run found. Only `errors` fail it.
pub struct Summary {
    pub passed: usize,
    pub pending: usize,
    pub ran: usize,
    pub other: usize,
    pub files: usize,
    pub errors: Vec<String>,
}

/// Runs the `*.json` scenarios of `dir` with `fixture` as `${FIXTURE}`, printing one line per scenario.
pub async fn suite(dir: &Path, ledger_text: &str, fixture: &Path) -> Summary {
    let (ledger, mut errors) = Ledger::parse(ledger_text);
    let mut paths: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .map(|e| e.expect("dir entry").path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "no scenarios in {}", dir.display());
    let mut sum = Summary {
        passed: 0,
        pending: 0,
        ran: 0,
        other: 0,
        files: paths.len(),
        errors: Vec::new(),
    };
    let (mut known, mut items) = (BTreeSet::new(), BTreeMap::<String, bool>::new());
    for path in &paths {
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let item = ledger::item(&stem).to_string();
        known.insert(item.clone());
        let loaded = std::fs::read_to_string(path)
            .map_err(|e| e.to_string())
            .and_then(|text| Scenario::load(&text, &stem));
        let started = Instant::now();
        let result = match loaded {
            Ok(s) if !s.applies() => {
                sum.other += 1;
                continue;
            }
            Ok(s) => {
                tokio::task::LocalSet::new()
                    .run_until(super::run(&s, fixture, sum.ran + 1))
                    .await
            }
            Err(e) => Err(Fail::Harness(format!("bad scenario: {e}"))),
        };
        sum.ran += 1;
        *items.entry(item.clone()).or_insert(true) &= result.is_ok();
        match result {
            Ok(()) => {
                sum.passed += 1;
                println!("ok      {stem} ({} ms)", started.elapsed().as_millis());
            }
            Err(Fail::Product(e)) if ledger.pending(&item) => {
                sum.pending += 1;
                println!("pending {stem}: {e}");
            }
            Err(Fail::Product(e) | Fail::Harness(e)) => errors.push(format!("{stem}: {e}")),
        }
    }
    errors.extend(ledger.check(&known, &items));
    for e in &errors {
        println!("FAIL    {e}");
    }
    sum.errors = errors;
    sum
}

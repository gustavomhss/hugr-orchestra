//! `conformance/pending.txt`: the items that cannot pass yet, one `<ID> <WP>` per line (`#` starts a comment).
//! A pending item that fails is reported as `pending`; a pending item that passes, an unknown ID and an ID
//! listed twice fail the suite. Only the lead edits the ledger.

use std::collections::{BTreeMap, BTreeSet};

/// The parsed ledger: item → owning WP.
pub struct Ledger {
    items: BTreeMap<String, String>,
}

impl Ledger {
    /// The ledger and its errors (a malformed line, an ID listed twice).
    pub fn parse(text: &str) -> (Ledger, Vec<String>) {
        let (mut items, mut errors) = (BTreeMap::new(), Vec::new());
        for (n, line) in text.lines().enumerate().map(|(n, l)| (n + 1, l.trim())) {
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            match line.split_whitespace().collect::<Vec<_>>()[..] {
                [id, wp] if is_item(id) && is_wp(wp) => {
                    if items.insert(id.to_string(), wp.to_string()).is_some() {
                        errors.push(format!("pending.txt:{n}: {id} is listed twice"));
                    }
                }
                _ => errors.push(format!("pending.txt:{n}: want `<ID> <WP>`, got {line:?}")),
            }
        }
        (Ledger { items }, errors)
    }

    pub fn pending(&self, item: &str) -> bool {
        self.items.contains_key(item)
    }

    /// After the run. `known`: the items that have a scenario file; `passed`: for each item run here, whether
    /// every one of its scenarios passed.
    pub fn check(&self, known: &BTreeSet<String>, passed: &BTreeMap<String, bool>) -> Vec<String> {
        let mut errors = Vec::new();
        for (id, wp) in &self.items {
            if !known.contains(id) {
                errors.push(format!(
                    "{id} ({wp}) is in conformance/pending.txt but no scenario proves it"
                ));
            } else if passed.get(id) == Some(&true) {
                errors.push(format!("{id} ({wp}) passes: remove it from conformance/pending.txt"));
            }
        }
        errors
    }
}

/// The item of a scenario id: `C-KILL-01.tree` → `C-KILL-01`.
pub fn item(scenario: &str) -> &str {
    scenario.split('.').next().unwrap_or(scenario)
}

/// `C-<NAME>-<nn>`.
fn is_item(s: &str) -> bool {
    let Some((name, nn)) = s.strip_prefix("C-").and_then(|r| r.rsplit_once('-')) else {
        return false;
    };
    !name.is_empty()
        && name.chars().all(|c| c.is_ascii_uppercase() || c == '-')
        && nn.len() == 2
        && nn.chars().all(|c| c.is_ascii_digit())
}

/// A work package: `W07`, `W12w`, `SB1`.
fn is_wp(s: &str) -> bool {
    let digits = s.trim_start_matches(|c: char| c.is_ascii_uppercase());
    digits.len() < s.len()
        && digits.starts_with(|c: char| c.is_ascii_digit())
        && digits
            .trim_start_matches(|c: char| c.is_ascii_digit())
            .chars()
            .all(|c| c.is_ascii_lowercase())
}

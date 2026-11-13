---
name: lucy-review-prove-mutants
description: Examine a test oracle with viable mutants confined to changed lines.
when: "The brief offers probe:mutants for this candidate."
not-when: "The option is not offered or the installed Rust adapter is unavailable."
---

Use `probe:mutants` only when offered. The installed, qualified Rust adapter accepts `target.mutants` with path, startLine and endLine. The host intersects that range with changed lines, lists eligible mutants and runs them in a disposable copy. Cite the viable mutant, its changed location, the baseline and retained outcome. A missed mutant supports an oracle gap; caught mutants refute that particular gap. Triage equivalence before confirming a finding.

An absent or unqualified tool, no mutants, only unviable mutants or resource limits are `not-run`, never a pass. Other languages retain only their offered quote or regression proof. Do not install anything, edit the worktree or name a command.

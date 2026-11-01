# Atlas docs

The map of Atlas's own documentation. The user guide for the product is
[docs/guides/atlas.md](../../../docs/guides/atlas.md); the package overview is [../README.md](../README.md).
Docs follow [CONVENTIONS.md](./CONVENTIONS.md): Diataxis, co-located with the code, and grounded (reference pages
are pinned to `source@sha` and drift-checked by the harness guards).

## Where things are

| Folder or file | What it holds |
| --- | --- |
| [explanation/](./explanation/) | Why: grounding, knowledge, classes, memory, versioning, genesis reasoning |
| [reference/](./reference/) | Exactly what: one `atlas-*.md` contract per core module, the productization ring ([atlas-adapters](./reference/atlas-adapters.md)), the [authoring surface](./reference/atlas-authoring.md), and one page per CLI command under [reference/commands/](./reference/commands/) |
| [how-to/](./how-to/) | Tasks: [move a repo in](./how-to/move-a-repo-in.md), [emit a grounded fact](./how-to/emit-a-grounded-fact.md), [find and fix drift](./how-to/find-and-fix-drift.md), [query the Atlas](./how-to/query-the-atlas.md), [write a project rule](./how-to/write-a-project-rule.md) |
| [adr/](./adr/) | Decisions. Immutable: an ADR is superseded, never edited. The write-door decisions start at [ADR-0003](./adr/ADR-0003-governed-write-doors.md) |
| [design/](./design/) | Product design and working prose: [atlas.md](./design/atlas.md), [authoring.md](./design/authoring.md), [repo-layout.md](./design/repo-layout.md) (the `.atlas/` tree that travels in git) |
| [requirements/](./requirements/) | EARS requirements, goldens, invariant registers and the work-package cards |
| [roadmap/](./roadmap/) | Dependency-ordered campaigns |
| [spec/](./spec/) | The transitional normative source that `reference/` grounds to |
| [method/](./method/README.md) | The governed decomposition method (S0, S1, S2, S3, C, S4) |
| [governance/](./governance/policy-lock.md) | The policy lock over gates and their libraries |
| [DECOMPOSITION-PROTOCOL.md](./DECOMPOSITION-PROTOCOL.md), [EXECUTION-PROTOCOL.md](./EXECUTION-PROTOCOL.md), [TEAM.md](./TEAM.md) | Harness-owned protocols (see [../harness/README.md](../harness/README.md)) |
| `*.html` | Rendered one-pagers and explainers, for example `atlas.html` |

## Read with care

[SESSION-STATE.md](./SESSION-STATE.md) is a handoff written on 2026-09-06 for a session picking the work up cold.
It is a dated snapshot, not current state: re-derive any figure with the command it names before trusting it.

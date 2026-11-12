Completed **desktop-web L1** at source `1cde2ff7a71bcf7aecb5d030917b577165135d38` and protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

Delivered files:

- [l1.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/l1.md) — 3,277-word source-grounded report covering all major functional families.
- [coverage.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/coverage.json) — all 532 assigned entries mapped exactly once across 30 families: 146 inspected, 381 family-supported and five metadata-only.
- [sources.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/sources.json) — 193 byte-verified captures, separating 148 sources read from 45 retained but not directly inspected. Exact source files and original connector responses remain under the adjacent `sources/` and `captures/` directories.
- [decisive-evidence.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/decisive-evidence.md) — 25 evidence sections, 32 verbatim source clips and 457 source lines.
- [verification.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/verification.json) — mechanical population, hash, connector-body, citation and excerpt consistency checks.
- [response.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/response.md) — this completion response.

The report preserves three concrete follow-ups: the stable-child restart branch indexes the backoff array at `-1`; the main-process fatal startup dialog hardcodes visible English despite the desktop localization requirement; and separate live/WSL IPC registrations do not use the general origin wrapper. These are source observations or explicitly labeled control-flow inferences, not reproduced product failures or exploit claims. The enforced/report-only CSP distinction and uncertain native teardown/action outcomes are also retained.

**Limits:** no product tests, builds, application launches, Docker/WSL operations or paid/provider calls ran, and no remote repository was mutated. Locale, binary, fixture and some helper leaves have representative family coverage; OS behavior, signatures, media capture and native UI effects remain unverified. This is L1 only, with no later-layer production or acceptance judgment.

**Commands actually run:** read-only `pwd`, `cat`, `rg` and inline Python reads/accounting; `python /workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/materialize.py`; `python /workspace/scratch/992c54067adf/genesis-s2/producers/desktop-web/inspect.py` with selected repository paths/line ranges; and Python execution of `build_coverage.py`, `build_evidence.py` and `verify_l1.py` in that same exclusive directory. These helpers extracted and verified captures or authored/checked the requested artifacts; they did not execute product code. Source retrieval used the read-only GitHub connector at the exact pin.

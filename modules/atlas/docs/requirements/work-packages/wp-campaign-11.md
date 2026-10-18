# Work Packages — CAMPAIGN-11 (the MEMORY RING)

> **STATUS: ALL 6 WPs BUILT — campaign closed** (shipped 2026-08-30, PRs #280-#290 on `master`).
> These cards are a BROWNFIELD LIFT written after the code, which is stated rather than disguised: the
> ring was never cut with campaign 9, so the corpus is recovered from what shipped. Each card's
> `acceptance` points at goldens whose witness is a test already green.

### WP-11.W2.MEMRING — the durable Memory log

epic: EPIC-MEMRING
id: WP-11.W2.MEMRING
content_hash: <brownfield-lift>
title: The durable Memory log
intent: >
The ring slice realizing INV-MEMRING-1, INV-MEMRING-2, INV-MEMRING-3 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-1a
- source: ../requirements-adapters.md#REQ-MEMRING-1b
- source: ../requirements-adapters.md#REQ-MEMRING-1c
- source: ../requirements-adapters.md#REQ-MEMRING-1d
- source: ../requirements-adapters.md#REQ-MEMRING-1e
- source: ../requirements-adapters.md#REQ-MEMRING-1f
- source: ../requirements-adapters.md#REQ-MEMRING-2a
- source: ../requirements-adapters.md#REQ-MEMRING-2b
- source: ../requirements-adapters.md#REQ-MEMRING-2c
- source: ../requirements-adapters.md#REQ-MEMRING-3a
- source: ../requirements-adapters.md#REQ-MEMRING-3b
- source: ../requirements-adapters.md#REQ-MEMRING-3c
- source: ../requirements-adapters.md#REQ-MEMRING-3d
- source: ../requirements-adapters.md#REQ-MEMRING-3e
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-1a-1
- source: ../goldens-adapters.md#SCN-MEMRING-1b-1
- source: ../goldens-adapters.md#SCN-MEMRING-1c-1
- source: ../goldens-adapters.md#SCN-MEMRING-1d-1
- source: ../goldens-adapters.md#SCN-MEMRING-1e-1
- source: ../goldens-adapters.md#SCN-MEMRING-1f-1
- source: ../goldens-adapters.md#SCN-MEMRING-2a-1
- source: ../goldens-adapters.md#SCN-MEMRING-2b-1
- source: ../goldens-adapters.md#SCN-MEMRING-2c-1
- source: ../goldens-adapters.md#SCN-MEMRING-3a-1
- source: ../goldens-adapters.md#SCN-MEMRING-3b-1
- source: ../goldens-adapters.md#SCN-MEMRING-3c-1
- source: ../goldens-adapters.md#SCN-MEMRING-3d-1
- source: ../goldens-adapters.md#SCN-MEMRING-3e-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-1
- source: ../invariant-register-adapters.md#INV-MEMRING-2
- source: ../invariant-register-adapters.md#INV-MEMRING-3

### WP-11.W4.MEMRING — the governed memory write door

epic: EPIC-MEMRING
id: WP-11.W4.MEMRING
content_hash: <brownfield-lift>
title: The governed memory write door
intent: >
The ring slice realizing INV-MEMRING-4, INV-MEMRING-5, INV-MEMRING-6 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-4a
- source: ../requirements-adapters.md#REQ-MEMRING-4b
- source: ../requirements-adapters.md#REQ-MEMRING-4c
- source: ../requirements-adapters.md#REQ-MEMRING-4d
- source: ../requirements-adapters.md#REQ-MEMRING-4e
- source: ../requirements-adapters.md#REQ-MEMRING-5a
- source: ../requirements-adapters.md#REQ-MEMRING-5b
- source: ../requirements-adapters.md#REQ-MEMRING-5c
- source: ../requirements-adapters.md#REQ-MEMRING-5d
- source: ../requirements-adapters.md#REQ-MEMRING-5e
- source: ../requirements-adapters.md#REQ-MEMRING-6a
- source: ../requirements-adapters.md#REQ-MEMRING-6b
- source: ../requirements-adapters.md#REQ-MEMRING-6c
- source: ../requirements-adapters.md#REQ-MEMRING-6d
- source: ../requirements-adapters.md#REQ-MEMRING-6e
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-4a-1
- source: ../goldens-adapters.md#SCN-MEMRING-4b-1
- source: ../goldens-adapters.md#SCN-MEMRING-4c-1
- source: ../goldens-adapters.md#SCN-MEMRING-4d-1
- source: ../goldens-adapters.md#SCN-MEMRING-4e-1
- source: ../goldens-adapters.md#SCN-MEMRING-5a-1
- source: ../goldens-adapters.md#SCN-MEMRING-5b-1
- source: ../goldens-adapters.md#SCN-MEMRING-5c-1
- source: ../goldens-adapters.md#SCN-MEMRING-5d-1
- source: ../goldens-adapters.md#SCN-MEMRING-5e-1
- source: ../goldens-adapters.md#SCN-MEMRING-6a-1
- source: ../goldens-adapters.md#SCN-MEMRING-6b-1
- source: ../goldens-adapters.md#SCN-MEMRING-6c-1
- source: ../goldens-adapters.md#SCN-MEMRING-6d-1
- source: ../goldens-adapters.md#SCN-MEMRING-6e-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-4
- source: ../invariant-register-adapters.md#INV-MEMRING-5
- source: ../invariant-register-adapters.md#INV-MEMRING-6

### WP-11.W5.MEMRING — the named-scanner binding

epic: EPIC-MEMRING
id: WP-11.W5.MEMRING
content_hash: <brownfield-lift>
title: The named-scanner binding
intent: >
The ring slice realizing INV-MEMRING-7 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-7a
- source: ../requirements-adapters.md#REQ-MEMRING-7b
- source: ../requirements-adapters.md#REQ-MEMRING-7c
- source: ../requirements-adapters.md#REQ-MEMRING-7d
- source: ../requirements-adapters.md#REQ-MEMRING-7e
- source: ../requirements-adapters.md#REQ-MEMRING-7f
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-7a-1
- source: ../goldens-adapters.md#SCN-MEMRING-7b-1
- source: ../goldens-adapters.md#SCN-MEMRING-7c-1
- source: ../goldens-adapters.md#SCN-MEMRING-7d-1
- source: ../goldens-adapters.md#SCN-MEMRING-7e-1
- source: ../goldens-adapters.md#SCN-MEMRING-7f-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-7

### WP-11.W6.MEMRING — the memory read doors

epic: EPIC-MEMRING
id: WP-11.W6.MEMRING
content_hash: <brownfield-lift>
title: The memory read doors
intent: >
The ring slice realizing INV-MEMRING-8, INV-MEMRING-9 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-8a
- source: ../requirements-adapters.md#REQ-MEMRING-8b
- source: ../requirements-adapters.md#REQ-MEMRING-8c
- source: ../requirements-adapters.md#REQ-MEMRING-8d
- source: ../requirements-adapters.md#REQ-MEMRING-8e
- source: ../requirements-adapters.md#REQ-MEMRING-8f
- source: ../requirements-adapters.md#REQ-MEMRING-9a
- source: ../requirements-adapters.md#REQ-MEMRING-9b
- source: ../requirements-adapters.md#REQ-MEMRING-9c
- source: ../requirements-adapters.md#REQ-MEMRING-9d
- source: ../requirements-adapters.md#REQ-MEMRING-9e
- source: ../requirements-adapters.md#REQ-MEMRING-9f
- source: ../requirements-adapters.md#REQ-MEMRING-9g
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-8a-1
- source: ../goldens-adapters.md#SCN-MEMRING-8b-1
- source: ../goldens-adapters.md#SCN-MEMRING-8c-1
- source: ../goldens-adapters.md#SCN-MEMRING-8d-1
- source: ../goldens-adapters.md#SCN-MEMRING-8e-1
- source: ../goldens-adapters.md#SCN-MEMRING-8f-1
- source: ../goldens-adapters.md#SCN-MEMRING-9a-1
- source: ../goldens-adapters.md#SCN-MEMRING-9b-1
- source: ../goldens-adapters.md#SCN-MEMRING-9c-1
- source: ../goldens-adapters.md#SCN-MEMRING-9d-1
- source: ../goldens-adapters.md#SCN-MEMRING-9e-1
- source: ../goldens-adapters.md#SCN-MEMRING-9f-1
- source: ../goldens-adapters.md#SCN-MEMRING-9g-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-8
- source: ../invariant-register-adapters.md#INV-MEMRING-9

### WP-11.W7a.MEMRING — the derived slabs

epic: EPIC-MEMRING
id: WP-11.W7a.MEMRING
content_hash: <brownfield-lift>
title: The derived slabs
intent: >
The ring slice realizing INV-MEMRING-10 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-10a
- source: ../requirements-adapters.md#REQ-MEMRING-10b
- source: ../requirements-adapters.md#REQ-MEMRING-10c
- source: ../requirements-adapters.md#REQ-MEMRING-10d
- source: ../requirements-adapters.md#REQ-MEMRING-10e
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-10a-1
- source: ../goldens-adapters.md#SCN-MEMRING-10b-1
- source: ../goldens-adapters.md#SCN-MEMRING-10c-1
- source: ../goldens-adapters.md#SCN-MEMRING-10d-1
- source: ../goldens-adapters.md#SCN-MEMRING-10e-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-10

### WP-11.W8.MEMRING — the memory transport

epic: EPIC-MEMRING
id: WP-11.W8.MEMRING
content_hash: <brownfield-lift>
title: The memory transport
intent: >
The ring slice realizing INV-MEMRING-11, INV-MEMRING-12 over the built `@atlas/memory` package.
source_reqs:

- source: ../requirements-adapters.md#REQ-MEMRING-11a
- source: ../requirements-adapters.md#REQ-MEMRING-11b
- source: ../requirements-adapters.md#REQ-MEMRING-11c
- source: ../requirements-adapters.md#REQ-MEMRING-11d
- source: ../requirements-adapters.md#REQ-MEMRING-12a
- source: ../requirements-adapters.md#REQ-MEMRING-12b
- source: ../requirements-adapters.md#REQ-MEMRING-12c
- source: ../requirements-adapters.md#REQ-MEMRING-12d
- source: ../requirements-adapters.md#REQ-MEMRING-12e
  acceptance:
- source: ../goldens-adapters.md#SCN-MEMRING-11a-1
- source: ../goldens-adapters.md#SCN-MEMRING-11b-1
- source: ../goldens-adapters.md#SCN-MEMRING-11c-1
- source: ../goldens-adapters.md#SCN-MEMRING-11d-1
- source: ../goldens-adapters.md#SCN-MEMRING-12a-1
- source: ../goldens-adapters.md#SCN-MEMRING-12b-1
- source: ../goldens-adapters.md#SCN-MEMRING-12c-1
- source: ../goldens-adapters.md#SCN-MEMRING-12d-1
- source: ../goldens-adapters.md#SCN-MEMRING-12e-1
  exit_predicate: all acceptance SCNs green ∧ the named witness tests pass ∧ all 11 gates green
  rationale:
- source: ../invariant-register-adapters.md#INV-MEMRING-11
- source: ../invariant-register-adapters.md#INV-MEMRING-12

# Maestro transfer gate repair

Current identity correction: active upstream ID `archie`, profile `upstream`, assets `packages/archie-specialist`, config `agent.archie.name`; see [NAMING-CORRECTION.md](NAMING-CORRECTION.md). Procedure quotations and raw pins below remain immutable historical receipts. Parent owns active-source naming and new pin freeze; old pins are not renamed-file proof or a second accepted digest.

Category: **REPAIR + STRENGTHENING**. Applies to local orientation integration on `maestro-transfer`,
baseline `1520daa817c2310daddae70cba93a068041f10c1`.

## Reviewed source and deliberate API clarification

The procedure source is the independently reviewed exact replacements in
[maestro-planning-handoff.md](maestro-planning-handoff.md), under the three
`Exact playbook replacement` headings. The canonical handoff remains the reviewed source.
The owner authorized the following narrow native-API clarification in each wrapper's existing
`Exact tool sequence` section; the rest of each reviewed wrapper is retained.

### `maestro-decompose`

```text
Use `maestro_arsenal_catalog` only for narrow discovery when an operation is unknown. Call
`maestro_arsenal_describe` for each selected operation's exact inputSchema/effects before
`maestro_arsenal_execute`. Fill observed/schema-valid inputs;
```

### `maestro-contract`

```text
Use `maestro_arsenal_catalog` only for narrow discovery when needed. Call `maestro_arsenal_describe`
for each selected operation's exact inputSchema/effects before `maestro_arsenal_execute`.
Host owns permissions/placement; unavailable tools or acquisition stay UNKNOWN.
```

### `maestro-pack`

```text
Use `maestro_arsenal_catalog` only for narrow discovery. Call `maestro_arsenal_describe` for selected operation
inputSchema/effects before `maestro_arsenal_execute`; host owns placement/state/authority.
Do not claim retired `context-budget`/`model-router` tools exist.
```

These lines name the existing tool IDs and preserve discovery, describe/inputSchema/effects, then execute
ordering. They add no tool, permission or approval grant.

## Artifact pins and gate reach

`packages/orchestra/test/maestro/arsenal-skills.test.ts` pins raw full-file bytes with SHA-256:

| Procedure | SHA-256 |
| --- | --- |
| `maestro-decompose/SKILL.md` | `b5b08533227d58016e59b453451be4a7fd384d9691e16bd3847d06308b957062` |
| `maestro-contract/SKILL.md` | `7e61a86cd78f3d30e448aeb4c5c70ae6de8552cc57107993792539808fd53493` |
| `maestro-pack/SKILL.md` | `a04400230a2dc4847daa452d4dcd2fd22e433db2cebf90a9ff2183dac5dc20bb` |

Paths are relative to `packages/orchestra/playbooks/`. Update pins only with reviewed procedure changes.
The test hashes file bytes without newline normalization or prose preprocessing. A missing/unreadable
file fails acquisition; an empty, stubbed or changed file fails the pin. No skip or exception is added.

The old planning/contract/pack sentries matched isolated sentences from the superseded procedures.
A stub containing those sentences could pass while omitting the rest of the procedure. Full-file pins
protect every byte of the current reviewed replacements, including the formerly guarded boundaries,
without trying to detect semantic prose. This is artifact-drift protection, not prose-quality grading,
semantic correctness, model compliance or runtime enforcement.

Existing frontmatter/path/bounds/link/discovery/native-ID checks remain. The unchanged verify assertions
remain in their own test; loop, repository and Composer assertions remain unchanged. Numeric budgets
and the native-ID acquisition order are retained.

## Verification protocol

First run the restored reviewed procedures as a positive control on both operating systems. Then delete
one reviewed clause from each real procedure file, keeping frontmatter, links and native IDs. Run only
the focused suite through the prescribed Actions snapshot runner:

```sh
bun run test:ci orchestra test/maestro/arsenal-skills.test.ts --os both
```

The three named artifact-pin cases must fail on both operating systems. Restore the clauses and confirm
the files again match the pinned digests, then run the same suite on the restored snapshot. Record actual
CI evidence separately from this protocol. Run `bun typecheck` from `packages/core` and
`packages/orchestra`; no local test run is part of this verification.

## Initial verification and diagnosed checkout mismatch

Dependencies were installed with `bun install --frozen-lockfile --ignore-scripts`. Both package
`bun typecheck` commands then exited 0; the earlier missing `tsgo` was dependency readiness.

The negative control deleted only `Authoring precedes execution arming.` from each real wrapper.
All three clauses were restored afterward; their raw SHA-256 digests again match the pins above.

| Actions snapshot | Linux | Windows |
| --- | --- | --- |
| [Clause deletion](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37836578968) | 20 pass, 3 named artifact-pin failures | 20 pass, 3 named artifact-pin failures |
| [Restored procedures](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37837012503) | 23 pass, 0 fail | 20 pass, 3 named artifact-pin failures |

Without exact-path LF attributes, Windows converted these files from LF to CRLF at checkout. Hashing
the restored LF content after that conversion reproduces each Windows received digest:

| Procedure | Restored CRLF SHA-256 observed on Windows |
| --- | --- |
| `maestro-decompose` | `96ad4de6393614fe0e4a856a9bcbd3532d1de903886e8126031a27da5e711af6` |
| `maestro-contract` | `5142ad7b066fa245cb6c96a1b040b434dc682acfa61256c3fb498f5617ac1040` |
| `maestro-pack` | `aa65b9951114d0ec3865d9d729a96f1d75b9ffc13cc068fc6d44df04489aa538` |

Before the checkout repair, `git check-attr text eol` reported both attributes unspecified for these three
paths. That initial negative Windows run was confounded by checkout conversion and is not causal mutation
proof. Its Linux negative/positive pair remains evidence of the initial gate. The guard remains raw-byte
exact; there is no normalization, second accepted digest or skipped platform.

## Authorized checkout repair and complete two-platform proof

The owner authorized adding only these three entries to `.gitattributes`:

```text
packages/orchestra/playbooks/maestro-decompose/SKILL.md text eol=lf
packages/orchestra/playbooks/maestro-contract/SKILL.md text eol=lf
packages/orchestra/playbooks/maestro-pack/SKILL.md text eol=lf
```

These exact-path entries establish the reviewed source artifact's LF checkout contract, following the
existing seat-skill pattern. No unrelated attribute changed. `git check-attr text eol` now reports
`text: set` and `eol: lf` for each path. The procedure bytes, accepted digests and hashing code are unchanged.
This repairs the false Windows mismatch without weakening the content pin.

The focused runner then measured the required sequence on both operating systems:

| Actions snapshot | Linux | Windows |
| --- | --- | --- |
| [Restored positive control](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37841829170) | 23 pass, 0 fail | 23 pass, 0 fail |
| [Exact clause deletion](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37842208723) | 20 pass, 3 named artifact-pin failures | 20 pass, 3 named artifact-pin failures |
| [Final restored procedures](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37842591470) | 23 pass, 0 fail | 23 pass, 0 fail |

The mutation again deleted only `Authoring precedes execution arming.` from each wrapper. Both platforms
reported identical received SHA-256 values for the deleted-clause artifacts and failed only the three
named pin cases; all other checks passed. This Windows negative control is unconfounded because its
restored positive control passed first. All three clauses were restored before the final run, and their
raw digests match the frozen pins above. No skip, normalization, alternate digest or waiver was introduced.
Code did not change during this checkout repair, so the already-green package typechecks were not repeated.

This addendum establishes no V2 application binding, W6 publication/approved scope, truthful governed
provenance, owner acceptance or governed closure.

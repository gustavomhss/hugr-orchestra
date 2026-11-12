# s2.l4.entry r2 bounded delta

## Exact change identity

Public correction: `deliverable/requests/l4-entry-r2-correction.md`, SHA256 `0dff7a29abe4560a5e4a6eb222cc97d56314a72ed0fc8050b3671d05ca3bfc53`. Stable artifact key remains `s2.l4.entry`; source revision remains `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This is a routing clarification with no new implementation claim or semantic verdict.

| Body | Bytes | SHA256 |
|---|---:|---|
| Original `later-producers/app-session/l4-entry/body.md` | 5305 | `5a91d69ebe975b4c6dff50ad7cb1e76102ed8c35a4d1d43931737d52d6187c67` |
| New `later-producers/app-session/l4-entry-r2/body.md` | 5849 | `e816f0085875b72b53ed35f4fdba2d04efbfb8130ab13c21b11ca0ebf5dde0b1` |

One paragraph plus its following blank line (544 UTF-8 bytes) is inserted at original zero-based byte offset 4688, immediately before the existing **Instructions** paragraph under **Verification and boundaries**. Removing that exact insertion reproduces all 5305 original bytes. `body.diff` has one insertion hunk and no removed lines.

## Exact insertion text

```text
**Out-of-scope evidence route:** S2 cannot establish distributed or clustered Session ownership, crash continuation, or exactly-once provider execution. Direct these questions to the S1/backend session-execution owner for its current coordination, continuation and provider-retry design and supporting implementation and failure-recovery evidence. S2 reconnect and admission observations do not supply that proof. [Root `AGENTS.md:214–216`; accepted `s2.l3.app-session` § “Recover the projection without inventing execution recovery”.]
```

## Bounded supporting evidence

The existing entry E04 is root `AGENTS.md:214–216`, 980 bytes, excerpt SHA256 `1cdc2c87f7640a31a071dc92964dab10d88dafd6a6f7244a6cc02ea39417c1e0`. Its original bytes and evidence mapping remain intact. Relevant complete lines from the same verified source capture are reproduced separately below; they are not represented as one contiguous excerpt.

Root `AGENTS.md:214`:

```text
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
```

Root `AGENTS.md:216`:

```text
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
```

Accepted app L3 E03 covers root `AGENTS.md:209–216`, 2855 bytes, excerpt SHA256 `0489888da1e156063c11b4f49045fbb95bf5e4b95879a4140d45e1d4b19b9d37`. The accepted L3 evidence file SHA256 is `c085725c05b12cd5933624bb424038c4c9bfc8b5a41f6e75a2662a4317529678`. This is the same existing instruction basis, not an added direct source record.

The accepted `s2.l3.app-session` body, SHA256 `7611e2ddfb015b2538a2d38a174d383e47bac7e2879e83f9622146ed30cf80b7`, states under “Recover the projection without inventing execution recovery”:

```text
neither UI reconnection nor durable inbox retention authorizes provider retry or clustered execution claims.
```

Root instructions supply the process-local and continuation limits; the accepted L3 inference separates UI recovery observations from backend execution proof. The public correction supplies the explicit S1/backend evidence-owner route. The new paragraph asks that owner for its current design and supporting implementation/failure-recovery evidence; it does not assert that a recovery mechanism exists, identify an invented destination key, or claim a passing test.

## Preserved provenance and boundaries

These three full files are copied byte-identically:

| File | Bytes | Unchanged SHA256 |
|---|---:|---|
| `sources.json` | 1290 | `443b8e94919fb4bcbdef2380d1414f8c3e3d964961b3eda3933e76b9c301f41d` |
| `dependencies.json` | 8418 | `f87550c141a6592d1cbdafbb63c9c06e963bcd1fd5e8f198081911177911c425` |
| `decisive-evidence.md` | 12805 | `40b990eefa4e9630be200bd1f2907871d78f95175949025fd09330584a66e35e` |

The nine accepted build keys, twelve navigation destinations, all exact heading mappings, one direct source record, original process-local limitation and three accepted manifest pins remain unchanged. L4 siblings remain navigation only; no peer L4 body was consumed.

| Accepted manifest | Unchanged SHA256 |
|---|---|
| `accepted/l1.json` | `8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8` |
| `accepted/l2.json` | `27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c` |
| `accepted/l3.json` | `dabee552a1eca7242365072a06604d3468b4de6be04a0085ed70286dbed1497b` |

`response.md` and `author-checks.json` describe this bounded correction and its local checks. No product tests, runtime, CI, remote writes, reviewer contact or semantic assessment occurred. All writes are isolated to `later-producers/app-session/l4-entry-r2/`; original producer, canonical, accepted and peer files were not edited. Literal transport awaits root's separate authorization.

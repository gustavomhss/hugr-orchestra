# Exact reviewed upstream base source and review receipts

2026-10-09. No new review or check run is needed to record these receipts. Reviewer message IDs below were recovered through read-only message metadata queries. They attest their stated source slices, not combined W6 acceptance.

## Complete b1-based source handoff

Commit `01a48f6a22158437ce544d8cdcef08a29ddcd7fb`, parent `b1cad41dc515eec9dcf474c413da853061894ac1`, published `fork/upstream-combined`.

It is a flattened upstream-only delta over the current runtime baseline, not a merge of an old runtime tree. `.ci-run.json` is excluded. Runtime auth/provider/exporter/native/WSL sources are unchanged by this commit. The only composed source differs from prior upstream bytes in `src/tool/registry.ts`, where current runtime SDK admission is preserved alongside the upstream visibility hunk.

Relay reports its component consumes as `30ac511984` (schema source `8f73c045...`) and `4385c5847d` (host source `cc6f5a8f...`). Do not duplicate those definitions. For a production-source-only base patch, take `git diff b1cad41dc515 01a48f6a22 -- <the explicit paths below>`. Existing source-bound tests/docs remain in the complete handoff and can be consumed separately without executing them now.

### Exact production base path inventory

```text
.gitattributes
packages/core/src/agent/prompt/maestro.txt
packages/core/src/plugin.ts
packages/core/src/tool/maestro-arsenal.ts
packages/core/src/tool/upstream-arsenal.ts
packages/orchestra/playbooks/maestro-contract/SKILL.md
packages/orchestra/playbooks/maestro-decompose/SKILL.md
packages/orchestra/playbooks/maestro-governed/SKILL.md
packages/orchestra/playbooks/maestro-pack/SKILL.md
packages/orchestra/src/agent/prompt/bobby.txt [DELETE]
packages/orchestra/src/agent/prompt/walt.txt
packages/orchestra/src/maestro/arsenal-bindings.ts [two nativeUpstream sites only]
packages/orchestra/src/maestro/backend-result.ts
packages/orchestra/src/maestro/roster.ts
packages/orchestra/src/maestro/seats/bobby.ts [DELETE]
packages/orchestra/src/maestro/seats/index.ts
packages/orchestra/src/maestro/seats/seat.ts
packages/orchestra/src/maestro/seats/walt.ts
packages/orchestra/src/maestro/upstream-proposal.ts
packages/orchestra/src/maestro/upstream-result.ts
packages/orchestra/src/maestro/upstream-v2.ts
packages/orchestra/src/maestro/validation-record.ts
packages/orchestra/src/project/bootstrap.ts
packages/orchestra/src/tool/maestro-arsenal.ts
packages/orchestra/src/tool/registry.ts
packages/walt-specialist/skills/walt-plan/SKILL.md
packages/walt-specialist/skills/walt-plan/references/briefs.md
packages/walt-specialist/skills/walt-plan/references/decomposition.md
packages/walt-specialist/skills/walt-plan/references/load-bearing-contracts.md
packages/walt-specialist/skills/walt-plan/references/product-design-spec.md
packages/walt-specialist/skills/walt-work-package/SKILL.md
packages/walt-specialist/skills/walt-work-package/references/native-proposal.md
```

The inventory deliberately excludes the already-consumed `maestro-event.ts` source region, `upstream-attribution.ts`, and `upstream-provenance.ts`. Relay owns its remaining shared-file regions, current lifecycle and final V3 producer/hash wiring. Preserve those while applying the two additive nativeUpstream sites.

## Source-bound cold-review receipts

| Slice / source identity | Reviewer Session | Final assistant message | Reach |
| --- | --- | --- | --- |
| Registry/assets on `d363d39e393b9e4f89031c48a43838e8ba45ebf1` | `ses_ee445d03cffe7XDfrku6n1cGbx` | `msg_11bbd8cb1001QeK7aAAgaDpid2` | Native registration/assets, source/bundle slice |
| Result/parser on `abf7a72c77fcaeee1206400a8270b2581ae9839c` | `ses_ee445cffcffe3bGXJxEqoRwmBh` | `msg_11bd6e90f001iEQPm9HwMkJAKt` | Corrected terminal proposal/parser slice |
| Final V2 binding/proofs on `05a431167bead651abcc3e748f1516cf4a3035f4` | `ses_ee2844758ffesRvyyBUzqqwXOi` | `msg_11e42b3fc001M5ivd3qDVgPAru` | V2 binding/qualification slice, not provider turns |
| Location lease on final `05a431...` | `ses_ee284474affeF9LCr4LAnCOiTY` | `msg_11e0d0c46001TzNQXjhQx3yJ1W` | Corrected lease ownership/disposal |
| Core activation on final `05a431...` | `ses_ee284476fffejXTWgSl65SZXWC` | `msg_11e42292c001R2KSzcD7CLb0Iv` | Bounded activation fixes; not universal cycle safety |
| Maestro transfer/procedure gate on final `05a431...` | `ses_ee284473affeSC9KKjNaJO8BD6` | `msg_11d7f5d6200160bnZPkRinTL5D` | Transfer and repaired/strengthened pin slice |
| Schema `8f73c045307f06da311ee6f8b1bb6ba378bf265c` | `ses_ee153afefffepn37mfTkA8sk8W` | `msg_11ead12f0001DR3JAecNN3lgM3` | Attribution/V3 region only, no producer/inventory |
| Host `cc6f5a8f755bb7d765c5d918ecd23180244be006` | `ses_ee153b016ffeKTQcv7iWJgICoV` | `msg_11ed1c2bd001QSyqkUDt6XHapo` | Synchronous V1/V2 and explicit background HOLD |
| b1 composition seam of `01a48f6a22` | `ses_ee115d6f7ffe4JbY8s74h3xUmi` | `msg_11eead5bc001Ba7XDZtFo2c5zb` | SDK loader + upstream visibility coexistence |
| Exact source-identity audit of `01a48f6a22` | `ses_ee115d6e5ffe0TiacekylDCXIE` | `msg_11eeb87a6001xQg0BemNkXe6Qh` | Exact intended path/blob/mode comparison; known registry difference positive control |

Original registry/result receipts do not alone establish later grant changes. The complete handoff's source-identity audit preserves later final pins and their limited historical evidence. New source components and W6/runtime integration remain UNVALIDATED. Background exact-assistant settlement is still a host closure dependency; signed workflow evaluation disposition is not proof of upstream completion/delivery.

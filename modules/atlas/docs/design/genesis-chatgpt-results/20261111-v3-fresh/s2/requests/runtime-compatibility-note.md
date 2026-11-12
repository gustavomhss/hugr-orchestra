# S2 feedback for the shared S4 runtime

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. S4 release inspected at `b42d14978c8b727310369920d4bfaf86145a2b80`; runtime candidate `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`. This is a local proposal to the runtime owner, not an applied patch, remote message or passing execution.

## Concrete incompatibility

S2 owns the generated `schema/tui.json`: 1,131,057 bytes, Git blob `9250e2ec0c6e433ade0d5a172e8156087022f217`, SHA256 `16c4dd2d51f4b32b397cb9effa31cfc9c48dd7aa546f28b149f106e64d01d0e2`. Exact bytes have been recovered and verified. It remains a declared source/input and one of 4,506 accounted paths.

The r1 adapter reads every source reference and observed file input with `readNativeFile(..., 256000)` in `packages/adapter-io/src/genesis-native.ts`; `ownership-input.ts` independently retains its 256,000-byte observation cap. Raising only the adapter read would still fail live observations/read validation. The r1 CLI has no permitted size override.

S4 must choose and verify a bounded representation or limit policy that can observe this legitimate source consistently during preparation, binding, publication, reads and updates. Keep real exact-byte source identity and changed-input refusal. Do not omit this source, truncate it, reclassify an observation error as absence, use a transport SHA as kernel version, or synthesize an observed input. A compatibility change requires a new pinned S4 release and the relevant real gates; S2 will rebind the affected candidate.

## S2-owned transport normalization

The recovered draft encoded evidence references as objects while r1 expects evidence:string[]. S2 preserves each reference losslessly as canonical JSON text and adds the actual recipe file to `input_keys`. These are transport-shape repairs, not source removal or semantic approval. Actual two-judge decisions, all required layers, roots and links remain required before prepare.

## Required evidence before closing

A real complete S2 prepare must admit the exact source, and real current reads must observe it consistently. A deliberate content change must invalidate the affected design/TUI build closure; a source above the chosen bound and unsafe path/symlink cases must still be refused. Semantic approval does not supply runtime binding or publication authority.

# L1: HTTP client generation authority and failure boundaries

Key: `s1.api.codegen`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Regeneration authority

Root `AGENTS.md` requires regeneration after public Protocol or Server HttpApi changes and prohibits manual edits under Client `src/generated` and `src/generated-effect`. Client `package.json` defines `generate` as its build script, and `check:generated` as generation followed by a Git diff check of those two directories. The maintenance action is `bun run generate` from `packages/client`; it was not executed during this evidence task.

`packages/client/script/build.ts` compiles one reflected contract from `ClientApi`, product group/endpoint naming functions, and the omission set. It emits a Promise product and an Effect imported-contract product. It supplies selected encoded event type references, a configured set of split groups, and output paths. Filesystem services are used by this build-time script, not proof that the generated browser transport imports the Server runtime.

The generic `tooling/httpapi-codegen` package owns compile/emitter/writer behavior. Product naming and endpoint policy remain in Client. The generic README's separation of policy from generation does not mean the compiler lacks an omission parameter; Client deliberately supplies one.

## Compiler constraints

The compiler reflects the HttpApi definition. It rejects required client middleware without a supplied adapter; accepts a single success schema (defaulting an absent one to no content); rejects multiple success or payload schemas; and flattens params/query/headers/payload into one public input object. Those inputs must be supported object shapes, and duplicate field names are rejected. It derives no-input, optional-input, or required-input signatures from the actual fields.

Only an exact `{data: A}` success envelope is unwrapped. Responses with location, pagination cursors, or `hasMore` retain their envelopes. Public name collisions are rejected. This is an explicit generator rule, not a general rule that every API response is unwrapped.

The Promise emitter supports JSON payloads, JSON/no-content/binary success, and supported SSE forms; declared transport errors must have supported JSON/tagged shapes. Structural type emission has explicit unsupported cases, including recursive references. The Effect imported mode imports the original API value so codecs and transformations remain authoritative. A portable emitter cannot silently reconstruct unsupported transformations and is allowed to fail.

## Output ownership and layout

The writer validates flat safe filenames, rejects path traversal/reserved/absolute forms and case-folded name collisions, parses the previous ownership manifest, removes stale files only from that owned list, rejects output symlinks, formats with Prettier, and writes a sorted generation manifest. These safeguards establish intended file ownership. The observed procedure is not an atomic transaction: this packet makes no atomicity or crash-recovery claim for generation.

`layout.ts` splits selected oversized generated type modules at complete declaration boundaries with its configured line targets (400-line threshold, 350-line target in the inspected helper). This is not a global source byte-size ceiling. The actual generated main `types.ts` remains 462,732 bytes; the line-layout helper therefore does not solve the runtime observer's 256,000-byte input limit.

The preserved generated manifests list the exact producer-owned output names. Generated outputs are classified as a family with these manifests and the build script as authority. Representative clients and error/request modules were read; the other generated modules are inventory entries, not separately inferred semantic facts. The generator's test fixtures and generated fixture outputs are also grouped separately from production outputs.

## Evidence and gaps

Full generator reads: `src/index.ts`, `src/layout.ts`, `src/imported-effect.ts`, `src/effect-headers.ts`, `src/error-symbol.ts`, README and manifest. Product authority: Client build, contract, manifest, and root instruction. Exact compile, emitter, writer, layout, and generation-command excerpts are provided to the judges in `review-evidence.md`.

No build, generation, formatting run, test, or Git diff freshness check was executed. The captured generated output is evidence of the pin's bytes, not a locally reproduced result. Browser transitive imports, codegen compatibility across Effect upgrades, filesystem failure behavior, and all unsupported-schema branches need their own real checks when that work is authorized. No fabricated build dependency or runtime version is supplied here.

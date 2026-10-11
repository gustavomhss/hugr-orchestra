# Runtime-closure integration checkpoint — 2026-10-08

The later 2026-10-09 Task observation first-rejection measurement, exact-source Core/Orchestra results and failed-lane-only Windows x64 native repair are recorded in [SNAPSHOT-QUALIFICATION.md](./SNAPSHOT-QUALIFICATION.md). Those scoped results do not close the milestone.

The owner-corrected native Archie identity, successful ordinary native authoring run, exact original output/host receipts and remaining producer/landing failures are recorded in [ARCHIE-QUALIFICATION.md](./ARCHIE-QUALIFICATION.md). That execution uses the explicit read-only legacy account consumer and does not qualify operational Orchestra OAuth consent or the broader Runtime milestone.

Published integration base for the focused checks below: `59e73080cb` on `runtime-closure`. These results describe the verified corrections before the subsequent Relay integration. This checkpoint is not milestone closure or exact-head epic CI evidence.

Latest integration details live in `WAVE-2.md`: Relay parity checkpoint `937cf2b1de`, actual native exporter completion `374da1e154` (Actions `37875718504`), and prepared SDK matrix plus portable Node admission correction `22addae2df` (Actions `37877015907`). These are reviewed, scoped results; product builds and operational OAuth requirements remain open.

## Reviewed corrections

- Core/legacy ChatGPT corrections were integrated: validated identity continuity survives retired signing keys, omitted refresh/scope values retain saved values, and model catalog refresh precedes the first model request.
- ProviderAuth browser activation now captures a credential value and persistent per-provider generation under the shared auth-store lease. Set, remove (including an absent row) and successful CAS advance that generation before writing credentials. Callback CAS rejects intervening changes even when the store returns to the same value. The private `auth-revisions.json` sidecar uses UUID v4 values, atomic writes and mode `0600`; malformed data fails closed. Existing `auth.json` format remains unchanged. This guarantee covers ProviderAuth browser activation; optional-revision callers still use value-only CAS.
- DigitalOcean test assertions now decode the required PKCE challenge and directly read the optional credential after disconnect, fixing the two reproduced package type errors.
- Desktop accepts verified producer CLI resources through `buildCliToResources({ prebuilt: directory })` or `ORCHESTRA_CLI_PREBUILT_DIR`. The compiler is bypassed when this source is specified. Source version/targets/confinement/digests and copied bytes are verified before native signing; the consumer manifest hashes signed bytes. Validation failures preserve previous resources. Producer/output overlap is rejected, including ordinary aliases and missing descendants under symlinked parents. Both paths reject `..` segments before filesystem operations because Bun resolves those spellings inconsistently across operations.
- The Bun-only Windows transport proof moved from production source to `packages/desktop/scripts/wsl-transport.windows-proof.ts`, with its two imports adjusted. It still requires real Windows/WSL and fails when the required environment is unavailable.
- The SDK admission comment moved to the actual admission boundary in `packages/orchestra/src/plugin/loader.ts`; runtime behavior did not change. This restores the oversized TUI runtime file to its existing baseline without changing the godfile gate or waiver ledger.

Independent read-only reviews approved the ProviderAuth generation fix and the desktop source handoff within these stated contracts. Actual CI falsified an earlier static assumption that Bun `realpath` consistently handles symlink/`..` traversal; the restricted path contract and regression replace that assumption.

## Change-scoped evidence

| Behavior | Measured counterexample | Final focused result |
|---|---|---|
| Absent-row browser disconnect | [37756267914](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37756267914): stale callback succeeded when it should fail | [37758025012](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37758025012): 18 tests passed across Auth, DigitalOcean and legacy ChatGPT on Linux, including cross-process ABA |
| Malformed revision sentinel | [37757695479](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37757695479): stored `initial` was accepted | Covered in the same final 18-test run; sentinel, non-UUID and malformed JSON rejected |
| Prebuilt handoff | [37758433333](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37758433333): attempted the missing local build tree instead of producer resources | [37764231262](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37764231262): 33 staging/manifest tests passed on each of Linux and Windows |
| Producer/output overlap | [37761195012](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37761195012): overlapping staging succeeded; [37763211134](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37763211134): raw traversal still reached output operations after a static-only fix | Covered in the same final desktop run; raw POSIX traversal plus source/output parent segments and ordinary overlap cases rejected before signing |

Local package `bun typecheck` completed for Core, Orchestra, Desktop, SDK JavaScript and Client. Desktop's existing typecheck covers its configured production source, not all Bun scripts. The actual godfile implementation ran against `fork/dev`: its TUI-runtime growth error was reproduced, then cleared by relocating the comment. Existing warnings remain.

Generators ran through their supported entrypoints: `./packages/sdk/js/script/build.ts` and `packages/client`'s `bun run generate`. SDK output adds optional OAuth `metadata`; Client generated output has no diff. No generated file was edited manually.

## Dependency/build inputs for the Nix owner

Current Git blob IDs, not Nix output hashes or a final committed source tree:

| Input | Git blob |
|---|---|
| `bun.lock` | `38f67e0d610caa1488ba51cf647be72d2368b7de` |
| `packages/core/package.json` | `8b7e3eb2e047dbd893b5741715b4549236cdf440` |
| `packages/desktop/package.json` | `0a4f0b5fc12becbacab634d5fac36c866a78d4ce` |
| `packages/cli/package.json` | `40777cd14a5443f8b36eaef4c746251c0efaecd9` |

Core declares `jose: "6.2.3"`; Desktop declares Electron `42.3.3`. These manifest/lock inputs match the published integration base. The Nix owner received a coordination update; final hash/build capture still requires the final clean source revision and actual platform builds.

## Closure blockers and remaining evidence

- A08: real consent displaying Orchestra, entitled inference and real refresh/re-login. DigitalOcean registration exists, but scope and OAuth-bearer inference eligibility remain unproved. ChatGPT needs real OSS consent to issue its account-bound registration. Copilot/xAI owned registration and provider approval remain outstanding.
- A02–A04: full matching-OS/CPU compiled CLI and desktop matrix, actual Linux-producer/Windows-consumer artifact handoff, and real Windows/WSL guest transport/authenticated health. Staging fixtures do not prove those executions.
- A05–A06: final exact-head composition/qualification of resolver cold/warm and foreign-footprint checks. The previously missing successful prepared Bun, Node ESM bundle, compiled Bun, supported require and real OpenTUI matrix now passes on Linux/Windows in `37877015907`; the counted Bun registration mutation fails inside the same run. This does not turn unrelated historical resolver runs into exact-head milestone evidence.
- A10–A11: deterministic dependency output hashes and real CLI/Desktop Nix builds on all four declared systems, matching Electron and executable artifacts.
- A12: final committed/generated tree, remaining integration evidence, exact-head full applicable epic CI, and the single milestone PR/merge.

No required operational or platform item becomes complete from the focused results above.

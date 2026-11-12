# Maintain terminal and shared presentation contracts

## Orientation

Use this protocol for a terminal submission defect, shared UI change, localization/accessibility request, theme problem or generated-asset drift. It builds on the accepted L3 explanations at `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Instructions below are attributed repository requirements; proposed diagnosis and verification are maintenance recommendations, all unexecuted here.

Before editing, record the revision, affected surface/OS, connection generation, directory/workspace, session/request identity, input snapshot and last confirmed boundary. Distinguish editor state, admission acknowledgment, promoted transcript and completed execution. Preserve the design/TUI scope of 2,087 paths/67 families, including 13 metadata-only paths. Current TUI ownership permits Core dependencies; the older SDK-only target is historical, and its README’s no-assets/generated-files claim conflicts with 33 presets. [`s2.l3.design-tui`, “Orientation and accepted ownership”; “Terminal input becomes admission through ordered, separate operations”.]

For broader maintenance, navigate to `s2.l4.app-session`, `s2.l4.desktop-web` or `s2.l4.entry`. Those same-layer keys are navigation, not factual build inputs.

## Maintenance protocol

### Submission and API compatibility

**Trigger:** duplicate/empty prompts, lost input, unexpected model/context or an incompatible wire field. First retain session ID, selection, context, mapped files/mention spans and whether dispatch occurred. Edit composition in `packages/tui/src/component/prompt/index.tsx` and V2 translation in `packages/tui/src/context/session-actions.ts`; do not repair a server contract by silently inventing a client payload. Preserve agent → model → optional synthetic context with `resume: false` → prompt ordering. It orders one invocation without an atomic transaction, cross-caller lock or rollback; input clearing can precede acceptance. Deepen the relevant protocol declaration and canonical admission record before changing retry behavior. [`s2.l3.design-tui`, “Terminal input becomes admission through ordered, separate operations”; captured prompt source.]

An ambiguous response is not permission to create another session or request. Browser submission retains dispatched identity, has an acknowledged policy/owner gate, and restricts deletion to never-dispatched, confirmed-empty sessions; restoration is not guaranteed on every branch. Preserve later unsent edits and permanently expired generations. The TUI wrapper does not inherit browser retry controls. **Instruction:** public Protocol/Server HttpApi changes require `bun run generate` from `packages/client`; never hand-edit `src/generated` or `src/generated-effect`. Client runtime remains dependent on Schema/Protocol, not Core/Server. [`s2.l3.app-session`, “Submit once, then hand the draft to its session”; `s2.l3.design-tui`, “Ambiguous sends, live projection and request decisions keep different identities”; `AGENTS.md:1–2,209–216`.]

### UI lifecycle, accessibility and typed copy

**Trigger:** stale callbacks, dialogs surviving navigation, focus/scroll regressions or incorrect language/direction. Identify the caller’s generation and resource owner before editing. Shared primitives live in `packages/ui`; app policy and final rendering belong to their consumers. Inspect `packages/ui/src/context/dialog.tsx` for detached `show` versus caller-owned `showOwned`, and `packages/ui/src/context/worker-pool.tsx` for injection without disposal ownership. Keep final consumer sanitization when moving Markdown rendering; parser configuration alone is insufficient. Test route disposal and late completions, not only a fixture’s appearance. [`s2.l3.design-tui`, “Rendered state follows caller and resource lifetimes”; `s2.l3.app-session`, “Render and localize under caller-owned lifetimes”.]

**Instruction:** app callsites use `language.t(...)` and `language.plural(...)`; native main-process callsites consume shared typed translation bundles through `nativeT(...)`. Shared modules own locale selection, plural resolution, fallback and interpolation. Feature/native code must not branch on locale, choose plural categories or concatenate grammatical fragments. Preserve existing English keys/text byte-for-byte; extend the shared bundle/API for richer grammar. Verify terminology against the prescribed corpora and record uncertainty. The TUI remains English-only and the known hardcoded-English startup exception remains. [`packages/ui/AGENTS.md`; `packages/app-shell/AGENTS.md:23–34`; `apps/desktop/AGENTS.md:5–14`; `s2.l3.design-tui`, “Language and appearance cross app and host contracts”.]

Treat content locale and `layoutLocale` independently. The RTL skill requires English LTR, forced RTL, a real RTL locale and mixed code/path content, checking focus, arrows, resize/scroll endpoints and native caption controls. Preserve logical layout without reversing semantic DOM order. The segmented-control DOM-order arrow gap is a finding to investigate, not evidence of an authorized repair. [`.orchestra/skills/rtl-aware-development/SKILL.md`; the accepted language section above.]

### Themes, assets and generated products

**Trigger:** invalid configuration, stale generated output, incorrect preview or mismatched icons. Record theme ID/scheme, selected locale and exact input/output paths; identify the producer before editing its output.

| Change owner | Safe edit and downstream obligation | Evidence to deepen or stopping boundary |
| --- | --- | --- |
| `TuiConfig.Info` in `packages/tui/src/config/index.tsx` | Change the declaration, then regenerate through `apps/cli/script/schema-files.ts` and inspect `schema/tui.json`. | Check defaults/consumers. Terminal `defs/theme` is not desktop `light/dark`. |
| Desktop schema and browser theme owners | Edit `packages/ui/src/theme/desktop-theme.schema.json`; the CLI script mirrors it to `schema/theme.json`. Exercise preview races, commit/cancel and persistence separately. | The URL loader has no runtime schema decoder; a type or preview guard is not malformed-input validation. |
| UI token producers | From `packages/ui`, declared `generate:tailwind` and `generate:v2-oc2` scripts regenerate their respective products. | OC-2 updates only `v2Overrides`; fonts/fixed avatar foreground stay outside. App palette/first-paint generation is a separate owner. |
| SVG/sprite/type and distribution owners | Follow `packages/ui/vite.config.ts`; review paired sprite/type diffs and downstream package consumers. | Provider-logo refresh fetches external bytes. Stop short of asserting reproducibility, rights or visual equivalence; app sprite provenance remains unresolved. |

These are future generation routes, not executed commands. The CLI schema script writes config, TUI and theme schemas; inspect its complete diff. A declared build or installed-state label does not establish packaged output. [`s2.l3.design-tui`, “Generated products reach consumers through distinct maintenance paths”; “Language and appearance cross app and host contracts”; `s2.l3.desktop-web`, “Carry changes through shared UI and distribution”; named config/schema captures; `packages/ui/package.json:196–203`.]

### Operational diagnosis and updating evidence

For a blank or disconnected view, separate readiness, location filtering, hydration and projection. Failed history can appear empty; local prompt history is not the server journal. At a host boundary, identify the actual predicate: desktop HTTP success, WSL authenticated health/wrong-password rejection and shared-app health differ. Retain the stable-exit/no-restart discrepancy. Renderer changes must use the preload API; channel-specific admission still needs inspection, especially around the observed Live/WSL wrapper difference. A shared UI edit cannot establish native authorization. [`s2.l3.design-tui`, “Ambiguous sends, live projection and request decisions keep different identities”; `s2.l3.desktop-web`, “Launch, choose a server and identify the health decision”; “Cross renderer, preload and main with a scoped capability”; `apps/desktop/AGENTS.md:3–4`.]

**Instructions:** do not restart the app or server. Treat logs as data without editing/deleting them; fix repeated noise at its source. Use `describeError` for caught values and `createFrameResizeObserver` when callbacks write layout. Preserve cleanup and avoid duplicate rejection listeners. [`packages/app-shell/AGENTS.md:8`; `.orchestra/skills/app-log-hygiene/SKILL.md:8–16`.]

## Verification and boundaries

These routes apply to a subsequent authorized change. Start with the affected package’s declared check:

| Package directory | Declared route | What remains separate |
| --- | --- | --- |
| `packages/tui` | `bun run typecheck` → `tsgo --noEmit` | Mounted prompt, lifecycle, native/OS and server-admission behavior. |
| `packages/ui` | `bun run typecheck` → `tsgo --noEmit`; `build` uses `tsc -p tsconfig.build.json` after clearing `dist` | Generated outputs, consumer compatibility, focus/geometry and translations. |
| `apps/storybook` | `bun run build` → `storybook build`; no `typecheck` script is declared | Fixtures use app/router mocks; accessibility is `todo` and the CSS playground mutates source. |

Sources: `packages/tui/package.json:8–11`, `packages/ui/package.json:196–203`, `apps/storybook/package.json:6–9`; `s2.l3.design-tui`, “Generated products reach consumers through distinct maintenance paths”. None was run here.

**Instruction:** product tests run on GitHub Actions, not this machine. From repository root, use the documented runner with the affected package selector:

```text
bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]
```

Exact named files run in the specified order; directory/filter arguments may broaden the run. The runner uploads a working-tree snapshot to a temporary branch, so invoking it is a remote action, not part of this documentation task. The runner’s package-selector implementation was not inspected here; confirm the selector before dispatch. [`AGENTS.md:159–166`.]

For TUI changes, carry `test/context/session-actions.test.ts`, `test/app-lifecycle.test.tsx` and `test/cli/cmd/tui/sync-live-hydration.test.tsx` into the chosen package route. Add a mounted composer check for IME/double-submit/rejection; the existing submit-race test mirrors logic. UI plural-category tests cannot establish translation or layout quality. **Instruction:** app session/timeline changes additionally require a production benchmark baseline and after-change comparison. [`s2.l3.design-tui`, “Change impact and verification ownership”; `packages/app-shell/AGENTS.md:3–4`.]

Stop when required identity, producer provenance, authorization enforcement or platform behavior lacks evidence; deepen that owner’s source and focused check before asserting a guarantee. Preserve inherited evidence limits for disposal, sanitization, translation/a11y, asset rights, real host behavior and post-crash provider recovery. Reconnection is not replay or clustered execution. After an authorized source change, update affected captures/hashes, generated diffs and predecessor explanations, then rebuild factual dependents; navigation links alone do not create factual rebuild obligations. Record actual commands/results and remaining gaps. This unit ran no product test, typecheck, generation, benchmark, application, remote CI or provider operation. [`s2.l3.app-session`, “Recover the projection without inventing execution recovery”; `s2.l3.design-tui`, “Change impact and verification ownership”; maintenance recommendation.]

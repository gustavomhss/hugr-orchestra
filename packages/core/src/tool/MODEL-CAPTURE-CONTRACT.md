# Native model-projection contract

Baseline: Orchestra dev `ad40b080e9b77fe8f2ff9a36fb0b2cecfa33d3d8`.

This is an internal capability/projection foundation, not activated Lean filtering.
The processor dependency will be pinned after the independent Lean expansion.
The compiling projector scaffold and deliberately RED future-projection test are
retained at commit `0daf04815cf3a707e42ab9cb092c0f1080ed7c69`; the projection author
owns their implementation in a separate small PR. This capture-only baseline does
not ship a dormant processor or a failing future-feature test.

## Frozen interfaces

`ToolModelCapture.Input`, `Owner`, `Candidate`, `Binding`, `record/get/authentic/bind/bound` and
`ToolModelProjection.Input`, `FilterResult`, `Projection`, `project` are frozen
for this wave. Authors may implement bodies but not change signatures.
`ToolModelCapture.Output` is structurally identical to native ToolOutput and
references the actual Schema ToolContent contract by type-only import.

Projection author's exact type anchor (`src/tool/model-projection.ts`):

```ts
export * as ToolModelProjection from "./model-projection"
import { ToolModelCapture } from "./model-capture"
export type FilterResult = {
  readonly inputBytes: number
  readonly outputBytes: number
  readonly reason: string
} & (
  | { readonly status: "reduced" | "normalized"; readonly replacement: string; readonly profile?: string }
  | { readonly status: "passthrough" | "failed_open" }
)
export interface Input {
  readonly enabled: boolean
  readonly owner: ToolModelCapture.Owner
  readonly binding?: ToolModelCapture.Binding
  readonly approved: ToolModelCapture.Output
  readonly limits: { readonly maxLines: number; readonly maxBytes: number }
  readonly filter: (observation: ToolModelCapture.Observation) => FilterResult
}
export interface Projection {
  readonly output: ToolModelCapture.Output
  readonly decision?: FilterResult
}
export const project: (input: Input) => Projection = /* author implementation */
```

Native producers provide execution facts after validated execution, through an
opaque object capability; serialized tool name/arguments/output fields do not
authenticate a candidate. Permission decoration retains the original producer
closure. Same-named custom tools do not gain eligibility from their name.
`Tool.make` gains an optional host-only `modelCapture({input, output})` callback
returning `ToolModelCapture.Input | undefined`, invoked only after successful
execution and output-schema encoding. It records the actual Context Session/call
owner. Capture callback failure declines metadata only; it never catches execution,
permission, inspection, output-schema or interruption failures.

Capture snapshots text/content/structured status before generic host bounding.
Host-only `bind` associates the actual bounded baseline with the captured carrier
and its immutable Session/call owner. Projectors must reject crossed owners and
forged bindings; arbitrary caller-supplied candidate/baseline pairs are not accepted.
Both snapshots are detached/deep-frozen, so in-place policy mutations are visible.
Snapshot domain is plain objects/arrays, finite scalar values and undefined
optional fields. Map/Set/Date, functions, cycles, nonfinite numbers and clone failures
decline capture/binding; no generic immutability guarantee for exotic values.
The host, not arguments/metadata, owns carrier→bounded-baseline association inside
one invocation; `bind` requires the producer's exact immutable Session/call owner
and identical structured status/media. The projector consumes an issued Binding
plus that owner, not independently supplied candidate/baseline pairs.
Policy before/after
hooks continue to receive the existing baseline semantic view. Only after their
approval can `project` derive the selected model view. It may rebuild the native
template plus known append-only policy notes; arbitrary hook mutation declines.

Only complete exit-zero shell captures are eligible. Unknown, timeout, failure,
truncation, disabled options, bad capability, bad mapping, filter exception,
invalid metrics/replacement, or a whole-view line/UTF-8 byte budget failure must
return the exact `approved` object. No command rewriting, execution, filesystem,
network or extra model call occurs in the projection layer.

The projector preserves unrelated text/media and structured status; it checks
the complete text view with newline separators, a conservative envelope for
current host/provider joins. It never reuses baseline overflow markers as new
original references, never changes replayed history, and never catches denied
execution as a Lean processing failure. Native settlement/retention/UI wiring
will consume these interfaces in the next dependency-ready cut.

## Acceptance spine / ownership

- A1/A2: Tool.make/CoreBash authentic capture, withPermission parity, same-name
  custom tools and forged metadata ineligible; zero/nonzero/timeout/truncated/
  unknown/empty output facts and immutable snapshots. Existing permission,
  inspector, schema failure and interruption semantics stay unchanged.
  Actual successful Tool.make calls with capture callback throwing or returning
  undefined preserve their exact native result but issue no capture capability.
- B1/B2: project designated slot only; preserve media, status, warnings, multiple
  appended notes; reject in-place/nested structured, text, media/order mutations,
  fake capabilities and crossed owners. Every decline returns approved by identity;
  disabled/unauthentic/bad facts/invalid limits do not invoke the processor.
- B3: verify actual UTF-8 metrics, smaller valid replacement, strict result status,
  exceptions/passthrough/failed-open/unknown/malformed results; exact whole-view
  byte/line boundary and one-over cases including astral characters, separators,
  empty parts/trailing newlines and after-hook notes. Sources remain unchanged.
- C1/C2: enabled true/false/omitted through both schemas and migration; reject
  string/number/null values. Real backend JSON/JSONC patch→persist→reload preserves
  thresholds, other config, comments and false across repeated updates. Regenerate
  the legacy SDK from the changed schema, never hand-edit its generated type.

Runtime registry/standard-desktop wiring, dependency packaging, original storage,
durable replay, SDK eligibility and UI remain explicit next-cut acceptance items.
No foundation PR may claim native filtering is activated or those items passed.

## Provenance

Observation and FilterResult public interface clauses are transcribed from
HuGR-Lean commit `0d28527258c09fe5746dfcbe0e51f45d3b937e4e`,
`src/core/types.ts` lines 1–8 and 27–34, MIT (copyright 2026 gmhelmold).
Modification: host-local interfaces, no runtime parser/profile implementation
copied; native opaque capability and projection envelopes added. Original
license: https://github.com/gustavomhss/HuGR-Lean/blob/0d28527258c09fe5746dfcbe0e51f45d3b937e4e/LICENSE.

### Donor permission notice

MIT License

Copyright (c) 2026 gmhelmold

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Core Tool Architecture

This folder owns Core's one local tool representation, process and Location registration, effective lookup, and settlement.

## Representations

- `tool.ts` defines the opaque canonical `Tool.make({ description, input, output, execute, toModelOutput })` value. Application tools and shipped built-ins use the same type.
- `application-tools.ts` stores process-scoped application registrations.
- `tools.ts` exposes the registration-only `Tools.Service` view used by Location producers.
- `registry.ts` stores only canonical tools, overlays Location registrations over application registrations, derives definitions, invokes tools, and applies generic output bounding.

Do not add a second executable entry type, registry-owned executor, authorization callback, output-path callback, or legacy normalization path.

## Construction

Tool schemas and projection use `input` and `output` terminology. A tool value is opaque: its codecs, executor, definition derivation, and catalog permission declaration are private runtime details.

Location-scoped built-in layers acquire `PermissionV2.Service` and every other required Location service while the layer is constructed. The executor captures those services. Permission sources are always constructed from the canonical invocation context:

```ts
const source = {
  type: "tool" as const,
  messageID: context.assistantMessageID,
  callID: context.toolCallID,
}
```

Leaves own resolution, permission, and side-effect ordering. Translate only expected typed errors into `ToolFailure`; do not use `catchCause`, because interruption and defects must survive.

## Registration

Built-ins register through `Tools.Service.register({ [name]: tool })`. Application tools register through `ApplicationTools.Service.register(...)`, exposed publicly as `orchestra.tools.register(...)`.

Both are scoped:

- The latest active same-placement registration wins.
- Closing any registration removes only that registration and reveals the next active one.
- Location registrations take precedence over application registrations.
- An invocation captures the effective tool once settlement starts.

`ApplicationTools.Service` is process-scoped and shared by all Locations. `ToolRegistry.Service` is Location-scoped. Do not make the registry process-global or construct a separate application-tool service for each Location.

## Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

Built-in `Tool.withOnDemand` marks catalog metadata only. These tools stay eligible in captured definition/identity lookup and canonical settlement, but default model advertisement omits them. An explicit host-owned `advertisedNames` projection may include them; it never grants execution permission.

## Output

Built-ins return complete validated domain output. `ToolRegistry.Materialization.settle` is the only execution and generic model-output bounding boundary and owns managed retention paths.

A result the generic bound left whole then passes the Lean projection (`lean-output.ts`): only results a native producer attested through `modelCapture` (bash, glob, grep, webfetch) are compacted or summarized, and the measurement reaches the tool part's `metadata.lean` through `LeanOutput.offer/take`. Lean never fails or reorders settlement.

Producer capture limits come before that bound and are separate from it. Bash captures at most `MAX_CAPTURE_BYTES` (1 MB) of output in memory and keeps the start and the end of anything longer (`output-window.ts`), also when the command times out, so a failure printed at the end is not lost. Its result then goes through `ToolOutputStore.bound` like every other tool's: a result too long for the model's context keeps its start and end and the full text is saved to a managed file, named in `outputPaths` and in the nudge the model reads. The bash tool description says the same.

A tool's refusal reaches the model in `ToolFailure.message`. A permission refusal (`CorrectedError` with the owner's feedback, `BlockedError` with its deny rules) goes through `ToolPermissionFailure.of` (`permission-failure.ts`), never to a generic "Unable to ...". `write` refuses to replace a file that changed since the Session last read or wrote it (`file-reads.ts`, a digest per Session and path), and `edit`, `apply_patch` and `read` keep that record current.

## Current Gaps

- Plugin boot has not been redesigned to register canonical tools through `Tools.Service`; do not redesign it as part of leaf migrations.
- MCP tools (`src/mcp.ts`) register per server through `Tools.Service` as `Tool.dynamic` values, whose input contract is the server's JSON Schema; closing the server's registration scope removes them. Session-scoped registrations still need an explicit design.
- The public Session result shape currently exposes managed `outputPaths`; full storage encapsulation requires a future opaque managed-output reference design.

# Recortes exatos para revisão de L1-A

Fonte comum: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Texto entre fences é original; intervalos são recortes distintos. Blob Git conferido sobre a captura integral. Evidência estática, sem execução do produto. Fontes e inspeção completa em `sources.json`.

### E01 Nome e shipping

`AGENTS.md` blob `ef3b523b0c00aed722582b870c1919188edc4c4f`

L14–L15:
```text
- Maestro's name is fixed. The app and other Sessions find and address the conductor by it, so config cannot rename it.
- Every other native seat is addressed by its stable id (for example `backend`); its display name is a user setting (`agent.<id>.name`). Code, tests, docs, commits and PR text refer to a seat by role or id, never by a default display name.
```

L150–L154:
```text
- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```

### E02 Identidade legada

`modules/maestro/coordination/src/roster.ts` blob `979ea02edc7ebe24c511d2511ca41518ec21df14`

L23–L29:
```text
export const LEGACY_BACKEND_ID = BACKEND_DEFAULT_LABEL.toLowerCase()

export function canonicalMemberId(id: string): string
export function canonicalMemberId(id: string | undefined): string | undefined
export function canonicalMemberId(id: string | undefined) {
  return id === LEGACY_BACKEND_ID ? "backend" : id
}
```

### E03 IDs instalados

`modules/maestro/coordination/src/seats/index.ts` blob `a4f0ecf5b5144f91837571286f91fc552be0c826`

L19–L28:
```text
export const all: Readonly<Record<string, Seat>> = Object.freeze({
  [backend.id]: backend,
  [archie.id]: archie,
  [patty.id]: patty,
  [lucy.id]: lucy,
  [billy.id]: billy,
  [jimmy.id]: jimmy,
  [rosie.id]: rosie,
  [frankie.id]: frankie,
  [live.id]: live,
```

### E04 Frontend não staffed

`modules/maestro/coordination/src/seats/patty.ts` blob `a1b226b095aa99f8254e6151fb05975079cebfd8`

L5–L5:
```text
  id: "patty",
```

L14–L14:
```text
  staffed: false,
```

### E05 Segurança não staffed

`modules/maestro/coordination/src/seats/billy.ts` blob `56d675389853833cd1a699442d4c736a89f9d5b7`

L5–L5:
```text
  id: "billy",
```

L14–L14:
```text
  staffed: false,
```

### E06 Docs não staffed

`modules/maestro/coordination/src/seats/rosie.ts` blob `aa03c53d091469775465bdd13e1b384e8bc4a8dc`

L5–L5:
```text
  id: "rosie",
```

L14–L14:
```text
  staffed: false,
```

### E07 Auditoria não staffed

`modules/maestro/coordination/src/seats/frankie.ts` blob `04ea6769609b80ce8c3c3a8ea4ed332214fdcb1e`

L5–L5:
```text
  id: "frankie",
```

L14–L14:
```text
  staffed: false,
```

### E08 Gate nativo

`modules/maestro/coordination/src/v2/tools/gate.ts` blob `4a34873539145118daee41d4f12df2ef01c250b6`

L17–L21:
```text
    Effect.gen(function* () {
      const agent = yield* agents.get(context.agent)
      const native = owner === AgentV2.defaultID || seats.has(owner)
      if (!native || context.agent !== owner || agent?.id !== owner)
        return yield* new Tool.Failure({ message: refusal })
```

### E09 Continuação

`modules/maestro/coordination/src/v2/governance.ts` blob `acab0bd78caa6e4810b08a2fbabf9bc9ff437ba7`

L122–L125:
```text
        const continuing = !!(reserved || workflow || resumed)
        if (!continuing && seat && !Seats.staffed(seat))
          return yield* new ToolFailure({ message: `Task denied: seat-unstaffed: \`${target}\` is not staffed yet.` })
        // Every child starts from the rules core's TaskTool inherits from the parent (the earlier runtime's childPermissions); a resumed
```

### E10 WorkResult não decidível

`modules/maestro/coordination/src/v2/tools/result.ts` blob `4b00a7cda38bc8940df36140d16f1f15edf35278`

L19–L22:
```text
/**
 * The earlier runtime decides a backend WorkResult stored on the Task's tool part. V2 Task settlement carries the WorkResult in the
 * Task's structured result, but that result has no tool-part identity and no decision record, so nothing here decides it.
 */
```

L31–L40:
```text
        input
          .gate(context, AgentV2.defaultID, "WorkResult decision requires Maestro")
          .pipe(
            Effect.andThen(
              Effect.fail(
                MaestroToolGate.hold(
                  "work-result-unavailable",
                  "A V2 Task result carries its backend WorkResult but has no tool-part identity to record a decision on. Report the Task's result to the owner instead of recording a decision.",
                ),
              ),
```

### E11 Conductor

`modules/maestro/coordination/src/v2/conductor.ts` blob `ced9a56f21940ef84417056eca5835be71e611da`

L8–L16:
```text

// Maestro conducts; seats investigate and build. These limits hold Maestro to that in both engines: every Maestro call
// passes ToolSafety.run, natively around the tool and in Claude mode around the host's authorization, so each check
// runs before the call and each count after it succeeds. A budget lasts one drain: the runner's `session-idle` event
// clears it, and a restart starts a fresh one.

export const READS = 10
export const LINES = 20
export const FILES = 2
```

L67–L67:
```text
      if (READ_TOOLS.has(input.tool) && state.reads >= READS) {
```

L77–L77:
```text
      if (input.tool === "task" && args.background !== true) state.reads = 0
```

L112–L114:
```text
  // Git decides what changed, whatever wrote it. The worktree is measured before each Maestro edit or shell, so the
  // call that crosses the limit stands and the next one is refused. Without snapshots (no git, or `snapshots: false`)
  // nothing is measured.
```

L121–L128:
```text
        const lines = diff.reduce((sum, file) => sum + file.additions + file.deletions, 0)
        if (state.over && state.last) state.locked = true
        state.over = lines > LINES || diff.length > FILES
        state.last = now
      }
      if (state.locked || (state.over && tool !== "bash"))
        return yield* new ToolSafety.Denied({
          reason: "maestro-write-budget",
```

L135–L136:
```text
    /** Ends Maestro's budget for the drain that settled. */
    idle: (sessionID: string) => budgets.delete(sessionID),
```

### E12 Write roots e Windows

`modules/maestro/coordination/src/v2/governance/write-roots.ts` blob `964f22804a2b06b9a14a5f95b2b428e1af77d586`

L29–L29:
```text
export const PERMISSION = "tool_safety_write_root"
```

L61–L68:
```text
export function profile(project: ToolSafety.Profile | undefined, roots: ReadonlyArray<string>, directory: string) {
  return {
    ...project,
    writeRoots: intersect(project?.writeRoots, roots, directory),
    requireSandbox: true,
    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: false },
  } satisfies ToolSafety.Profile
}
```

L161–L166:
```text
      const narrow = (input: ToolSafety.Invocation, project: ToolSafety.Profile | undefined, bound: ReadonlyArray<string> | undefined) => {
        const scoped = bound ? profile(project, bound, location.directory) : project
        const seat = Seats.find(input.agent)
        if (!seat || (process.platform !== "darwin" && process.platform !== "linux")) return Effect.succeed(scoped)
        return confine(fs, scoped, seat, location)
      }
```

### E13 Aprovação direta

`modules/maestro/coordination/src/approval.ts` blob `4181f5cefc9b1541fc2b73b4fcaca7e1a349b12e`

L135–L147:
```text
  const reply = ordered.find((message) => message.id === input.replyMessageID)
  if (!reply) return { status: "HOLD", reason: "reply-not-found" }
  if (reply.sessionID !== input.presentation.sessionID) return { status: "HOLD", reason: "reply-session-mismatch" }
  if (reply.role !== "user") return { status: "HOLD", reason: "reply-not-direct-user" }
  if (reply.synthetic) return { status: "HOLD", reason: "reply-synthetic" }
  if (reply.seq <= presentationMessage.seq) return { status: "HOLD", reason: "reply-not-after-presentation" }
  if (
    ordered.some(
      (message) => message.role === "user" && message.seq > presentationMessage.seq && message.seq < reply.seq,
    )
  ) {
    return { status: "HOLD", reason: "reply-not-immediate" }
  }
```

L262–L266:
```text
function classifyReply(text: string): ApprovalDecision["outcome"] | undefined {
  const normalized = text.trim().toLocaleLowerCase("en-US")
  if (/^(approve|aprovo)[.!]?$/.test(normalized)) return "APPROVED"
  if (/^(decline|declino|cancel|cancelar)[.!]?$/.test(normalized)) return "DECLINED"
}
```

### E14 Quatro owners

`modules/maestro/coordination/src/v2/atlas-source.ts` blob `5388417c92f33c2cfd0d06d58d04446c35631d42`

L21–L27:
```text
export type Owner = "backend" | "jimmy" | "archie" | "live"

/** The Atlas Memory owner an agent is: a native seat of this Location whose seat definition carries Atlas Memory. */
export function owner(id: string, seats: MaestroSeats.Interface): Owner | undefined {
  if (!seats.has(id) || Seats.all[id]?.atlasMemory !== true) return undefined
  return id === "backend" || id === "jimmy" || id === "archie" || id === "live" ? id : undefined
}
```

### E15 Spec divergente

`docs/specs/seat-framework/README.md` blob `67c2cefb21ad554cb4aed12051bba00a15a36a3e`

L51–L51:
```text
Atlas Memory's public boundary and durable receipts have one supported owner: backend. Definitions requesting it for another id fail. Exposure requires the native owner's capability; no new seat is bound to backend memory. Backend toolkit packs, runtimes and skill content remain backend-only; requesting that toolkit from another seat fails. Core derives its closed entry-skill type from the packaged directories via `bun script/toolkit-pack.ts skills` (run in `packages/core`). Core does not import orchestra.
```

### E16 Comentário standalone

`modules/maestro/coordination/src/v2/seats.ts` blob `f27ddca3b35551b16482f7032197af7cba25e3e6`

L40–L42:
```text
 * The roster loads lazily: it materializes the seats' skill trees and the playbooks, which only an Orchestra build
 * packages. Where they are missing (the standalone CLI binary today) the seats and playbooks are skipped with a warning
 * and the Location still opens; the denials apply regardless.
```

### E17 Root embedded

`modules/maestro/coordination/src/seat-skill-root.ts` blob `c01632881ed8e61ee0b008fb41d36ef8ceba8afd`

L21–L24:
```text
const packaged =
  (typeof ORCHESTRA_COMPILED !== "undefined" && ORCHESTRA_COMPILED) ||
  (typeof ORCHESTRA_SEAT_SKILLS_EMBEDDED !== "undefined" && ORCHESTRA_SEAT_SKILLS_EMBEDDED === true)
const embedded = packaged ? await import(
```

### E18 Build standalone

`apps/cli/script/build.ts` blob `a5066b1fe295a10c5463e33f4a256fb3dab32cc4`

L100–L104:
```text
    // The roster loads the seat skill trees from this virtual module (seat-skill-root.ts) instead of the source checkout.
    files: seatSkills,
    define: {
      ORCHESTRA_SEAT_SKILLS_EMBEDDED: "true",
      // Noncompile analysis needs the same native constants as --compile so
```

### E19 Módulo virtual

`modules/maestro/coordination/src/seat-skills-module.ts` blob `19f7786d82aa7043213a95a3e3e5eb8cb505d573`

L6–L8:
```text
// Every seat's packaged skills (F6.12) as one generated module: seat id -> tree-relative path -> file text. Both the
// Bun binary (script/build.ts) and the desktop Node sidecar (script/build-node.ts) embed it; modules/maestro/coordination/src/seat-skill-root.ts
// extracts each tree to a real directory at runtime.
```

L40–L41:
```text
export async function seatSkillsFiles() {
  return { "orchestra-seat-skills.gen.ts": await seatSkillsModule() }
```

### E20 Inventário playbooks

`modules/maestro/coordination/src/playbook-content.ts` blob `396e6f586c07471a9b14d8b985043a4874d0c0dd`

L5–L6:
```text
// This is the required source inventory, independent of whatever a build happened to find on disk.
export const names = ["frame-request", "maestro-orchestra", "maestro-plan", "maestro-repo", "maestro-run"] as const
```

### E21 Contexto Arsenal

`modules/maestro/arsenal/src/contract.ts` blob `d94540c2429d6148f8d7ebc183307b4c6e7e8272`

L5–L11:
```text
export type Effect = "read" | "write" | "process"
export interface ArsenalContext {
  directory: string
  stateDirectory: string
  projectID: string
  authorize(request: { readonly effect: Effect; readonly paths: readonly string[]; readonly commands: readonly string[] }): Promise<void>
}
```

### E22 Validação Arsenal

`modules/maestro/arsenal/src/registry.ts` blob `57564377e5a7d0a008cdb3b94148deb0b48be634`

L55–L60:
```text
export async function execute(name: string, args: unknown, context?: ArsenalContext): Promise<ToolTextResult> {
  const entry = entries.get(name)
  if (!entry) return failure("unknown_tool", `unknown tool: ${name}`)
  const declared = descriptor(name)
  const validation = validateArgs(declared.inputSchema, args)
  if (!validation.ok) return failure("invalid_arguments", `invalid arguments for ${name}: ${validation.errors.join("; ")}`)
```

L70–L70:
```text
  if (declared.effects.length && (!context || !context.directory || !context.stateDirectory || !context.projectID || typeof context.authorize !== "function")) return failure("missing_context", `non-pure tool ${name} requires ArsenalContext`)
```

L76–L76:
```text
  // Modules request exact path/command permission at their root-bound I/O boundary, before every side effect.
```

### E23 Arsenal nativo

`packages/core/src/tool/maestro-arsenal.ts` blob `84283f5af5ab599479b8185694f67c9a7142545c`

L37–L37:
```text
    "Execute one previously described Maestro Arsenal capability. arguments must satisfy the exact schema returned by maestro_arsenal_describe. Governance audit/usage/status observations and pricing come only from the host. Results are advice, not approval or execution receipts. Host permissions apply. Native Maestro or native upstream; upstream is limited to pure authoring operations.",
```

L122–L125:
```text
  const requireNative = (host: Host, context: C) =>
    host.nativeMaestro || (host.nativeUpstream === true && context.agent === "archie")
      ? Effect.void
      : Effect.fail(new Tool.Failure({ message: "Maestro Arsenal requires native Maestro identity." }))
```

L217–L221:
```text
        if (
          observed && typeof args === "object" && args !== null &&
          ["integrity", "aggregateID", "projectID", "sessionID", "auditWindow"].some((key) => key in args)
        )
          return yield* new Tool.Failure({ message: "GOVERNANCE_HOST_IDENTITY_OVERRIDE_DENIED" })
```

### E24 Fronteira Core

`packages/core/src/host.ts` blob `a0fc5bc9a36e50315b0ddddf4de3566555711250`

L39–L40:
```text
// One coordinator per process: these stay owned by the composition root.
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]
```

L49–L50:
```text
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
```

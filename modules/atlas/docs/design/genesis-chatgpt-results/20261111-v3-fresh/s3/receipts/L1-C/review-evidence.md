# Evidência decisiva L1-C

Fonte de todos os trechos: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Conteúdo exato, capturado pelo conector GitHub e verificado por Git blob SHA-1; SHA-256 externo e captura integral em `sources.json`. Os intervalos usam linhas originais; a separação de intervalos não altera seus bytes. Nenhum teste/runtime foi executado. Esta seleção serve ao juízo sem ferramentas; detalhes secundários continuam rastreáveis pelas fontes do corpo.

## E01 — Identidade

`modules/maestro/coordination/src/v2/seats.ts` — blob `f27ddca3b35551b16482f7032197af7cba25e3e6`

Linhas 129–131:
```text
 * A native seat's display label, as on the earlier runtime: its label variable (`HUGR_BACKEND_NAME`, `HUGR_UPSTREAM_NAME`), else
 * `agent.<id>.name`, else the roster default. The label is presentation only; the id stays the address. An invalid label
 * keeps the default and names the problem.
```

`modules/maestro/coordination/src/roster.ts` — blob `979ea02edc7ebe24c511d2511ca41518ec21df14`

Linhas 26–34:
```text
export function canonicalMemberId(id: string | undefined): string | undefined
export function canonicalMemberId(id: string | undefined) {
  return id === LEGACY_BACKEND_ID ? "backend" : id
}

// Validate installed definitions before creating any profile or roster entry. Scaffold seeds have no prompt yet.
Object.values(Seats.all).forEach((seat) => {
  if (canonicalMemberId(seat.id) !== seat.id) throw new Error(`Native seat id must be canonical: ${seat.id}`)
  validateInstalled(seat)
```

## E02 — Seats atuais

`modules/maestro/coordination/src/seats/backend.ts` — blob `57b6c41492d6baec1704fb2bdc109bb4d656a457`

Linhas 6–9:
```text
  id: "backend",
  role: "backend execution",
  abilityClass: "scoped repository write",
  returnCard: "backend-result",
```

Linhas 37–42:
```text
  workResult: "backend-work-result-v1",
  writeRoots: true,
  strictResume: true,
  atlasMemory: true,
  toolkit: true,
  mcp: ["hugr-composer"],
```

`modules/maestro/coordination/src/seats/archie.ts` — blob `82c7347a145df3858e83ca524d0837e546d0783f`

Linhas 5–8:
```text
  id: "archie",
  role: "product, architecture, specification and planning",
  abilityClass: "scoped proposal authoring",
  returnCard: "upstream-result",
```

Linhas 27–33:
```text
  planner: true,
  skills: ["archie-plan", "archie-work-package", "archie-workflow"],
  workResult: "upstream-work-result-v1",
  writeRoots: true,
  strictResume: true,
  atlasMemory: true,
  toolkit: false,
```

`modules/maestro/coordination/src/seats/jimmy.ts` — blob `c4c2cc732cead0ff3e0d19e5edcc5a2c76beefeb`

Linhas 6–8:
```text
  role: "codebase exploration",
  abilityClass: "read-only discovery",
  returnCard: "jimmy-result",
```

Linhas 14–20:
```text
  skills: ["jimmy-calibration", "jimmy-web-research"],
  workResult: "discovery-work-result-v1",
  writeRoots: false,
  strictResume: true,
  atlasMemory: true,
  toolkit: false,
  research: true,
```

## E03 — Consumo e embarque

`modules/maestro/coordination/src/seats/seat.ts` — blob `c75b784297a5f0fe35fbc62dbae235c3ea1b11a7`

Linhas 105–109:
```text
export function skillSource(id: string) {
  if (id === "backend" || id === "archie")
    return path.resolve(import.meta.dirname, "../../../../../modules/specialists", id, "skills")
  return path.resolve(import.meta.dirname, "../../../../../packages", `${id}-specialist`, "skills")
}
```

`modules/maestro/coordination/src/seat-skill-root.ts` — blob `c01632881ed8e61ee0b008fb41d36ef8ceba8afd`

Linhas 85–89:
```text
// Copies `files` into a directory keyed `<version>-<digest12>` by the installation version and the embedded content
// digest (the F6.12 manifest), unless it already holds exactly those bytes. Two builds never share a copy, even with the
// same version string (unversioned builds are all "local"), so no install replaces or removes a copy another process
// is reading. Old copies are kept: a rollback re-selects its own. Only a partial or tampered copy of this very content
// is replaced whole: the tree is written to a sibling temp directory and renamed into place.
```

## E04 — Toolkit

`packages/core/src/backend-toolkit/index.ts` — blob `e5c8e61d202f8a79a5b967d5abc467a97b58f4a3`

Linhas 27–32:
```text
export type EngineState =
  | { readonly status: "absent" }
  | { readonly status: "fetching"; readonly at: number; readonly budgetMs: number }
  | { readonly status: "ready"; readonly directory: string; readonly executable: string }
  | { readonly status: "failed"; readonly cause: string; readonly at: number }
  | { readonly status: "unsupported"; readonly reason: string }
```

## E05 — Claude: preset e gate

`modules/engine-adapters/claude-code/src/v2/host.ts` — blob `fa5708ad05b2e77d7b08074cf6b84f031e274b96`

Linhas 38–42:
```text
const GOVERNED_PLAYBOOK = "maestro-run-governed"
const GOVERNED_DENIAL = `Load the ${GOVERNED_PLAYBOOK} playbook with \`mcp__${MCP_SERVER}__skill\` before governed Maestro tools.`
// Session ids whose governed playbook has loaded: a governed tool is refused until its session has one.
const governedLoaded = new Set<string>()
const isGoverned = (name: string) => name.startsWith("maestro_") && !name.startsWith("maestro_arsenal_") && name !== "maestro_workflows"
```

Linhas 158–164:
```text
                if (SUBAGENT_TOOLS.includes(tool)) return { allow: false, reason: SUBAGENTS_REFUSED }
                // An agent whose rules deny `*` still reaches the Orchestra tools it holds, which sit behind ToolSearch.
                if (tool === TOOL_SEARCH) return { allow: true }
                if (HOST_REACH.has(tool)) return { allow: false, reason: OUTSIDE }
                if (tool.startsWith(MCP_PREFIX)) {
                  const name = tool.slice(MCP_PREFIX.length)
                  if (isGoverned(name) && !governedLoaded.has(turn.session.id)) return { allow: false, reason: GOVERNED_DENIAL }
```

Linhas 279–289:
```text
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: ClaudeHostOptions.append(
                turn.agent.id,
                served.map((tool) => tool.name),
                turn.system.filter((text) => !turn.context.includes(text)),
              ),
            },
            disallowedTools: SUBAGENT_TOOLS,
            settingSources: ["project"],
```

Linhas 588–588:
```text
    if (tool.name === "skill" && request.params.arguments?.name === GOVERNED_PLAYBOOK && settlement.result.type !== "error") governedLoad()
```

`modules/engine-adapters/claude-code/src/sdk.ts` — blob `41aee3049016ffd91e29000580c19b0fa7898c8d`

Linhas 43–47:
```text
  // Structural guard over every engine query, casts included: Claude mode keeps Claude Code's prompt (see Preset).
  const system: unknown = options.systemPrompt
  if (typeof system !== "object" || system === null || Array.isArray(system) ||
    !("type" in system) || system.type !== "preset" || !("preset" in system) || system.preset !== "claude_code")
    throw new Error("Claude Code turns must keep the claude_code system prompt preset")
```

## E06 — Claude: saída real

`modules/engine-adapters/claude-code/src/sdk.ts` — blob `41aee3049016ffd91e29000580c19b0fa7898c8d`

Linhas 69–79:
```text
        // Install before returning to the SDK, including its abort handling. Abort errors do not prove exit.
        exits.push(new Promise<void>((resolve, reject) => {
          const exited = () => { child.off("error", failed); resolve() }
          const failed = (error: Error) => {
            if (!("syscall" in error) || typeof error.syscall !== "string" || !error.syscall.startsWith("spawn")) return
            child.off("exit", exited)
            reject(error)
          }
          child.once("error", failed)
          child.once("exit", exited)
          if (child.exitCode !== null || child.signalCode != null) {
```

Linhas 89–92:
```text
    join: async (): Promise<void> => {
      const failed = (await Promise.allSettled(exits)).find((exit) => exit.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
    },
```

## E07 — Capability: dados e limites

`modules/capability-assets/README.md` — blob `c0c1f947e9ced6e7c67e5b113927272e2b2ec849`

Linhas 9–10:
```text
- `src/catalog.ts` exports `CapabilityAssetCatalog.all`, the closed list of 32 entries: A01 to A12 skills, A13 to A24
  provider packs, A25 to A32 native sources. Each entry has its upstream repository, pinned SHA, source paths, `nativeNames`
```

Linhas 15–15:
```text
- `assets/skills/` holds the adapted skill bodies: the twelve catalog skills plus `platform-cli` and `vault-operations`.
```

Linhas 19–21:
```text
Only `assets/skills` exists on disk. The `destination` paths for providers and native sources are reserved names
for later adaptations, not files. Provider `packID` values are semantic platform identifiers, and the provider presets are declarations: they
are not connections, approvals or operation receipts. License blob SHAs are Git blob SHA-1s, not raw-file hashes.
```

Linhas 25–27:
```text
No workspace imports the package. `packages/core/src/capability/mcp/index.ts` and the connection verifiers under
`packages/core/src/capability/connection/verifiers` carry data transcribed from `src/providers.ts`; the provenance note is
`packages/core/src/capability/service/PROVENANCE.md`. No seat or skill root loads `assets/skills` yet. To ship a skill
```

`modules/capability-assets/src/sources.ts` — blob `c9823e4e18f9a405b72929a9dac472c75715729b`

Linhas 29–29:
```text
  pendingEvidence: ["copied-file digests", "dependency integrity/licenses", "operation conformance", "live acceptance"],
```

## E08 — Dock: duas permissões

`modules/app-dock/src/application-tools.ts` — blob `c9ba94b8da4cb68d4c95b2c9f3fc80176a068f59`

Linhas 147–149:
```text
 * The Linux workspace tools, and the Dock tools that act only on native controls, belong to the `linux` subagent alone.
 * Every other agent gets these denials ahead of its own rules, so its own rules still win; the `linux` agent holds only
 * the workspace tools.
```

Linhas 158–159:
```text
        mutable.permissions.unshift(
          ...["linux_*", "ui_*", "dock_find", "dock_action"].map((action) => ({ action, resource: "*", effect: "deny" as const })),
```

`packages/core/src/mcp.ts` — blob `3d2203cb152ef733ca3b7d3231a302416a1f394b`

Linhas 241–249:
```text
            yield* permission.assert({
              action: McpCatalog.toolName(server, def.name),
              resources: ["*"],
              save: ["*"],
              metadata: { server, tool: def.name },
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
```

## E09 — Dock: lifetime e incerteza

`modules/app-dock/src/app-dock.ts` — blob `ad81a43b726abe216e5dc7cf45768698aaf59c03`

Linhas 359–360:
```text
  // rule and supplies a current ref. Only a certainly-undispatched stale target is located again; unknown outcomes are
  // never replayed.
```

Linhas 388–390:
```text
    return Promise.resolve(run(live.item, clock)).catch((error: unknown) => {
      if (!(error instanceof NativeRPCError) || error.code !== "stale-ref" || error.outcome !== "not-dispatched" || attempt >= 1) throw error
      return act(context, query, run, clock, attempt + 1)
```

`modules/app-dock/src/application-tools.ts` — blob `c9ba94b8da4cb68d4c95b2c9f3fc80176a068f59`

Linhas 125–127:
```text
 * Closes a deleted Session's Linux workspace: the desktop aborts the Session's pending calls and stops the processes and
 * terminals it owns. `SessionV2.remove` publishes `session.next.deleted` for the Session and each child it cascades to.
 */
```

Linhas 134–137:
```text
        yield* events.subscribe(SessionEvent.Deleted).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => port.postMessage({ type: "linux.session.close", sessionID: event.data.sessionID })),
          ),
```

## E10 — Janitor: scan e scope

`modules/janitor/src/scan.ts` — blob `e4512251b7db3fc10981766565ba5e47918bf513`

Linhas 7–10:
```text
// Read-only allowlist. No rm/kill/prune here. Actions happen only via explicit UI click.
const Allowlist = new Set(["ps", "df", "du", "lsof", "docker", "git", "vm_stat", "memory_pressure", "powershell.exe"])
const ScannerTimeout = Duration.seconds(5)
const ScannerOutputBytes = 256 * 1024
```

Linhas 347–350:
```text
export const scan = Effect.fn("Janitor.scan")(function* () {
  const groups = yield* Effect.all([readDf(), readProcesses(), readPorts()], { concurrency: "unbounded" })
  return summarize(groups.flat())
})
```

`modules/janitor/src/bootstrap.ts` — blob `bf021d51fae750aed994189985f2e43ff7b11269`

Linhas 31–44:
```text
  if (!enabled(env)) return
  janitorUsers += 1
  yield* Scope.addFinalizer(
    scope,
    Effect.gen(function* () {
      janitorUsers -= 1
      if (janitorUsers !== 0 || !janitorFiber) return
      const fiber = janitorFiber
      janitorFiber = undefined
      yield* Fiber.interrupt(fiber)
      clearLatestReport()
    }),
  )
  if (janitorFiber) return
```

`modules/janitor/README.md` — blob `98c7e605b2bc954f39eef51a97a18fa077ee7a3f`

Linhas 13–15:
```text
- Export keys `./bootstrap` (`startJanitorLoop(scope, sink, env)`, `enabled`, `configFromEnv`) and `./report-state` (`getLatestReport`).
- The sink is a parameter; the module never imports a bus.
- No package under `apps`, `packages` or `modules` imports it yet; only its own tests do.
```

Linhas 27–28:
```text
- Nothing is written to disk. The latest report is held in process memory and cleared when the last loop user leaves its scope.
- One loop runs per process, shared by every `startJanitorLoop` caller. `ORCHESTRA_JANITOR=0` disables it and `ORCHESTRA_JANITOR_INTERVAL_MIN` sets the interval.
```

## E11 — Discovery: binding e card

`packages/core/src/research/binding.ts` — blob `5f5c7f92d7ade9c902d54c0e9bce713871952e78`

Linhas 72–76:
```text
  if (frame.owner.agentID !== "jimmy" || context.agent !== "jimmy" || context.sessionID !== binding.executionSessionID)
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research invocation owner does not match" })
  const retained = yield* resolve(binding.executionSessionID, binding.projectID)
  if (!isDeepStrictEqual(retained, binding))
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research binding does not match retained placement" })
```

`modules/maestro/coordination/src/seats/prompt/jimmy.txt` — blob `ff485c909600c02d0eded9e79c6585360efa57ca`

Linhas 3–3:
```text
Return card: jimmy-result. The host builds it from `inquiry close`; never write one yourself.
```

## E12 — Histórico

`packages/jimmy-specialist/DELIVERY.md` — blob `370dd6238a711e2eb9dc9a39aeb7dafdd600ba18`

Linhas 11–12:
```text
- **Skills.** `jimmy-discovery` and `jimmy-research` (33 files, 16,753 words) are deleted. One optional skill, `jimmy-reference`, holds calibration and web-source doctrine (about 900 words) and is never required before the first search.
- **Guards.** `modules/maestro/coordination/test/jimmy-method.test.ts` pins the word cap, the absence of a fenced-card instruction and the single reference skill (JE-AC-M1).
```

`packages/jimmy-specialist/HANDOFF.md` — blob `c0413068b140e8f94f8bf726c4402d0e21c4f76f`

Linhas 35–36:
```text
- **Uncounted provider work in Claude mode:** hidden retries, compaction and in-flight provider work are not counted against the allowance. The deadline cannot cancel a provider call that is already running.
- **R14:** interruption plus compaction plus resume from the Atlas checkpoint has no Claude-mode qualification evidence.
```

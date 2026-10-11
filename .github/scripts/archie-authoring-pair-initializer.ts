// The program each paired arm runs inside the candidate runtime. Split from archie-authoring-pair.ts only for size;
// it imports the driver's guards back from that file, whose bytes the driver pins.
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { claude, model, type AssetPins, type Packet } from "./archie-authoring-pair"

export function initializer(job: { candidate: string; output: string; packet: Packet; assets: AssetPins; driverSha256: string; arm: "E" | "P"; preflightOnly: boolean; credentialPaths: string[] }) {
  // Real services and the native archie Session are never substituted. Wrappers only assert boundaries/capture facts.
  return `import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { mkdir, realpath, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
const job = ${JSON.stringify({ ...job, claude })}
const model = ${JSON.stringify(model)}
const requireCandidate = createRequire(job.candidate + "/packages/orchestra/package.json")
const { Cause, Effect, ManagedRuntime } = await import(requireCandidate.resolve("effect"))
const driverPath = ${JSON.stringify(fileURLToPath(new URL("./archie-authoring-pair.ts", import.meta.url)))}
const driverSha256 = ${JSON.stringify(job.driverSha256)}
const { evidenceDecoder, requireSecretFree, serializedEvidence, saveEvidence, admitArm, requireArmTime, boundaryRules, stageInventory, requireReadBoundary, requireSuccessfulAuthoring, requireStageObserved, readClaudeLogin } = await import(driverPath)
const decodeJson = await evidenceDecoder(job.candidate)
// Preflight never reads the login secret (presence only, below). A run holds it in memory, only to redact evidence.
const secrets = job.preflightOnly ? [] : await readClaudeLogin(job.candidate, process.env.HOME ?? "", process.env.USER ?? "", Number(process.env.PAIR_ARM_BUDGET_MS))
requireSecretFree({ global: job.packet.global, sources: job.packet.sources, stages: job.packet.stages }, secrets, decodeJson)
const redact = (text: string) => secrets.reduce((result, secret) => result.split(secret).join(""), text)
const { ChildProcess, ChildProcessSpawner } = await import(requireCandidate.resolve("effect/unstable/process"))
const { CrossSpawnSpawner } = await import(job.candidate + "/packages/core/src/cross-spawn-spawner.ts")
const { LayerNode } = await import(job.candidate + "/packages/core/src/effect/layer-node.ts")
const { filesystem } = await import(job.candidate + "/packages/core/src/effect/app-node-platform.ts")
const { memoMap } = await import(job.candidate + "/packages/core/src/effect/memo-map.ts")
type Command = import("effect/unstable/process/ChildProcess").Command
const contained = (command: Command): Command => command._tag === "StandardCommand"
  ? ChildProcess.make(command.command, command.args, { ...command.options, detached: false })
  : ChildProcess.pipeTo(contained(command.left), contained(command.right), command.options)
const spawnerRuntime = ManagedRuntime.make(LayerNode.compile(CrossSpawnSpawner.node), { memoMap })
const sharedSpawner = await spawnerRuntime.runPromise(ChildProcessSpawner.ChildProcessSpawner)
const originalSpawner = { ...sharedSpawner }
const groupSpawner = ChildProcessSpawner.make((command) => originalSpawner.spawn(contained(command)))
Object.assign(sharedSpawner, groupSpawner)
const { AppProcess } = await import(job.candidate + "/packages/core/src/process.ts")
const { Git } = await import(job.candidate + "/packages/orchestra/src/git/index.ts")
const processRuntime = ManagedRuntime.make(LayerNode.compile(LayerNode.group([AppProcess.node, Git.node])), { memoMap })
function fact(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
const emit = (event: object) => console.log(serializedEvidence(event, secrets, decodeJson).text.trimEnd())
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const save = (path: string, value: unknown) => saveEvidence(path, value, secrets, decodeJson)
const pairCode = (cause: unknown) => {
  const error = Cause.isCause(cause) ? Cause.squash(cause) : cause
  return error instanceof Error && /^PAIR_[A-Z_]+$/.test(error.message) ? error.message : "PAIR_INITIALIZER_OR_NATIVE_RUNTIME_FAILED"
}
const verifyInputs = async () => {
  fact(digest(await Bun.file(job.packet.packetPath).bytes()) === job.packet.packetSha256, "PAIR_PACKET_CHANGED")
  fact(digest(await Bun.file(driverPath).bytes()) === driverSha256, "PAIR_DRIVER_SOURCE_CHANGED")
  const inputs = [job.packet.global, ...job.packet.sources, ...job.packet.stages.map((stage) => stage.request), ...job.packet.nonModelArtifacts, ...job.assets]
  await Promise.all(inputs.map(async (input) => {
    const bytes = await Bun.file(input.path).bytes()
    fact(bytes.length === input.utf8ByteLength && digest(bytes) === input.sha256, "PAIR_INPUT_CHANGED_DURING_STAGE")
  }))
  return inputs.map((input) => ({ path: input.path, sha256: input.sha256, utf8ByteLength: input.utf8ByteLength }))
}
try {
const seeded = await processRuntime.runPromise(Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const git = yield* Git.Service
  fact(processes.spawn === groupSpawner.spawn, "PAIR_PROCESS_CONTAINMENT_NOT_BOUND")
  return { processes, git }
}))
const { AppRuntime } = await import(job.candidate + "/packages/orchestra/src/effect/app-runtime.ts")
try {
const { InstanceStore } = await import(job.candidate + "/packages/orchestra/src/project/instance-store.ts")
const { InstanceRef } = await import(job.candidate + "/packages/orchestra/src/effect/instance-ref.ts")
const { Agent } = await import(job.candidate + "/packages/orchestra/src/agent/agent.ts")
const { Session } = await import(job.candidate + "/packages/orchestra/src/session/session.ts")
const { SessionPrompt } = await import(job.candidate + "/packages/orchestra/src/session/prompt.ts")
const { PromptGuard } = await import(job.candidate + "/packages/orchestra/src/session/prompt-guard.ts")
const { MessageID } = await import(job.candidate + "/packages/orchestra/src/session/schema.ts")
const { ToolRegistry } = await import(job.candidate + "/packages/orchestra/src/tool/registry.ts")
const { ToolJsonSchema } = await import(job.candidate + "/packages/orchestra/src/tool/json-schema.ts")
const { WriteRoots } = await import(job.candidate + "/packages/orchestra/src/maestro/write-roots.ts")
const { BackendResult } = await import(job.candidate + "/packages/orchestra/src/maestro/backend-result.ts")
const { Permission } = await import(job.candidate + "/packages/orchestra/src/permission/index.ts")
const { Provider } = await import(job.candidate + "/packages/orchestra/src/provider/provider.ts")
const { ClaudeCodeTools } = await import(job.candidate + "/packages/orchestra/src/claude-code/tools.ts")
const { Wildcard } = await import(job.candidate + "/packages/core/src/util/wildcard.ts")
const { Seats } = await import(job.candidate + "/packages/orchestra/src/maestro/seats/index.ts")
const { SeatSkillRoot } = await import(job.candidate + "/packages/orchestra/src/maestro/seat-skill-root.ts")
const { UpstreamArsenal } = await import(job.candidate + "/packages/core/src/tool/upstream-arsenal.ts")
const loaded = await AppRuntime.runPromise(Effect.gen(function* () {
  const git = yield* Git.Service
  const store = yield* InstanceStore.Service
  fact(git === seeded.git && seeded.processes.spawn === groupSpawner.spawn, "PAIR_CONTAINED_GIT_NOT_BOUND")
  return { store }
}))
// Sequential arms avoid cross-arm wrapping; each has an independent Instance, archie Session and proposal.
for (const arm of [job.arm]) {
  const timing = admitArm(arm, Number(process.env.PAIR_ARM_STARTED_AT), Number(process.env.PAIR_TOTAL_DEADLINE_AT), Number(process.env.PAIR_ARM_BUDGET_MS))
  requireArmTime(timing)
  const root = join(job.output, arm)
  const project = join(root, "project")
  const placement = await AppRuntime.runPromise(loaded.store.load({ directory: project }))
  const run = <A, E>(effect: import("effect").Effect.Effect<A, E, import(${JSON.stringify(join(job.candidate, "packages/orchestra/src/effect/app-runtime.ts"))}).AppServices | import(${JSON.stringify(join(job.candidate, "packages/orchestra/src/effect/instance-ref.ts"))}).InstanceRef>) =>
    AppRuntime.runPromise(effect.pipe(Effect.provideService(InstanceRef, placement)))
  const services = await run(Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const prompts = yield* SessionPrompt.Service
    const registry = yield* ToolRegistry.Service
    const archie = yield* agents.get("archie")
    const toolIDs = yield* registry.ids()
    fact(archie.native === true && archie.mode === "subagent" && Seats.find("archie")?.profileKey === "upstream" && Seats.find("archie")?.strictResume === true, "PAIR_NATIVE_ABI_MISMATCH")
    fact(archie.engine === job.claude.engine && archie.model?.providerID + "/" + archie.model?.modelID === model, "PAIR_CLAUDE_ENGINE_BINDING_MISMATCH")
    fact(SeatSkillRoot.roots.archie === job.candidate + "/packages/archie-specialist/skills", "PAIR_NATIVE_SKILL_ROOT_UNPINNED")
    return { agents, sessions, prompts, registry, archie, toolIDs }
  }))
  const base = await realpath(placement.worktree === "/" ? placement.directory : placement.worktree)
  const proposal = join(project, "proposal.md")
  const dispatchPath = relative(base, proposal).replaceAll("\\\\", "/")
  const pattern = relative(placement.worktree, proposal).replaceAll("\\\\", "/")
  fact(dispatchPath && !dispatchPath.split("/").includes(".."), "PAIR_WRITE_ROOT_OUTSIDE_WORKTREE")
  // No Maestro: Task needs a Maestro assistant message, so the host binds the reserved write root and creates the
  // native archie Session itself, with stage 1's exact read grants and the proposal-only edit allowance.
  const session = await run(Effect.gen(function* () {
    const rules = yield* WriteRoots.bind("archie", [dispatchPath], [])
    fact(JSON.stringify(WriteRoots.read(rules)) === JSON.stringify([proposal]), "PAIR_WRITE_ROOT_BINDING_INVALID")
    return yield* services.sessions.create({ agent: "archie", title: "archie-pair-" + arm,
      permission: [...rules, ...boundaryRules(placement.worktree, project, [join(project, "global.txt")], job.assets), { permission: "edit", pattern, action: "allow" }] })
  }).pipe(Effect.provide(LayerNode.compile(filesystem))))
  emit({ type: "pair_preflight", arm, dispatch: "direct-archie", parentSessionID: null, sessionID: session.id, projectID: session.projectID, worktree: placement.worktree, project, dispatchPath })
  await save(join(root, "native-settings.json"), { archie: services.archie, toolIDs: services.toolIDs, engine: job.claude, dispatch: "direct-archie", parentSession: null, session, dispatchPath, worktree: placement.worktree, timing, assets: job.assets })
  const state: { index: number; calls: number; checks: number; turns: number; promptID?: string; prompt?: string; result?: unknown; claudeSessionID?: string; violation?: string; tools?: { name: string; description: string; schema: unknown }[] } = { index: 0, calls: 0, checks: 0, turns: 0 }
  const revealed = new Set<string>()
  const expectedLocal = () => [{ file: "global.txt", sha256: job.packet.global.sha256, utf8ByteLength: job.packet.global.utf8ByteLength }, ...job.packet.sources.filter((source) => revealed.has(source.id))]
  const localFiles = () => expectedLocal().map((source) => join(project, source.file))
  const blockedPaths = () => [job.packet.packetPath, job.packet.global.path, ...job.packet.sources.flatMap((source) => [source.path, ...("originalPath" in source ? [source.originalPath] : [])]),
    ...job.packet.stages.map((stage) => stage.request.path), ...job.packet.nonModelArtifacts.map((item) => item.path), driverPath, join(job.output, "initializer-" + arm + ".ts"),
    join(job.output, "session.db"), join(job.output, "config.json"), ...job.credentialPaths, join(job.output, "claude-E"), join(job.output, "claude-P"), ...["E", "P"].filter((other) => other !== arm).flatMap((other) => [join(job.output, "initializer-" + other + ".ts"), join(job.output, other, "project", "global.txt"), join(job.output, other, "project", "proposal.md"), ...job.packet.sources.map((source) => join(job.output, other, "project", source.file)),
      join(job.output, other), ...job.packet.stages.flatMap((_, index) => ["proposal.md", "native.json", "verified.json"].map((file) => join(job.output, other, "stage-" + (index + 1), file)))]),
    ...job.packet.sources.filter((source) => !revealed.has(source.id)).map((source) => join(project, source.file))]
  const boundary = async (bound: { permission?: import(${JSON.stringify(join(job.candidate, "packages/core/src/v1/permission.ts"))}).PermissionV1.Ruleset }, tools: string[]) => {
    requireArmTime(timing)
    await verifyInputs()
    const inventory = await stageInventory(project, expectedLocal())
    const expectedRules = [...boundaryRules(placement.worktree, project, localFiles(), job.assets), { permission: "edit", pattern, action: "allow" }]
    fact(JSON.stringify((bound.permission ?? []).filter((rule) => rule.permission !== "tool_safety_write_root")) === JSON.stringify(expectedRules), "PAIR_CHILD_PERMISSION_DRIFT")
    requireReadBoundary({ worktree: placement.worktree, allowed: [...localFiles(), proposal, ...job.assets.map((asset) => asset.path)], forbidden: blockedPaths(), operations: UpstreamArsenal.UPSTREAM_AUTHORING_OPERATIONS,
      operationGrants: [...services.archie.permission, ...(bound.permission ?? [])].filter((rule) => rule.action === "allow" && ["maestro_arsenal_describe", "maestro_arsenal_execute"].some((permission) => Wildcard.match(permission, rule.permission))),
      evaluate: (permission, path) => Permission.evaluate(permission, path, services.archie.permission, bound.permission ?? []).action, tools })
    job.assets.forEach((asset) => fact(Permission.evaluate("external_directory", join(dirname(asset.path), "*"), services.archie.permission, bound.permission ?? []).action === "allow", "PAIR_NATIVE_REFERENCE_EXTERNAL_GRANT_MISSING"))
    return inventory
  }
  const stageFile = (file: string) => job.preflightOnly ? join(root, "preflight-" + file) : join(root, "stage-" + (state.index + 1), file)
  const record = (file: string, value: object) => save(stageFile(file), { checkedAt: Date.now(), timing, ...value, tools: state.tools?.map((tool) => tool.name), revealedSourceIDs: [...revealed], assets: job.assets, forbiddenPaths: blockedPaths() })
  // Engine pre-model hook: ClaudeCode.turn runs PromptGuard.check once per SessionPrompt turn, before it spawns the SDK.
  const guard = Effect.gen(function* () {
    yield* Effect.promise(verifyInputs)
    const bound = yield* services.sessions.get(session.id)
    const archie = yield* services.agents.get("archie")
    const canonicalProposal = yield* Effect.promise(() => realpath(proposal).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return (await realpath(dirname(proposal))) + "/proposal.md"
    }))
    fact(canonicalProposal === proposal && JSON.stringify(WriteRoots.read(bound.permission)) === JSON.stringify([proposal]), "PAIR_CHILD_WRITE_ROOT_CHANGED")
    fact(archie.native === true && archie.engine === job.claude.engine && bound.agent === "archie" && !bound.parentID && bound.directory === project && bound.projectID === session.projectID, "PAIR_SAME_CHILD_BINDING_MISMATCH")
    fact(Permission.evaluate("edit", pattern, archie.permission, bound.permission ?? []).action === "allow"
      && Permission.evaluate("edit", relative(placement.worktree, join(project, "global.txt")), archie.permission, bound.permission ?? []).action === "deny"
      && Permission.evaluate("bash", "*", archie.permission, bound.permission ?? []).action === "deny"
      && Permission.evaluate("task", "archie", archie.permission, bound.permission ?? []).action === "deny"
      && Permission.evaluate("read", relative(placement.worktree, join(project, "global.txt")), archie.permission, bound.permission ?? []).action === "allow"
      && Permission.evaluate("read", relative(placement.worktree, job.packet.packetPath), archie.permission, bound.permission ?? []).action === "deny", "PAIR_CHILD_SCOPE_INVALID")
    // ClaudeCode.turn builds its Orchestra tool view from the registry before this hook; the registry wrapper captured it.
    fact(state.tools, "PAIR_ENGINE_TOOL_SURFACE_NOT_OBSERVED")
    const inventory = yield* Effect.promise(() => boundary(bound, state.tools.map((tool) => tool.name)))
    const history = yield* services.sessions.messages({ sessionID: session.id })
    fact(job.preflightOnly || history.findLast((message) => message.info.role === "user")?.info.id === state.promptID, "PAIR_PROVIDER_TURN_MESSAGE_UNBOUND")
    // Model-bound input of the first provider turn: stored history with this prompt, the agent prompt and the tool view.
    requireSecretFree({ history, tools: state.tools, agentPrompt: archie.prompt }, secrets, decodeJson)
    state.checks++
    yield* Effect.promise(() => record("pre-model-boundary.json", { hook: "PromptGuard.check in ClaudeCode.turn before SDK spawn", sessionID: session.id, promptMessageID: state.promptID ?? null, inventory }))
  }).pipe(Effect.tapCause((cause) => Effect.sync(() => { state.violation ??= pairCode(cause) })), Effect.provideService(InstanceRef, placement))
  const tools = services.registry.tools
  services.registry.tools = (input) => tools(input).pipe(Effect.tap((defs) => Effect.sync(() => {
    // The same filter ClaudeCode.turn applies before handing Orchestra tools to the SDK's in-process MCP server.
    if (input.agent.id === "archie") state.tools = defs.filter((def) => ClaudeCodeTools.IDS.includes(def.id)).map((def) => ({ name: def.id, description: def.description, schema: ToolJsonSchema.fromTool(def) }))
  })))
  // SDK provider turns run inside the Claude Code process, so LLM.stream never sees them. The mirror opens one Orchestra
  // assistant message per Claude API message, before any of its parts or tool calls, so each provider turn is checked here.
  const updateMessage = services.sessions.updateMessage
  const opened = new Set<string>()
  services.sessions.updateMessage = (message) => Effect.gen(function* () {
    if (message.role !== "assistant" || message.sessionID !== session.id || opened.has(message.id) || state.violation) return yield* updateMessage(message)
    opened.add(message.id)
    yield* Effect.gen(function* () {
      fact(state.checks > 0 && state.promptID && message.parentID === state.promptID, "PAIR_PROVIDER_TURN_MESSAGE_UNBOUND")
      fact(state.tools, "PAIR_ENGINE_TOOL_SURFACE_NOT_OBSERVED")
      const bound = yield* services.sessions.get(session.id)
      const inventory = yield* Effect.promise(() => boundary(bound, state.tools.map((tool) => tool.name)))
      requireSecretFree({ history: yield* services.sessions.messages({ sessionID: session.id }), tools: state.tools }, secrets, decodeJson)
      state.turns++
      yield* Effect.promise(() => record("provider-boundary-" + state.turns + ".json", { hook: "Session.updateMessage on claude-code mirror step open", assistantMessageID: message.id, inventory }))
    }).pipe(Effect.tapCause((cause) => Effect.sync(() => { state.violation ??= pairCode(cause) })))
    return yield* updateMessage(message)
  }).pipe(Effect.provideService(InstanceRef, placement))
  try {
    if (job.preflightOnly) {
      // Presence only: no -w, so the Keychain secret is never read here; sdk.ts reads it when a turn spawns.
      const { ClaudeCodeSDK } = await import(job.candidate + "/packages/orchestra/src/claude-code/sdk.ts")
      const keychain = Bun.spawnSync(["security", "find-generic-password", "-a", process.env.USER ?? "", "-s", ClaudeCodeSDK.credentialStorage(process.env, process.env.HOME ?? "").service], { env: process.env, stdout: "ignore", stderr: "ignore" })
      fact(keychain.exitCode === 0, "PAIR_CLAUDE_CODE_KEYCHAIN_LOGIN_MISSING")
      // The exact pre-model guard over stage 1's grants, run once without a model on the tool view the engine builds.
      const bound = await run(services.sessions.get(session.id))
      await run(services.registry.tools({ ...Provider.parseModel(model), agent: services.archie, permission: bound.permission }))
      await run(guard)
      fact(!state.violation && state.checks === 1, state.violation ?? "PAIR_PREFLIGHT_GUARD_NOT_OBSERVED")
      continue
    }
    for (const [index, stage] of job.packet.stages.entries()) {
      requireArmTime(timing)
      await verifyInputs()
      state.index = index; state.calls = 0; state.checks = 0; state.turns = 0; state.result = undefined; state.tools = undefined; state.promptID = MessageID.ascending()
      const stageRoot = join(root, "stage-" + (index + 1))
      await mkdir(stageRoot, { mode: 0o700 })
      const reveal = arm === "E" && index === 0 ? job.packet.sources : arm === "P" ? job.packet.sources.filter((item) => stage.sourceIDs.includes(item.id) && !revealed.has(item.id)) : []
      await Promise.all(reveal.map(async (item) => {
        await writeFile(join(project, item.file), item.text, { flag: "wx", mode: 0o400 })
        revealed.add(item.id)
      }))
      // Stage-gated grants: bind exactly this stage's cumulative reads before its prompt; ClaudeCode.turn fixes its
      // ruleset and tool view from the stored Session at turn start.
      const current = await run(services.sessions.get(session.id))
      await run(services.sessions.setPermission({ sessionID: session.id, permission: [...(current.permission ?? []).filter((rule) => rule.permission === "tool_safety_write_root"),
        ...boundaryRules(placement.worktree, project, localFiles(), job.assets), { permission: "edit", pattern, action: "allow" }] }))
      const context = index === 0 ? "GLOBAL OBLIGATIONS (complete):\\n" + job.packet.global.text + "\\n\\n" : ""
      const sources = reveal.map((item) => "SOURCE " + JSON.stringify(item.id) + " [" + item.file + "]:\\n" + item.text).join("\\n\\n")
      // Request bytes are appended without trimming. Context differs only by scheduled source revelation.
      state.prompt = "Proposal-only native authoring. Write only proposal.md. No child dispatch, implementation, workflow execution, approval or publication. Return native upstream-result card.\\n\\n"
        + context + sources + "\\n\\nSTAGE REQUEST (exact UTF-8 bytes):\\n" + stage.request.text
      requireSecretFree(state.prompt, secrets, decodeJson)
      emit({ type: "pair_stage_start", arm, index, id: stage.id, requestSha256: stage.request.sha256, assignmentSha256: digest(Buffer.from(state.prompt)), revealedSourceIDs: [...revealed] })
      state.calls++
      // Real SessionPrompt path on the same Session: stage N+1 resumes stage N's Claude Code session.
      const returned = await run(PromptGuard.provide(services.prompts.prompt({ sessionID: session.id, messageID: state.promptID, agent: "archie", model: Provider.parseModel(model),
        parts: [{ type: "text", text: state.prompt }] }), session.id, guard))
      await save(join(stageRoot, "assistant-return.json"), returned)
      fact(!state.violation, state.violation)
      requireArmTime(timing)
      fact(returned.info.role === "assistant" && returned.info.agent === "archie" && returned.info.parentID === state.promptID && !returned.info.error, "PAIR_STAGE_NATIVE_EXECUTION_INCOMPLETE")
      // The native work-result assembler Task uses; it parses the upstream card from the returned assistant.
      const work = BackendResult.assemble(returned, await run(services.sessions.messages({ sessionID: session.id })), Seats.find("archie"))
      await save(join(stageRoot, "work-result.json"), work)
      await requireSuccessfulAuthoring(job.candidate, work, returned, proposal, base)
      state.result = work
      requireStageObserved(state)
      const claudeSessionID = (await run(services.sessions.get(session.id))).metadata?.claudeCode?.sessionId
      fact(typeof claudeSessionID === "string" && claudeSessionID.length > 0 && (!state.claudeSessionID || state.claudeSessionID === claudeSessionID), "PAIR_SAME_SESSION_RESUME_NOT_OBSERVED")
      state.claudeSessionID = claudeSessionID
      const inputHashes = await verifyInputs()
      const bytes = await Bun.file(proposal).bytes()
      fact(bytes.length > 0 && (await realpath(proposal)) === proposal, "PAIR_PROPOSAL_MISSING_OR_ALIAS")
      fact(!secrets.some((secret) => Buffer.from(bytes).includes(Buffer.from(secret))), "PAIR_PROPOSAL_SECRET_BEARING")
      await writeFile(join(stageRoot, "proposal.md"), bytes, { flag: "wx", mode: 0o600 })
      await save(join(stageRoot, "native.json"), { arm, index, id: stage.id, dispatch: "direct-archie", parentSessionID: null, sessionID: session.id, promptMessageID: state.promptID, claudeSessionID,
        worktree: placement.worktree, workResult: work, returned, proposalSha256: digest(bytes), proposalBytes: bytes.length, timing,
        requestSha256: stage.request.sha256, assignment: state.prompt, assignmentSha256: digest(Buffer.from(state.prompt)), revealedSourceIDs: [...revealed], inputHashes, checks: state.checks, turns: state.turns, dispatchBase: base })
      emit({ type: "pair_stage_end", arm, index, sessionID: session.id, claudeSessionID })
    }
  } finally {
    services.registry.tools = tools; services.sessions.updateMessage = updateMessage
    if (!job.preflightOnly) await save(join(root, "arm-timing.json"), { ...timing, endedAt: Date.now(), elapsedMs: Date.now() - timing.startedAt })
  }
}
} finally { await AppRuntime.dispose() }
} catch (error) {
  emit({ type: "pair_failure", code: pairCode(error), diagnostic: redact(String(error)) })
  process.exitCode = 1
} finally {
  await processRuntime.dispose()
  Object.assign(sharedSpawner, originalSpawner)
  await spawnerRuntime.dispose()
}
process.exit(process.exitCode ?? 0)
`
}

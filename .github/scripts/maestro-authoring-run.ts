#!/usr/bin/env bun
import { Database } from "bun:sqlite"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { userInfo } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
// Owner-run native Archie authoring on the Claude Code engine. The host creates the archie Session directly (no Maestro
// parent, model turn or Task call) with exact read grants and a proposal.md-only write, runs the PromptGuard pre-model
// check, then verifies the persisted Session and the project tree before writing the report.
const runtimeAbi = { memberID: "archie", profile: "upstream", predecessorDriver: "ae927567aa4deefcbb933be27b257e6430e1eff5" }
const inventoryDigest = "80bdd0f9e2cb3195fbdc64ad7d1e8fb1d2e06bb55ceabcb213e28e4bed4ae465"
// Current runtime ABI observations are separate from the frozen historical packet's source/blob identities.
const sourcePaths = ["agent/agent.ts", "agent/subagent-permissions.ts", "tool/task.ts", "tool/registry.ts", "maestro/seats/archie.ts", "maestro/seats/index.ts", "maestro/roster.ts",
  "maestro/write-roots.ts", "maestro/logical-task.ts", "maestro/backend-work.ts", "maestro/backend-result.ts", "tool/task-background.ts",
  "session/prompt-guard.ts", "session/task-prompt-ops.ts", "effect/app-runtime.ts", "cli/cmd/run.ts"]
// A large revision on Opus plus a cold Instance boot can pass ten minutes; measured 2026-10-11.
const deadline = 20 * 60_000
class AuthoringError extends Error {}
function requireAuthoring(value: unknown, code: string): asserts value { if (!value) throw new AuthoringError(code) }
function decode<S extends { readonly Type: unknown }>(schema: S, value: unknown, code: string): S["Type"] {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  requireAuthoring(Option.isSome(decoded), code)
  return decoded.value
}
const json = (text: string) => decode(Schema.UnknownFromJsonString, text, "AUTHORING_JSON_INVALID")
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const blob = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
const inside = (path: string, root: string) => path === root || path.startsWith(`${root}/`)
// Resolve the candidate package's installed Effect before any schema decoding; no root dependency assumption.
const bootstrap = await (async () => {
  const args = parseArgs({ args: Bun.argv.slice(2), strict: true, allowPositionals: false, options: {
    candidate: { type: "string" }, pilot: { type: "string" },
    "inventory-digest": { type: "string" }, "archie-engine": { type: "string" }, "archie-model": { type: "string" },
    // Accepted no-op: direct dispatch is the only path.
    direct: { type: "boolean" }, "prepare-only": { type: "boolean" }, "preflight-only": { type: "boolean" }, run: { type: "boolean" },
  } }).values
  requireAuthoring(args["inventory-digest"] === undefined || /^[a-f0-9]{64}$/.test(args["inventory-digest"]), "AUTHORING_INVENTORY_DIGEST_INVALID")
  const candidate = await canonical(args.candidate, true)
  const effect = await import(createRequire(join(candidate, "apps/orchestra/package.json")).resolve("effect"))
  return { args, candidate, effect }
})().catch((error: unknown) => { console.error(error instanceof AuthoringError ? error.message : "AUTHORING_CANDIDATE_EFFECT_BOOTSTRAP_FAILED"); process.exit(1) })
const { Option, Schema } = bootstrap.effect
await main().catch((error: unknown) => {
  console.error(error instanceof AuthoringError ? error.message : "AUTHORING_IO_OR_DEPENDENCY_UNAVAILABLE")
  process.exitCode = 1
})
async function main() {
  requireAuthoring(process.getuid && constants.O_NOFOLLOW, "AUTHORING_PRIVATE_FILE_HOST_UNSUPPORTED")
  const args = bootstrap.args
  const expectedInventoryDigest = args["inventory-digest"] ?? inventoryDigest
  requireAuthoring([args.run, args["prepare-only"], args["preflight-only"]].filter(Boolean).length <= 1, "AUTHORING_MODE_CONFLICT")
  // Archie runs on the Claude Code engine with the machine's Claude Code login; no parent model turn exists.
  requireAuthoring(args["archie-engine"] === "claude-code", "AUTHORING_ENGINE_FLAGS_INVALID")
  const model = args["archie-model"]
  requireAuthoring(model && /^anthropic\/[A-Za-z0-9._-]{1,128}$/.test(model), "AUTHORING_MODEL_INVALID")
  const claude = { engine: "claude-code", archieModel: model, credentialKind: "claude-code-keychain-oauth" }
  const candidate = bootstrap.candidate
  const pilot = await canonical(args.pilot, true)
  const project = await canonical(join(pilot, "project"), true)
  requireAuthoring(!inside(pilot, candidate) && !inside(candidate, pilot), "AUTHORING_CANDIDATE_FIXTURE_OVERLAP")
  const nativeSourceHashes = await Promise.all([...sourcePaths, "claude-code/engine.ts", "claude-code/sdk.ts"].map(async (file) => ({ file,
    sha256: sha256(await read(await canonical(join(candidate, "apps/orchestra/src", file), false))) })))
  const head = await gitHead(candidate)
  requireAuthoring(/^[a-f0-9]{40}$/.test(head), "AUTHORING_CANDIDATE_HEAD_INVALID")
  const packet = dirname(pilot)
  const domainBytes = await read(await canonical(join(packet, "DOMAIN-SOURCE.json"), false))
  const parsedDomain = decode(Schema.Record(Schema.String, Schema.Unknown), json(Buffer.from(domainBytes).toString("utf8")), "AUTHORING_DOMAIN_NOT_OBJECT")
  const domain = decode(Schema.Struct({ nativeAssignmentBoundary: Schema.Struct({ projectRoot: Schema.String, soleProjectWrite: Schema.Literal("proposal.md") }),
    inventoryDigest: Schema.Struct({ utf8ByteLength: Schema.Int, sha256: Schema.String }),
    artifacts: Schema.Array(Schema.Struct({ id: Schema.String, role: Schema.String, path: Schema.String, regularFile: Schema.Literal(true), utf8ByteLength: Schema.Int,
      sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)), baselineGitBlobSha1: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/))), matchesBaselineBlob: Schema.optional(Schema.Literal(true)) })) }), parsedDomain, "AUTHORING_DOMAIN_INVENTORY_INVALID")
  // Artifacts contain scalar fields only. Preserve all fields, sorted keys, array order, UTF-8, and no LF.
  const originalArtifacts = decode(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)), parsedDomain.artifacts, "AUTHORING_ORIGINAL_ARTIFACTS_INVALID")
  const canonicalInventory = Buffer.from(JSON.stringify(originalArtifacts.map((item) => Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)))))
  requireAuthoring(domain.inventoryDigest.sha256 === expectedInventoryDigest && sha256(canonicalInventory) === expectedInventoryDigest && canonicalInventory.length === domain.inventoryDigest.utf8ByteLength, "AUTHORING_INVENTORY_DIGEST_MISMATCH")
  requireAuthoring(domain.nativeAssignmentBoundary.projectRoot === project && domain.artifacts.length > 0 && domain.artifacts.length <= 128 && new Set(domain.artifacts.map((item) => item.id)).size === domain.artifacts.length, "AUTHORING_DOMAIN_BOUNDARY_OR_MEMBERSHIP_INVALID")
  const inventory = await Promise.all(domain.artifacts.map(async (item) => {
    requireAuthoring(/^[a-f0-9]{64}$/.test(item.sha256) && item.utf8ByteLength >= 0, "AUTHORING_DOMAIN_DIGEST_INVALID")
    const bytes = await read(await canonical(item.path, false))
    requireAuthoring(bytes.length === item.utf8ByteLength && sha256(bytes) === item.sha256 && Buffer.from(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).equals(bytes), "AUTHORING_DOMAIN_BYTES_CHANGED")
    requireAuthoring(!item.baselineGitBlobSha1 || (item.matchesBaselineBlob === true && blob(bytes) === item.baselineGitBlobSha1), "AUTHORING_BASELINE_ARTIFACT_BLOB_MISMATCH")
    return { ...item, bytes }
  }))
  const demand = inventory.find((item) => item.id === "fresh-demand")
  const handoff = inventory.find((item) => item.id === "fresh-handoff")
  requireAuthoring(demand?.path === join(pilot, "demand.txt") && handoff, "AUTHORING_OPERATIVE_INPUT_MISSING")
  if (args["inventory-digest"] !== undefined) {
    requireAuthoring(originalArtifacts.every((item) => Object.values(item).every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))), "AUTHORING_INVENTORY_NON_SCALAR_FIELD")
    requireAuthoring(demand.bytes.length > 0 && handoff.bytes.length > 0 && demand.path !== handoff.path && inventory.every((item) => item.path !== join(project, "proposal.md")), "AUTHORING_REVISION_INPUT_OR_WRITE_BOUNDARY_INVALID")
  }
  const instructionsInput = inventory.find((item) => item.path === join(packet, "AUTHORING-RUN-INPUT.md"))
  requireAuthoring(args["inventory-digest"] === undefined || instructionsInput, "AUTHORING_PINNED_RUN_INPUT_MISSING")
  // Reuse the checked snapshot; a second read could disagree with its inventory during a change-and-restore race.
  const instructions = instructionsInput?.bytes ?? await read(await canonical(join(packet, "AUTHORING-RUN-INPUT.md"), false))
  requireAuthoring(instructions.length > 0, "AUTHORING_RUN_INPUT_EMPTY")
  requireAuthoring(await lstat(join(project, "proposal.md")).then(() => false, (error: NodeJS.ErrnoException) => error.code === "ENOENT"), "AUTHORING_ORIGINAL_PROPOSAL_ALREADY_EXISTS")
  process.umask(0o077)
  const runtime = await mkdtemp(join(pilot, "ordinary-authoring-"))
  const env: Record<string, string> = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(runtime, key.toLowerCase())]))
  await Promise.all(Object.values(env).map((path) => mkdir(path, { mode: 0o700 })))
  Object.assign(env, { ORCHESTRA_DB: join(runtime, "session.db"), ORCHESTRA_CONFIG: join(runtime, "config.json"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_TEST_HOME: env.HOME, TMP: env.TMPDIR, TEMP: env.TMPDIR })
  // `security` finds the login Keychain through $HOME and sdk.ts names the item's account from $USER (Bun reports
  // "unknown" without it), so ClaudeCodeSDK needs both real values. Orchestra state stays isolated (ORCHESTRA_TEST_HOME,
  // XDG_*), Claude Code state goes to CLAUDE_CONFIG_DIR, and the empty secure-storage directory keeps sdk.ts on the
  // unsuffixed "Claude Code-credentials" item. Side effect: "~" in permission patterns means the real home.
  Object.assign(env, { HOME: userInfo().homedir, USER: userInfo().username, CLAUDE_CONFIG_DIR: join(runtime, "claude"), CLAUDE_SECURESTORAGE_CONFIG_DIR: "" })
  await mkdir(env.CLAUDE_CONFIG_DIR, { mode: 0o700 })
  const maestroConfig = { permission: { "*": "deny", task: { "*": "deny", archie: "allow" } } }
  await writeFile(env.ORCHESTRA_CONFIG, JSON.stringify({ model: claude.archieModel, default_agent: "maestro",
    agent: { maestro: maestroConfig, archie: { engine: claude.engine, model: claude.archieModel } } }) + "\n", { flag: "wx", mode: 0o600 })
  // Render one exact assignment string without the source file's final LF; original input hashes remain byte-exact.
  const assignment = `Ordinary proposal-only authoring. Write only proposal.md. No implementation, tests, builds, publication, child dispatch, approval or workflow execution. Return the existing native upstream-result card.\n\nFULL OWNER DEMAND:\n${Buffer.from(demand.bytes).toString("utf8")}\n\nPINNED SCOPE HANDOFF:\n${Buffer.from(handoff.bytes).toString("utf8")}`.trimEnd()
  const job = { candidate, project, model, assignment, preflightOnly: Boolean(args["preflight-only"]), readPaths: inventory.map((item) => item.path), hiddenPath: join(packet, "DOMAIN-RUBRIC-PRIVATE.md") }
  const report = { schema: 1, runtime, candidate, head, project, model, nativeSourceHashes, runtimeAbi, ...claude,
    dispatch: "direct-archie", parentSession: null,
    scope: "Proves native Archie authoring on the Claude Code engine. It is not a Maestro-to-Task chain: no Maestro Session, model turn, Task call or logical-task binding exists.",
    taskSpawn: "not-used: Task.execute requires an existing Maestro assistant message (tool/task.ts MessageV2.get(ctx.messageID), role assistant); none is fabricated",
    notApplicable: ["single-task-call", "task-request-scope", "maestro-parent-session", "parent-pre-model-guard", "parent-model", "task-db-row", "logical-task-binding"],
    inventoryDigest: expectedInventoryDigest,
    inventoryDigestSelection: args["inventory-digest"] === undefined ? "historical-default" : "explicit-packet",
    packetPointer: join(packet, "DOMAIN-SOURCE.json"), packetSha256: sha256(domainBytes), runInputSha256: sha256(instructions),
    inventory: inventory.map(({ bytes, ...item }) => item), assignmentSha256: sha256(Buffer.from(assignment)), deadlineMs: deadline, stdoutBytes: 32 * 1024 * 1024, semanticJudgment: "not-performed" }
  await writeFile(join(runtime, "prepared.json"), JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 })
  if (!args.run && !args["preflight-only"]) { console.log(JSON.stringify({ code: "AUTHORING_PREPARED", runtime, head, dispatch: "direct-archie", ...claude })); return }
  const entry = join(runtime, "initializer.ts")
  const program = initializer(job)
  await writeFile(entry, program, { flag: "wx", mode: 0o600 })
  try { new Bun.Transpiler({ loader: "ts" }).transformSync(program) } catch {
    await writeFile(join(runtime, "status.txt"), "AUTHORING_INITIALIZER_PARSE_FAILED", { flag: "wx", mode: 0o600 })
    throw new AuthoringError("AUTHORING_INITIALIZER_PARSE_FAILED")
  }
  // Proves proposal.md is the only project write by comparing the whole project tree around the run.
  const projectTree = async () => Object.fromEntries(await Promise.all((await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: project, dot: true, onlyFiles: true }))).sort()
    .map(async (file) => [file, sha256(await read(join(project, file)))] as const)))
  const treeBefore = args.run ? await projectTree() : undefined
  // Initializer derives the proposal write root from its real Instance. Stdin carries only this exact assignment and EOF.
  const output = await launch(entry, candidate, { ...env, PATH: process.env.PATH }, assignment, job.preflightOnly ? 30_000 : deadline)
  await writeFile(join(runtime, "launcher.json"), JSON.stringify(output.launcher) + "\n", { flag: "wx", mode: 0o600 })
  const stages = output.text.split("\n").flatMap((line) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
    if (Option.isNone(parsed)) return []
    const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("authoring_stage"), stage: Schema.Literals(["initializer", "spawner", "consumers", "app_runtime", "instance", "native_registry", "scope_preflight", "child_pre_model", "direct_turn", "dispose"]), phase: Schema.Literals(["before", "after", "failed"]), timestamp: Schema.Int, code: Schema.optional(Schema.String.check(Schema.isPattern(/^AUTHORING_[A-Z_]+$/))) }))(parsed.value)
    return Option.isSome(event) ? [event.value] : []
  })
  await writeFile(join(runtime, "stages.jsonl"), stages.map((item) => JSON.stringify(item)).join("\n") + "\n", { flag: "wx", mode: 0o600 })
  const records = output.text.split("\n").flatMap<{ type: string; sessionID: string; projectID?: string; worktree?: string; timestamp?: number; workResult?: unknown }>((line) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
    if (Option.isNone(parsed)) return []
    const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.String }))(parsed.value)
    if (Option.isNone(event)) return []
    if (event.value.type === "authoring_direct_result") return [decode(Schema.Struct({ type: Schema.String, sessionID: Schema.String, workResult: Schema.Unknown }), parsed.value, "AUTHORING_DIRECT_RESULT_RECORD_INVALID")]
    if (event.value.type === "authoring_native_preflight") return [decode(Schema.Struct({ type: Schema.String, sessionID: Schema.String, projectID: Schema.String, worktree: Schema.String }), parsed.value, "AUTHORING_PREFLIGHT_RECORD_INVALID")]
    const header = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literals(["tool_use", "step_start", "step_finish", "text", "error", "retry"]), sessionID: Schema.String, timestamp: Schema.Number }))(parsed.value)
    return Option.isSome(header) ? [header.value] : []
  })
  await writeFile(join(runtime, "events.jsonl"), records.map((item) => JSON.stringify(item)).join("\n") + "\n", { flag: "wx", mode: 0o600 })
  await writeFile(join(runtime, "status.txt"), output.code ?? "AUTHORING_CHILD_COMPLETED", { flag: "wx", mode: 0o600 })
  if (output.code) await writeFile(join(runtime, "diagnostic.txt"), output.stderr, { flag: "wx", mode: 0o600 })
  requireAuthoring(!output.code, output.code ?? "AUTHORING_CHILD_FAILED_STDERR_WITHHELD")
  if (args["preflight-only"]) { console.log(JSON.stringify({ code: "AUTHORING_NATIVE_PREFLIGHT_COMPLETED_NO_MODEL", runtime, ...claude })); return }
  const preflight = records.filter((item) => item.type === "authoring_native_preflight")
  requireAuthoring(preflight.length === 1, "AUTHORING_NATIVE_PREFLIGHT_NOT_OBSERVED")
  requireAuthoring(preflight[0].worktree, "AUTHORING_ACTUAL_WORKTREE_NOT_OBSERVED")
  const directResults = records.filter((item) => item.type === "authoring_direct_result")
  requireAuthoring(directResults.length === 1 && directResults[0].sessionID === preflight[0].sessionID, "AUTHORING_DIRECT_RESULT_NOT_OBSERVED")
  const evidence = await verifyDirect(env.ORCHESTRA_DB, preflight[0].sessionID, project, model, assignment, preflight[0].worktree, candidate, directResults[0].workResult)
  if (treeBefore) {
    const treeAfter = await projectTree()
    requireAuthoring(!Object.hasOwn(treeBefore, "proposal.md") && Object.hasOwn(treeAfter, "proposal.md") && JSON.stringify(Object.entries(treeAfter).filter(([file]) => file !== "proposal.md")) === JSON.stringify(Object.entries(treeBefore)), "AUTHORING_DIRECT_PROJECT_WRITE_OUTSIDE_PROPOSAL")
  }
  const result = evidence.provenance
  const proposal = await read(await canonical(join(project, "proposal.md"), false))
  const returnedCard = Buffer.from(evidence.returnedText)
  requireAuthoring(proposal.length > 0 && returnedCard.length > 0, "AUTHORING_ORIGINAL_OUTPUT_EMPTY")
  const returnedCardPath = join(runtime, "returned-assistant.txt")
  await writeFile(returnedCardPath, returnedCard, { flag: "wx", mode: 0o600 })
  await Promise.all(inventory.map(async (item) => requireAuthoring(sha256(await read(item.path)) === item.sha256, "AUTHORING_FROZEN_INPUT_CHANGED_DURING_RUN")))
  requireAuthoring(await gitHead(candidate) === head, "AUTHORING_CANDIDATE_CHANGED_DURING_RUN")
  const receipt = { ...report, ...result, stepUsage: evidence.stepUsage, proposalPath: join(project, "proposal.md"), proposalBytes: proposal.length, proposalSha256: sha256(proposal), returnedCardPath, returnedCardBytes: returnedCard.length, returnedCardSha256: sha256(returnedCard) }
  await writeFile(join(runtime, "report.json"), JSON.stringify(receipt) + "\n", { flag: "wx", mode: 0o600 })
  console.log(JSON.stringify({ code: "AUTHORING_RETURN_OBSERVED_NOT_DOMAIN_JUDGMENT", runtime, ...result, proposalSha256: receipt.proposalSha256 }))
}
async function canonical(value: string | undefined, directory: boolean) {
  requireAuthoring(value && isAbsolute(value) && !value.split(/[\\/]/).includes(".."), "AUTHORING_PATH_INVALID")
  const path = resolve(value)
  requireAuthoring(await realpath(path) === path, "AUTHORING_PATH_ALIAS_UNSUPPORTED")
  const info = await lstat(path)
  requireAuthoring((directory ? info.isDirectory() : info.isFile()) && info.uid === process.getuid?.() && !(info.mode & 0o022), "AUTHORING_PATH_NOT_OWNED_OR_REGULAR")
  return path
}
async function read(path: string, privateMode = false) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    requireAuthoring(before.isFile() && before.uid === process.getuid?.() && !(before.mode & (privateMode ? 0o077 : 0o022)) && before.size <= 1024 * 1024, "AUTHORING_PRIVATE_FILE_OR_SIZE_INVALID")
    const bytes = await handle.readFile()
    const after = await handle.stat()
    requireAuthoring(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, "AUTHORING_INPUT_CHANGED_DURING_READ")
    return bytes
  } finally { await handle.close() }
}
async function gitHead(candidate: string) {
  const child = Bun.spawn(["git", "--no-optional-locks", "-C", candidate, "rev-parse", "HEAD"], { env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "ignore" })
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
  const output = await Promise.all([child.exited, new Response(child.stdout).text()]).finally(() => clearTimeout(timer))
  requireAuthoring(output[0] === 0, "AUTHORING_CANDIDATE_GIT_UNAVAILABLE")
  return output[1].trim()
}
async function launch(entry: string, candidate: string, env: Record<string, string | undefined>, prompt: string, budget: number) {
  requireAuthoring(["darwin", "linux"].includes(process.platform), "AUTHORING_OWNED_GROUP_HOST_UNSUPPORTED")
  const state: { bytes: number; failure?: string; cleanupFailure?: string; groupGone?: boolean; primaryGone?: boolean; stopping?: Promise<void>; stopDone?: () => void; exitObserved: boolean; closeObserved: boolean; status?: number | null; signal?: string | null; endedAt?: number; identity?: { pid: number; ppid: number; pgid: number; osStart: string }; admittedAlive?: boolean } = { bytes: 0, exitObserved: false, closeObserved: false }
  const startedAt = Date.now()
  const stopped = new Promise<void>((done) => { state.stopDone = done })
  const child = spawn(process.execPath, [entry], { cwd: join(candidate, "apps/orchestra"), env, detached: true, stdio: "pipe" })
  const exited = new Promise<number | null>((done) => {
    child.once("exit", (status, signal) => { state.exitObserved = true; state.status = status; state.signal = signal; state.endedAt = Date.now(); done(status) })
    child.once("close", (status, signal) => { state.closeObserved = true; state.status ??= status; state.signal ??= signal; state.endedAt ??= Date.now(); done(status) })
    child.once("error", () => { state.failure = "AUTHORING_CHILD_SPAWN_FAILED"; done(null) })
  })
  const chunks: Uint8Array[] = []
  const diagnostics: Uint8Array[] = []
  const observeIdentity = () => {
    requireAuthoring(child.pid, "AUTHORING_PRIMARY_PID_UNAVAILABLE")
    const text = execFileSync("/bin/ps", ["-p", String(child.pid), "-o", "pid=", "-o", "ppid=", "-o", "pgid=", "-o", "lstart="], { encoding: "utf8", timeout: 1_000, stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH, LC_ALL: "C" } })
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(text)
    requireAuthoring(match && Number(match[1]) === child.pid && Number(match[2]) === process.pid && Number(match[3]) === child.pid, "AUTHORING_PRIMARY_GROUP_IDENTITY_MISMATCH")
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), osStart: match[4] }
  }
  const primaryAlive = () => {
    if (!child.pid || state.primaryGone) return false
    try { process.kill(child.pid, 0); return true } catch (error) {
      requireAuthoring(error instanceof Error && "code" in error && error.code === "ESRCH", "AUTHORING_PRIMARY_INSPECTION_FAILED")
      state.primaryGone = true; return false
    }
  }
  const groupAlive = () => {
    if (!child.pid || state.groupGone) return false
    try { process.kill(-child.pid, 0); return true } catch (error) {
      requireAuthoring(error instanceof Error && "code" in error && error.code === "ESRCH", "AUTHORING_OWNED_GROUP_INSPECTION_FAILED")
      state.groupGone = true; return false
    }
  }
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child.pid || !groupAlive()) return
    try { process.kill(-child.pid, signal) } catch (error) {
      requireAuthoring(error instanceof Error && "code" in error && error.code === "ESRCH", "AUTHORING_OWNED_GROUP_SIGNAL_FAILED")
      state.groupGone = true
    }
  }
  const stop = () => (state.stopping ??= (async () => {
    child.stdin.destroy()
    const waitGroup = async (milliseconds: number) => {
      const until = Date.now() + milliseconds
      while (groupAlive() && Date.now() < until) await Bun.sleep(50)
    }
    if (groupAlive()) { signalGroup("SIGTERM"); await waitGroup(3_000) }
    if (groupAlive()) { signalGroup("SIGKILL"); await waitGroup(3_000) }
    const until = Date.now() + 500
    while ((!state.exitObserved && !state.closeObserved) && Date.now() < until) await Bun.sleep(25)
    requireAuthoring(!groupAlive() && !primaryAlive() && (state.exitObserved || state.closeObserved || !child.pid), "AUTHORING_OWNED_GROUP_CLEANUP_FAILED")
  })())
  const requestStop = () => { void stop().then(() => state.stopDone?.(), () => state.stopDone?.()) } // Finalizer surfaces failure.
  const abort = () => { state.failure = "AUTHORING_INTERRUPTED"; requestStop() }
  process.once("SIGINT", abort); process.once("SIGTERM", abort)
  child.stdin.once("error", () => { state.failure ??= "AUTHORING_STDIN_FAILED"; requestStop() })
  // Reserve graceful/escalation time inside the ten-minute total budget.
  const timer = setTimeout(() => { state.failure = "AUTHORING_DEADLINE"; requestStop() }, Math.max(0, budget - 8_000 - (Date.now() - startedAt)))
  const drains = [child.stdout, child.stderr].map(async (stream, index) => {
    for await (const part of stream) {
      const bytes = Buffer.from(part)
      state.bytes += bytes.length
      if (state.bytes > 32 * 1024 * 1024) { state.failure = "AUTHORING_OUTPUT_LIMIT"; requestStop(); return }
      if (index === 0) chunks.push(bytes)
      if (index === 1) diagnostics.push(bytes)
    }
  })
  const drained = Promise.all(drains).catch(() => { state.failure ??= "AUTHORING_STREAM_FAILED"; requestStop() })
  try {
    state.identity = observeIdentity()
    state.admittedAlive = primaryAlive() // Positive control: this exact spawn PID was visible before admission.
    requireAuthoring(state.admittedAlive, "AUTHORING_PRIMARY_NOT_LIVE_AT_ADMISSION")
    child.stdin.end(prompt)
    const status = await Promise.race([exited, stopped.then(() => null)])
    state.failure ??= status === 0 ? undefined : "AUTHORING_CHILD_FAILED_STDERR_WITHHELD"
  } catch (error) {
    state.failure ??= error instanceof AuthoringError ? error.message : "AUTHORING_LAUNCHER_OR_IDENTITY_FAILED"
  } finally {
    clearTimeout(timer)
    try { await stop() } catch {
      state.cleanupFailure = "AUTHORING_OWNED_GROUP_CLEANUP_FAILED"
      try {
        if (!state.exitObserved && !state.closeObserved && state.identity && primaryAlive()) {
          requireAuthoring(JSON.stringify(observeIdentity()) === JSON.stringify(state.identity), "AUTHORING_PRIMARY_IDENTITY_CHANGED"); child.kill("SIGKILL")
        }
      } catch { state.cleanupFailure = "AUTHORING_OWNED_GROUP_CLEANUP_FAILED_PRIMARY_UNVERIFIED" }
    }
    await Promise.race([drained, Bun.sleep(500)])
    child.stdout.destroy(); child.stderr.destroy(); process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort)
  }
  const code = [state.failure, state.cleanupFailure].filter(Boolean).join("; ") || undefined
  // Always return bounded evidence, including cleanup failure; main persists it before raising the named failure.
  return { text: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(diagnostics).toString("utf8"), code,
    launcher: { primaryPid: child.pid ?? null, ownedGroupId: state.identity?.pgid ?? null, signalGroupTarget: child.pid ?? null, groupCreation: "detached-owned-spawn", startedAt, endedAt: state.endedAt ?? null, observationAt: Date.now(), deadlineMs: budget, identity: state.identity ?? null, admittedAlive: state.admittedAlive ?? false, exitObserved: state.exitObserved, closeObserved: state.closeObserved, exitStatus: state.status ?? null, exitSignal: state.signal ?? null, primaryEsrchObserved: state.primaryGone ?? false, groupEsrchObserved: state.groupGone ?? false, failure: state.failure ?? null, cleanupFailure: state.cleanupFailure ?? null } }
}
function initializer(job: { candidate: string; project: string; model: string; assignment: string; preflightOnly: boolean; readPaths: string[]; hiddenPath: string }) {
  // Adapter uses the real candidate runtime in one owned process; restores the shared spawner on exit.
  return `import { createRequire } from "node:module"
import { relative, dirname } from "node:path"
import { realpath } from "node:fs/promises"
import { userInfo } from "node:os"
const job = ${JSON.stringify(job)}
const stageState = { current: "initializer" }
const safeCode = (error: unknown) => error instanceof Error && /^AUTHORING_[A-Z_]+$/.test(error.message) ? error.message : "AUTHORING_INITIALIZER_DEPENDENCY_OR_RUNTIME_FAILED"
function stage(name: string, phase: "before" | "after" | "failed", code?: string) {
  if (name !== "dispose") stageState.current = name
  console.log(JSON.stringify({ type: "authoring_stage", stage: name, phase, timestamp: Date.now(), ...(code ? { code } : {}) }))
}
stage("initializer", "before")
try {
const requireCandidate = createRequire(job.candidate + "/apps/orchestra/package.json")
const { Effect, ManagedRuntime } = await import(requireCandidate.resolve("effect"))
const { ChildProcess, ChildProcessSpawner } = await import(requireCandidate.resolve("effect/unstable/process"))
const { CrossSpawnSpawner } = await import(job.candidate + "/packages/core/src/cross-spawn-spawner.ts")
const { LayerNode } = await import(job.candidate + "/packages/core/src/effect/layer-node.ts"); const { filesystem } = await import(job.candidate + "/packages/core/src/effect/app-node-platform.ts"); const { memoMap } = await import(job.candidate + "/packages/core/src/effect/memo-map.ts")
type Command = import("effect/unstable/process/ChildProcess").Command
const joinOwnedGroup = (command: Command): Command => command._tag === "StandardCommand" ? ChildProcess.make(command.command, command.args, { ...command.options, detached: false })
  : ChildProcess.pipeTo(joinOwnedGroup(command.left), joinOwnedGroup(command.right), command.options)
// Seed the actual provider before AppRuntime/Instance bootstrap. Same memoMap, same implementation Layer identity.
stage("spawner", "before")
const spawnerRuntime = ManagedRuntime.make(LayerNode.compile(CrossSpawnSpawner.node), { memoMap }), sharedSpawner = await spawnerRuntime.runPromise(ChildProcessSpawner.ChildProcessSpawner)
const originalSpawner = { ...sharedSpawner }, containedSpawner = ChildProcessSpawner.make((command) => originalSpawner.spawn(joinOwnedGroup(command)))
Object.assign(sharedSpawner, containedSpawner)
stage("spawner", "after")
const { AppProcess } = await import(job.candidate + "/packages/core/src/process.ts")
const { Git } = await import(job.candidate + "/apps/orchestra/src/git/index.ts")
const processRuntime = ManagedRuntime.make(LayerNode.compile(LayerNode.group([AppProcess.node, Git.node])), { memoMap })
const releaseSpawner = () => processRuntime.dispose().finally(() => { Object.assign(sharedSpawner, originalSpawner); return spawnerRuntime.dispose() })
try {
// Dependencies are hidden by AppLayer's root surface. Materialize the real consumer graph, not a fake self-provided tag.
stage("consumers", "before")
const seeded = await processRuntime.runPromise(Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const git = yield* Git.Service
  if (processes.spawn !== containedSpawner.spawn) throw new Error("AUTHORING_CONTAINED_PROCESS_PROVIDER_NOT_BOUND")
  return { processes, git }
}))
stage("consumers", "after")
stage("app_runtime", "before")
const { AppRuntime } = await import(job.candidate + "/apps/orchestra/src/effect/app-runtime.ts")
stage("app_runtime", "after")
try {
const { InstanceStore } = await import(job.candidate + "/apps/orchestra/src/project/instance-store.ts")
const { InstanceRef } = await import(job.candidate + "/apps/orchestra/src/effect/instance-ref.ts")
const { Agent } = await import(job.candidate + "/apps/orchestra/src/agent/agent.ts")
const { Session } = await import(job.candidate + "/apps/orchestra/src/session/session.ts")
const { SessionPrompt } = await import(job.candidate + "/apps/orchestra/src/session/prompt.ts")
const { ToolRegistry } = await import(job.candidate + "/apps/orchestra/src/tool/registry.ts")
const { Seats } = await import(job.candidate + "/apps/orchestra/src/maestro/seats/index.ts")
const { Permission } = await import(job.candidate + "/apps/orchestra/src/permission/index.ts")
const { WriteRoots } = await import(job.candidate + "/apps/orchestra/src/maestro/write-roots.ts")
const { PromptGuard } = await import(job.candidate + "/apps/orchestra/src/session/prompt-guard.ts")
function requireFact(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
const shutdown = () => { void Promise.race([AppRuntime.dispose().finally(releaseSpawner), Bun.sleep(2_000)]).finally(() => process.exit(143)) }
process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown)
const loaded = await AppRuntime.runPromise(Effect.gen(function* () {
  const actualGit = yield* Git.Service
  requireFact(actualGit === seeded.git && seeded.processes.spawn === containedSpawner.spawn && sharedSpawner.spawn === containedSpawner.spawn, "AUTHORING_CONTAINED_GIT_CONSUMER_NOT_BOUND")
  const store = yield* InstanceStore.Service
  stage("instance", "before")
  const ctx = yield* store.load({ directory: job.project })
  stage("instance", "after")
  const services = yield* Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const prompts = yield* SessionPrompt.Service
    const registry = yield* ToolRegistry.Service
    stage("native_registry", "before")
    const maestro = yield* agents.get("maestro")
    const archie = yield* agents.get("archie")
    const named = yield* registry.named()
    requireFact(maestro.id === "maestro" && maestro.native === true && maestro.mode === "primary" && archie.id === "archie" && archie.native === true && archie.mode === "subagent" && Seats.find("archie")?.writeRoots === true && Seats.find("archie")?.profileKey === "upstream" && named.task.id === "task", "AUTHORING_NATIVE_REGISTRY_MISMATCH")
    requireFact(archie.engine === "claude-code" && archie.model?.providerID + "/" + archie.model?.modelID === job.model && maestro.engine === undefined, "AUTHORING_CLAUDE_ENGINE_BINDING_MISMATCH")
    stage("native_registry", "after")
    // No Maestro Session exists: the host creates the archie Session below with these inherited denies.
    const denies = [{ permission: "edit", pattern: "*", action: "deny" as const }, { permission: "bash", pattern: "*", action: "deny" as const }]
    return { agents, sessions, prompts, denies }
  }).pipe(Effect.provideService(InstanceRef, ctx))
  return { store, ctx, ...services }
}))
const state = { childChecks: 0 }
const realPrompt = loaded.prompts.prompt
const writeRootBase = await realpath(loaded.ctx.worktree === "/" ? loaded.ctx.directory : loaded.ctx.worktree)
const proposalRoot = job.project + "/proposal.md"
const dispatchPath = relative(writeRootBase, proposalRoot).split(String.fromCharCode(92)).join("/")
requireFact(dispatchPath && !dispatchPath.split("/").includes(".."), "AUTHORING_DISPATCH_PATH_OUTSIDE_WORKTREE")
const proposalPattern = relative(loaded.ctx.worktree, job.project + "/proposal.md").split(String.fromCharCode(92)).join("/")
const contextPattern = relative(loaded.ctx.worktree, job.project + "/README.md").split(String.fromCharCode(92)).join("/")
// Task needs a Maestro assistant message, so the host binds the same write root and creates the native archie Session
// itself with the inherited denies plus the exact proposal allowance.
const direct = await AppRuntime.runPromise(Effect.gen(function* () {
  const rules = yield* WriteRoots.bind("archie", [dispatchPath], loaded.denies)
  requireFact(JSON.stringify(WriteRoots.read(rules)) === JSON.stringify([proposalRoot]), "AUTHORING_RESERVED_ROOT_NOT_OWNER_PROPOSAL")
  // Reads are exact: deny all, then allow the project and each inventoried input; private judge files stay hidden.
  const reads = [{ permission: "read", pattern: "*", action: "deny" as const },
    { permission: "read", pattern: relative(loaded.ctx.worktree, job.project).split(String.fromCharCode(92)).join("/") + "/*", action: "allow" as const },
    ...job.readPaths.map((path) => ({ permission: "read", pattern: relative(loaded.ctx.worktree, path).split(String.fromCharCode(92)).join("/"), action: "allow" as const })),
    ...[...new Set(job.readPaths.map((path) => dirname(path)))].map((dir) => ({ permission: "external_directory", pattern: dir + "/*", action: "allow" as const }))]
  return yield* loaded.sessions.create({ agent: "archie", title: "direct-archie-authoring", permission: [...rules, ...reads, { permission: "edit", pattern: proposalPattern, action: "allow" as const }] })
}).pipe(Effect.provideService(InstanceRef, loaded.ctx), Effect.provide(LayerNode.compile(filesystem))))
const directCheck = Effect.gen(function* () {
  stage("child_pre_model", "before")
  const archie = yield* loaded.agents.get("archie")
  const child = yield* loaded.sessions.get(direct.id)
  requireFact(archie.id === "archie" && archie.native === true && archie.mode === "subagent" && archie.engine === "claude-code" && Seats.find("archie")?.profileKey === "upstream" && child.agent === "archie" && !child.parentID && child.directory === job.project, "AUTHORING_NATIVE_CHILD_BINDING_MISMATCH")
  const canonicalRoot = yield* Effect.promise(() => realpath(proposalRoot).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
    return (await realpath(dirname(proposalRoot))) + "/proposal.md"
  }))
  requireFact(canonicalRoot === proposalRoot && JSON.stringify(WriteRoots.read(child.permission)) === JSON.stringify([proposalRoot]), "AUTHORING_RESERVED_ROOT_CHANGED_BEFORE_MODEL")
  requireFact(Permission.evaluate("edit", proposalPattern, archie.permission, child.permission ?? []).action === "allow" && Permission.evaluate("edit", contextPattern, archie.permission, child.permission ?? []).action === "deny" && Permission.evaluate("bash", "*", archie.permission, child.permission ?? []).action === "deny", "AUTHORING_CHILD_PERMISSION_NOT_PROPOSAL_ONLY")
  const readable = (path: string) => Permission.evaluate("read", relative(loaded.ctx.worktree, path).split(String.fromCharCode(92)).join("/"), archie.permission, child.permission ?? []).action === "allow"
  requireFact(job.readPaths.length > 0 && job.readPaths.every(readable) && job.hiddenPath && !readable(job.hiddenPath), "AUTHORING_DIRECT_READ_BOUNDARY_INVALID")
  state.childChecks++
  stage("child_pre_model", "after")
}).pipe(Effect.provideService(InstanceRef, loaded.ctx))
if (job.preflightOnly) {
  stage("scope_preflight", "before")
  await AppRuntime.runPromise(Effect.gen(function* () {
    const rules = yield* WriteRoots.bind("archie", [dispatchPath], loaded.denies)
    requireFact(JSON.stringify(WriteRoots.read(rules)) === JSON.stringify([proposalRoot]), "AUTHORING_PREFLIGHT_RESERVED_ROOT_MISMATCH")
  // AppRuntime's root surface hides FileSystem; Task provides the same platform node before WriteRoots.bind.
  }).pipe(Effect.provideService(InstanceRef, loaded.ctx), Effect.provide(LayerNode.compile(filesystem))))
  stage("scope_preflight", "after")
  await AppRuntime.runPromise(directCheck) // The exact pre-model guard, run once without a model.
} else {
try {
  console.log(JSON.stringify({ type: "authoring_native_preflight", sessionID: direct.id, projectID: direct.projectID, worktree: loaded.ctx.worktree }))
  const { Provider } = await import(job.candidate + "/apps/orchestra/src/provider/provider.ts")
  const { BackendResult } = await import(job.candidate + "/apps/orchestra/src/maestro/backend-result.ts")
  stage("direct_turn", "before")
  // Real SessionPrompt path: the claude-code engine honors PromptGuard before it spawns the SDK query.
  const returned = await AppRuntime.runPromise(PromptGuard.provide(realPrompt({ sessionID: direct.id, agent: "archie", model: Provider.parseModel(job.model),
    parts: [{ type: "text", text: job.assignment }] }), direct.id, directCheck).pipe(Effect.provideService(InstanceRef, loaded.ctx)))
  stage("direct_turn", "after")
  requireFact(state.childChecks === 1 && returned.info.role === "assistant" && returned.info.agent === "archie" && !returned.info.error, "AUTHORING_DIRECT_TURN_NOT_SUCCESSFUL")
  const history = await AppRuntime.runPromise(loaded.sessions.messages({ sessionID: direct.id }).pipe(Effect.provideService(InstanceRef, loaded.ctx)))
  // The native work-result assembler Task uses; it parses the upstream card from the returned assistant.
  console.log(JSON.stringify({ type: "authoring_direct_result", sessionID: direct.id, workResult: BackendResult.assemble(returned, history, Seats.find("archie")) }))
} catch (error) {
  stage(stageState.current, "failed", safeCode(error))
  console.error(error instanceof Error && /^AUTHORING_[A-Z_]+$/.test(error.message) ? error.message : "AUTHORING_INITIALIZER_OR_NATIVE_RUN_FAILED")
  process.exitCode = 1
}
}
} finally { stage("dispose", "before"); await AppRuntime.dispose(); stage("dispose", "after") }
} finally { await releaseSpawner() }
stage("initializer", "after")
} catch (error) {
  stage(stageState.current, "failed", safeCode(error))
  console.error(safeCode(error)); process.exitCode = 1
}
// Disposal/restoration above has settled. Residual handles must not turn owned-process completion into a timeout.
const flush = (stream: NodeJS.WriteStream) => Promise.race([
  new Promise<boolean>((done) => { try { stream.write("", (error) => done(!error)) } catch { done(false) } }),
  Bun.sleep(500).then(() => false),
])
const flushed = await Promise.all([flush(process.stdout), flush(process.stderr)])
if (!flushed.every(Boolean)) { console.error("AUTHORING_STDIO_FLUSH_FAILED"); process.exitCode = 1 }
process.exit(process.exitCode ?? 0)
`
}
async function verifyDirect(path: string, sessionID: string, project: string, model: string, assignment: string, worktree: string, candidate: string, workResult: unknown) {
  await canonical(path, false)
  const { UpstreamResult } = await import(join(candidate, "apps/orchestra/src/maestro/upstream-result.ts"))
  const db = new Database(path, { readonly: true, strict: true })
  try {
    const session = decode(Schema.Struct({ id: Schema.String, project_id: Schema.String, parent_id: Schema.NullOr(Schema.String), directory: Schema.String, agent: Schema.NullOr(Schema.String), permission: Schema.String }),
      db.query("SELECT id,project_id,parent_id,directory,agent,permission FROM session WHERE id=?").get(sessionID), "AUTHORING_DIRECT_SESSION_DB_MISSING")
    requireAuthoring(session.parent_id === null && session.directory === project && session.agent === "archie", "AUTHORING_DIRECT_SESSION_DB_BINDING_MISMATCH")
    const rules = decode(Schema.Array(Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Schema.String })), json(session.permission), "AUTHORING_CHILD_RULES_INVALID")
    const proposalPattern = relative(worktree, join(project, "proposal.md")).replaceAll("\\", "/")
    requireAuthoring(JSON.stringify(rules.filter((rule) => rule.permission === "tool_safety_write_root" && rule.action === "allow").map((rule) => rule.pattern)) === JSON.stringify([join(project, "proposal.md")]) && rules.some((rule) => rule.permission === "edit" && rule.pattern === "*" && rule.action === "deny") && rules.findLast((rule) => rule.permission === "edit" && ["*", proposalPattern].includes(rule.pattern))?.action === "allow" && rules.some((rule) => rule.permission === "bash" && rule.pattern === "*" && rule.action === "deny"), "AUTHORING_PERSISTED_CHILD_SCOPE_MISMATCH")
    const messages = decode(Schema.Array(Schema.Struct({ id: Schema.String, data: Schema.String })), db.query("SELECT id,data FROM message WHERE session_id=? ORDER BY id").all(sessionID), "AUTHORING_DIRECT_MESSAGES_INVALID")
      .map((row) => ({ id: row.id, info: decode(Schema.Struct({ role: Schema.Literals(["user", "assistant"]), agent: Schema.optional(Schema.String), providerID: Schema.optional(Schema.String), modelID: Schema.optional(Schema.String), error: Schema.optional(Schema.Unknown), finish: Schema.optional(Schema.String), time: Schema.Struct({ completed: Schema.optional(Schema.Number) }) }), json(row.data), "AUTHORING_DIRECT_MESSAGE_INVALID") }))
    const users = messages.filter((item) => item.info.role === "user")
    const assistants = messages.filter((item) => item.info.role === "assistant")
    const texts = (messageID: string) => decode(Schema.Array(Schema.Struct({ data: Schema.String })), db.query("SELECT data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='text' ORDER BY id").all(sessionID, messageID), "AUTHORING_CAPTURED_ASSISTANT_TEXT_MISSING")
      .map((item) => decode(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }), json(item.data), "AUTHORING_CAPTURED_TEXT_INVALID").text).join("\n")
    requireAuthoring(users.length === 1 && texts(users[0].id) === assignment, "AUTHORING_DIRECT_PROMPT_NOT_EXACT_ASSIGNMENT")
    requireAuthoring(assistants.length > 0 && assistants.every((item) => item.info.agent === "archie" && `${item.info.providerID}/${item.info.modelID}` === model), "AUTHORING_CAPTURED_ASSISTANT_MODEL_OR_SESSION_MISMATCH")
    const last = assistants[assistants.length - 1]
    requireAuthoring(last.info.error === undefined && last.info.finish !== "error" && last.info.time.completed !== undefined, "AUTHORING_DIRECT_TURN_NOT_TERMINAL_SUCCESS")
    const returnedText = texts(last.id)
    const card = UpstreamResult.parse(returnedText)
    const result = decode(Schema.Struct({ schema: Schema.Literal("upstream-work-result-v1"), card: Schema.Struct({ parsed: Schema.Literal(true), messageID: Schema.String }), outcome: Schema.Literal("done"), blockers: Schema.Array(Schema.Unknown), terminal: Schema.Struct({ reason: Schema.Literal("ended") }), author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.String, messageID: Schema.String }) }), workResult, "AUTHORING_DIRECT_NATIVE_CARD_NOT_DONE")
    requireAuthoring(card?.outcome === "done" && result.blockers.length === 0 && result.card.messageID === last.id && result.author.messageID === last.id && result.author.executionSessionID === sessionID, "AUTHORING_DIRECT_NATIVE_CARD_BINDING_MISMATCH")
    const steps = decode(Schema.Array(Schema.Struct({ id: Schema.String, message_id: Schema.String, data: Schema.String })), db.query("SELECT id,message_id,data FROM part WHERE session_id=? AND json_extract(data,'$.type')='step-finish' ORDER BY id").all(sessionID), "AUTHORING_STEP_USAGE_ROWS_INVALID").map((item) => {
      const part = decode(Schema.Struct({ reason: Schema.optional(Schema.String), cost: Schema.optional(Schema.Finite), tokens: Schema.optional(Schema.Unknown) }), json(item.data), "AUTHORING_STEP_USAGE_INVALID")
      return { partID: item.id, messageID: item.message_id, sessionID, reason: part.reason ?? null, cost: part.cost ?? null, tokens: part.tokens ?? null }
    })
    return { provenance: { dispatch: "direct-archie", parentSessionID: null, sessionID, projectID: session.project_id, returnedAssistantID: last.id, nativeMemberID: session.agent, workResult: result },
      returnedText, stepUsage: { source: "stored-part.step-finish", status: steps.length ? "observed" : "absent", absentFields: "null", inferredCounts: false, steps } }
  } finally { db.close() }
}

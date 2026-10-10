#!/usr/bin/env bun
import { Database } from "bun:sqlite"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
const selectedAuth = "/Users/gustavoschneiter/.local/share/opencode/auth.json"
// R4 approved these exact source bytes; runtime tests and model qualification remain lead-owned.
const consumerReview = { revision: "6d325f9356a100ea684fc9c302015557d33b1bfa", status: "approved", sourceReview: "R4", runtimeQualification: "pending" }
const runtimeAbi = { memberID: "archie", profile: "upstream", predecessorDriver: "ae927567aa4deefcbb933be27b257e6430e1eff5" }
const inventoryDigest = "80bdd0f9e2cb3195fbdc64ad7d1e8fb1d2e06bb55ceabcb213e28e4bed4ae465"
const guarded = [
  ["packages/orchestra/src/auth/index.ts", "4b9ac63bd8a69c6cd6e554bcde95908246ee9cef"],
  ["packages/orchestra/src/plugin/openai/codex.ts", "97f34ae2b4420014b61f0f3a1574aa10dff4e434"],
  ["packages/orchestra/src/plugin/openai/siwc.ts", "203e07b88371a420db664c01e7796401cbad44df"],
  ["packages/core/src/auth/siwc.ts", "6f70d249c2cb3d58558a9ae2e3d85402a1b1b9e3"],
  // 6d325f9356a100ea684fc9c302015557d33b1bfa; keep these distinct from the historical auth guards above.
  ["packages/orchestra/src/plugin/openai/legacy-codex-readonly.ts", "5e357d979ab74a6415821bd7747bf47d35ebceba"],
  ["packages/orchestra/src/plugin/index.ts", "6588027dd666cd6d1a3dd437bec548e53622afda"],
] as const
// Current runtime ABI observations are separate from the frozen historical packet's source/blob identities.
const sourcePaths = ["agent/agent.ts", "agent/subagent-permissions.ts", "tool/task.ts", "tool/registry.ts", "maestro/seats/archie.ts", "maestro/seats/index.ts", "maestro/roster.ts",
  "maestro/write-roots.ts", "maestro/logical-task.ts", "maestro/backend-work.ts", "maestro/backend-result.ts", "tool/task-background.ts",
  "session/prompt-guard.ts", "session/task-prompt-ops.ts", "effect/app-runtime.ts", "cli/cmd/run.ts"]
const deadline = 10 * 60_000
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
    candidate: { type: "string" }, pilot: { type: "string" }, "auth-source": { type: "string" },
    model: { type: "string", default: "openai/gpt-6.1-sol" }, "prepare-only": { type: "boolean" }, "preflight-only": { type: "boolean" }, run: { type: "boolean" },
  } }).values
  const candidate = await canonical(args.candidate, true)
  const effect = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
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
  requireAuthoring([args.run, args["prepare-only"], args["preflight-only"]].filter(Boolean).length <= 1, "AUTHORING_MODE_CONFLICT")
  const model = args.model ?? "openai/gpt-6.1-sol"
  requireAuthoring(/^openai\/[A-Za-z0-9._-]{1,128}$/.test(model), "AUTHORING_MODEL_INVALID")
  const candidate = bootstrap.candidate
  const pilot = await canonical(args.pilot, true)
  const project = await canonical(join(pilot, "project"), true)
  requireAuthoring(!inside(pilot, candidate) && !inside(candidate, pilot), "AUTHORING_CANDIDATE_FIXTURE_OVERLAP")
  const source = await canonical(args["auth-source"], false)
  requireAuthoring(source === selectedAuth, "AUTHORING_OWNER_SELECTED_AUTH_SOURCE_REQUIRED")
  const sourceHashes = await Promise.all(guarded.map(async ([file, expected]) => {
    const bytes = await read(await canonical(join(candidate, file), false))
    requireAuthoring(blob(bytes) === expected, "AUTHORING_AUTH_CONSUMER_PIN_MISMATCH")
    return { file, blob: expected, sha256: sha256(bytes) }
  }))
  const nativeSourceHashes = await Promise.all(sourcePaths.map(async (file) => ({ file,
    sha256: sha256(await read(await canonical(join(candidate, "packages/orchestra/src", file), false))) })))
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
  requireAuthoring(domain.inventoryDigest.sha256 === inventoryDigest && sha256(canonicalInventory) === inventoryDigest && canonicalInventory.length === domain.inventoryDigest.utf8ByteLength, "AUTHORING_INVENTORY_DIGEST_MISMATCH")
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
  const instructions = await read(await canonical(join(packet, "AUTHORING-RUN-INPUT.md"), false))
  requireAuthoring(instructions.length > 0, "AUTHORING_RUN_INPUT_EMPTY")
  requireAuthoring(await lstat(join(project, "proposal.md")).then(() => false, (error: NodeJS.ErrnoException) => error.code === "ENOENT"), "AUTHORING_ORIGINAL_PROPOSAL_ALREADY_EXISTS")
  process.umask(0o077)
  const runtime = await mkdtemp(join(pilot, "ordinary-authoring-"))
  const env: Record<string, string> = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(runtime, key.toLowerCase())]))
  await Promise.all(Object.values(env).map((path) => mkdir(path, { mode: 0o700 })))
  Object.assign(env, { ORCHESTRA_DB: join(runtime, "session.db"), ORCHESTRA_CONFIG: join(runtime, "config.json"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_LEGACY_CODEX_READONLY: "1", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_TEST_HOME: env.HOME, TMP: env.TMPDIR, TEMP: env.TMPDIR })
  await writeFile(env.ORCHESTRA_CONFIG, JSON.stringify({ model, default_agent: "maestro", agent: { maestro: { permission: { "*": "deny", task: { "*": "deny", archie: "allow" } } } } }) + "\n", { flag: "wx", mode: 0o600 })
  const assignment = `Ordinary proposal-only authoring. Write only proposal.md. No implementation, tests, builds, publication, child dispatch, approval or workflow execution. Return the existing native upstream-result card.\n\nFULL OWNER DEMAND:\n${Buffer.from(demand.bytes).toString("utf8")}\n\nPINNED SCOPE HANDOFF:\n${Buffer.from(handoff.bytes).toString("utf8")}`
  const job = { candidate, project, model, assignment, preflightOnly: Boolean(args["preflight-only"]) }
  const report = { schema: 1, runtime, candidate, head, project, model, sourceHashes, nativeSourceHashes, runtimeAbi, consumerReview, inventoryDigest,
    packetPointer: join(packet, "DOMAIN-SOURCE.json"), packetSha256: sha256(domainBytes), runInputSha256: sha256(instructions),
    inventory: inventory.map(({ bytes, ...item }) => item), deadlineMs: deadline, stdoutBytes: 32 * 1024 * 1024, semanticJudgment: "not-performed" }
  await writeFile(join(runtime, "prepared.json"), JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 })
  if (!args.run && !args["preflight-only"]) { console.log(JSON.stringify({ code: "AUTHORING_PREPARED", runtime, head, consumerReview })); return }
  requireAuthoring(consumerReview.status === "approved", "AUTHORING_REVIEWED_CONSUMER_SUCCESSOR_REQUIRED")
  const entry = join(runtime, "initializer.ts")
  const program = initializer(job)
  await writeFile(entry, program, { flag: "wx", mode: 0o600 })
  try { new Bun.Transpiler({ loader: "ts" }).transformSync(program) } catch {
    await writeFile(join(runtime, "status.txt"), "AUTHORING_INITIALIZER_PARSE_FAILED", { flag: "wx", mode: 0o600 })
    throw new AuthoringError("AUTHORING_INITIALIZER_PARSE_FAILED")
  }
  // Pure legacy shape inspection; never call Siwc, decode JWT claims, login, refresh, or infer issued scopes.
  const snapshot = args.run ? await (async () => {
  const store = decode(Schema.Record(Schema.String, Schema.Unknown), json(Buffer.from(await read(source, true)).toString("utf8")), "AUTHORING_LEGACY_AUTH_STORE_INVALID")
  const value = decode(Schema.Record(Schema.String, Schema.Unknown), store.openai, "AUTHORING_OPENAI_AUTH_MISSING")
  requireAuthoring(!Object.hasOwn(value, "metadata"), "AUTHORING_LEGACY_AUTH_METADATA_MUST_BE_ABSENT")
  const auth = decode(Schema.Struct({ type: Schema.Literal("oauth"), access: Schema.NonEmptyString, refresh: Schema.NonEmptyString,
    expires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), accountId: Schema.optional(Schema.String) }), value, "AUTHORING_LEGACY_OAUTH_INVALID")
  requireAuthoring(auth.expires > Date.now() + 15 * 60_000, "AUTHORING_LEGACY_AUTH_EXPIRED_OR_TOO_SOON")
  const secrets = [auth.access, auth.refresh].flatMap((text) => [text, JSON.stringify(text).slice(1, -1), encodeURIComponent(text), Buffer.from(text).toString("base64")]).sort((a, b) => b.length - a.length)
  return { content: JSON.stringify({ openai: auth }), secrets }
  })() : { content: undefined, secrets: [] as string[] }
  const secrets = snapshot.secrets
  const redact = (text: string) => secrets.reduce((output, secret) => output.split(secret).join("[REDACTED]"), text)
  // Initializer derives the Task path from its real Instance. Stdin carries only this exact assignment and EOF.
  const output = await launch(entry, candidate, { ...env, PATH: process.env.PATH, ...(snapshot.content ? { ORCHESTRA_AUTH_CONTENT: snapshot.content } : {}) }, assignment, job.preflightOnly ? 30_000 : deadline)
  await writeFile(join(runtime, "launcher.json"), JSON.stringify(output.launcher) + "\n", { flag: "wx", mode: 0o600 })
  const stages = output.text.split("\n").flatMap((line) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
    if (Option.isNone(parsed)) return []
    const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("authoring_stage"), stage: Schema.Literals(["initializer", "spawner", "consumers", "app_runtime", "instance", "native_registry", "scope_preflight", "cli", "parent_pre_model", "child_pre_model", "dispose"]), phase: Schema.Literals(["before", "after", "failed"]), timestamp: Schema.Int, code: Schema.optional(Schema.String.check(Schema.isPattern(/^(?:AUTHORING|LEGACY_CODEX)_[A-Z_]+$/))) }))(parsed.value)
    return Option.isSome(event) ? [event.value] : []
  })
  await writeFile(join(runtime, "stages.jsonl"), stages.map((item) => JSON.stringify(item)).join("\n") + "\n", { flag: "wx", mode: 0o600 })
  const records = output.text.split("\n").flatMap<{ type: string; sessionID: string; projectID?: string; worktree?: string; timestamp?: number }>((line) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
    if (Option.isNone(parsed)) return []
    const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.String }))(parsed.value)
    if (Option.isNone(event)) return []
    if (event.value.type === "authoring_native_preflight") return [decode(Schema.Struct({ type: Schema.String, sessionID: Schema.String, projectID: Schema.String, worktree: Schema.String }), parsed.value, "AUTHORING_PREFLIGHT_RECORD_INVALID")]
    const header = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literals(["tool_use", "step_start", "step_finish", "text", "error", "retry"]), sessionID: Schema.String, timestamp: Schema.Number }))(parsed.value)
    return Option.isSome(header) ? [header.value] : []
  })
  await writeFile(join(runtime, "events.jsonl"), records.map((item) => redact(JSON.stringify(item))).join("\n") + "\n", { flag: "wx", mode: 0o600 })
  await writeFile(join(runtime, "status.txt"), output.code ?? "AUTHORING_CHILD_COMPLETED", { flag: "wx", mode: 0o600 })
  if (output.code) await writeFile(join(runtime, "diagnostic.txt"), redact(output.stderr), { flag: "wx", mode: 0o600 })
  requireAuthoring(!output.code, output.code ?? "AUTHORING_CHILD_FAILED_STDERR_WITHHELD")
  if (args["preflight-only"]) { console.log(JSON.stringify({ code: "AUTHORING_NATIVE_PREFLIGHT_COMPLETED_NO_MODEL", runtime })); return }
  const preflight = records.filter((item) => item.type === "authoring_native_preflight")
  requireAuthoring(preflight.length === 1, "AUTHORING_NATIVE_PREFLIGHT_NOT_OBSERVED")
  requireAuthoring(preflight[0].worktree, "AUTHORING_ACTUAL_WORKTREE_NOT_OBSERVED")
  const evidence = await verifyDatabase(env.ORCHESTRA_DB, preflight[0].sessionID, project, model, assignment, preflight[0].worktree)
  const result = evidence.provenance
  const proposal = await read(await canonical(join(project, "proposal.md"), false))
  const returnedCard = Buffer.from(evidence.returnedText)
  requireAuthoring(proposal.length > 0 && returnedCard.length > 0 && !secrets.some((secret) => Buffer.from(proposal).includes(Buffer.from(secret)) || returnedCard.includes(Buffer.from(secret))), "AUTHORING_ORIGINAL_OUTPUT_EMPTY_OR_SECRET_BEARING")
  const returnedCardPath = join(runtime, "returned-assistant.txt")
  await writeFile(returnedCardPath, returnedCard, { flag: "wx", mode: 0o600 })
  await Promise.all(inventory.map(async (item) => requireAuthoring(sha256(await read(item.path)) === item.sha256, "AUTHORING_FROZEN_INPUT_CHANGED_DURING_RUN")))
  requireAuthoring(await gitHead(candidate) === head, "AUTHORING_CANDIDATE_CHANGED_DURING_RUN")
  const receipt = { ...report, ...result, proposalPath: join(project, "proposal.md"), proposalBytes: proposal.length, proposalSha256: sha256(proposal), returnedCardPath, returnedCardBytes: returnedCard.length, returnedCardSha256: sha256(returnedCard) }
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
  const child = spawn(process.execPath, [entry], { cwd: join(candidate, "packages/orchestra"), env, detached: true, stdio: "pipe" })
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
function initializer(job: { candidate: string; project: string; model: string; assignment: string; preflightOnly: boolean }) {
  // Adapter uses the real candidate runtime and CLI command in one owned process; restores every wrapped method.
  return `import { createRequire } from "node:module"
import { relative, dirname } from "node:path"
import { realpath } from "node:fs/promises"
const job = ${JSON.stringify(job)}
const stageState = { current: "initializer" }
const safeCode = (error: unknown) => error instanceof Error && /^(?:AUTHORING|LEGACY_CODEX)_[A-Z_]+$/.test(error.message) ? error.message : "AUTHORING_INITIALIZER_DEPENDENCY_OR_RUNTIME_FAILED"
function stage(name: string, phase: "before" | "after" | "failed", code?: string) {
  if (name !== "dispose") stageState.current = name
  console.log(JSON.stringify({ type: "authoring_stage", stage: name, phase, timestamp: Date.now(), ...(code ? { code } : {}) }))
}
stage("initializer", "before")
try {
const requireCandidate = createRequire(job.candidate + "/packages/orchestra/package.json")
const { Effect, ManagedRuntime } = await import(requireCandidate.resolve("effect"))
const { ChildProcess, ChildProcessSpawner } = await import(requireCandidate.resolve("effect/unstable/process"))
const { CrossSpawnSpawner } = await import(job.candidate + "/packages/core/src/cross-spawn-spawner.ts")
const { LayerNode } = await import(job.candidate + "/packages/core/src/effect/layer-node.ts"); const { memoMap } = await import(job.candidate + "/packages/core/src/effect/memo-map.ts")
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
const { Git } = await import(job.candidate + "/packages/orchestra/src/git/index.ts")
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
const { AppRuntime } = await import(job.candidate + "/packages/orchestra/src/effect/app-runtime.ts")
stage("app_runtime", "after")
try {
const { InstanceStore } = await import(job.candidate + "/packages/orchestra/src/project/instance-store.ts")
const { InstanceRef } = await import(job.candidate + "/packages/orchestra/src/effect/instance-ref.ts")
const { Agent } = await import(job.candidate + "/packages/orchestra/src/agent/agent.ts")
const { Session } = await import(job.candidate + "/packages/orchestra/src/session/session.ts")
const { SessionPrompt } = await import(job.candidate + "/packages/orchestra/src/session/prompt.ts")
const { ToolRegistry } = await import(job.candidate + "/packages/orchestra/src/tool/registry.ts")
const { Seats } = await import(job.candidate + "/packages/orchestra/src/maestro/seats/index.ts")
const { Permission } = await import(job.candidate + "/packages/orchestra/src/permission/index.ts")
const { WriteRoots } = await import(job.candidate + "/packages/orchestra/src/maestro/write-roots.ts")
const { PromptGuard } = await import(job.candidate + "/packages/orchestra/src/session/prompt-guard.ts")
const { RunCommand } = await import(job.candidate + "/packages/orchestra/src/cli/cmd/run.ts")
type TaskPromptOps = import(${JSON.stringify(job.candidate + "/packages/orchestra/src/tool/task.ts")}).TaskPromptOps
function requireFact(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
function isOps(value: unknown): value is TaskPromptOps { return !!value && typeof value === "object" && "prompt" in value && typeof value.prompt === "function" && "cancel" in value && typeof value.cancel === "function" && "resolvePromptParts" in value && typeof value.resolvePromptParts === "function" }
const shutdown = () => { void Promise.race([AppRuntime.dispose().finally(releaseSpawner), Bun.sleep(2_000)]).finally(() => process.exit(143)) }
process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown)
const loaded = await AppRuntime.runPromise(Effect.gen(function* () {
  const actualGit = yield* Git.Service
  requireFact(actualGit === seeded.git && seeded.processes.spawn === containedSpawner.spawn && sharedSpawner.spawn === containedSpawner.spawn, "AUTHORING_CONTAINED_GIT_CONSUMER_NOT_BOUND")
  const store = yield* InstanceStore.Service
  stage("instance", "before")
  if (job.preflightOnly) {
    const { validateLegacyCodexReadonlyAuth } = yield* Effect.promise(() => import(job.candidate + "/packages/orchestra/src/plugin/openai/legacy-codex-readonly.ts"))
    try { validateLegacyCodexReadonlyAuth() } catch (error) { stage("instance", "failed", safeCode(error)); throw error } // No fake AUTH_CONTENT or auth-file read.
  }
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
    stage("native_registry", "after")
    const denies = [{ permission: "edit", pattern: "*", action: "deny" as const }, { permission: "bash", pattern: "*", action: "deny" as const }]
    const parent = yield* sessions.create({ agent: "maestro", title: "ordinary-archie-authoring", permission: denies })
    yield* sessions.setPermission({ sessionID: parent.id, permission: denies })
    return { agents, sessions, prompts, task: named.task, parent, denies }
  }).pipe(Effect.provideService(InstanceRef, ctx))
  return { store, ctx, ...services }
}))
const state = { calls: 0, parentChecks: 0, childChecks: 0 }
const taskExecute = loaded.task.execute
const realPrompt = loaded.prompts.prompt
const writeRootBase = await realpath(loaded.ctx.worktree === "/" ? loaded.ctx.directory : loaded.ctx.worktree)
const proposalRoot = job.project + "/proposal.md"
const dispatchPath = relative(writeRootBase, proposalRoot).split(String.fromCharCode(92)).join("/")
requireFact(dispatchPath && !dispatchPath.split("/").includes(".."), "AUTHORING_DISPATCH_PATH_OUTSIDE_WORKTREE")
const proposalPattern = relative(loaded.ctx.worktree, job.project + "/proposal.md").split(String.fromCharCode(92)).join("/")
const contextPattern = relative(loaded.ctx.worktree, job.project + "/README.md").split(String.fromCharCode(92)).join("/")
if (job.preflightOnly) {
  stage("scope_preflight", "before")
  await AppRuntime.runPromise(Effect.gen(function* () {
    const rules = yield* WriteRoots.bind("archie", [dispatchPath], loaded.denies)
    requireFact(JSON.stringify(WriteRoots.read(rules)) === JSON.stringify([proposalRoot]), "AUTHORING_PREFLIGHT_RESERVED_ROOT_MISMATCH")
  }).pipe(Effect.provideService(InstanceRef, loaded.ctx)))
  stage("scope_preflight", "after")
} else {
const parentCheck = Effect.gen(function* () {
  stage("parent_pre_model", "before")
  const maestro = yield* loaded.agents.get("maestro")
  const archie = yield* loaded.agents.get("archie")
  const parent = yield* loaded.sessions.get(loaded.parent.id)
  requireFact(maestro.id === "maestro" && maestro.native === true && maestro.mode === "primary" && archie.id === "archie" && archie.native === true && archie.mode === "subagent" && Seats.find("archie")?.profileKey === "upstream" && parent.agent === "maestro" && parent.directory === job.project && !parent.parentID, "AUTHORING_PRE_MODEL_IDENTITY_CHANGED")
  requireFact(Permission.evaluate("edit", "README.md", parent.permission ?? []).action === "deny" && Permission.evaluate("bash", "*", parent.permission ?? []).action === "deny", "AUTHORING_PARENT_SESSION_PERMISSION_CHANGED")
  state.parentChecks++
  stage("parent_pre_model", "after")
}).pipe(Effect.provideService(InstanceRef, loaded.ctx))
loaded.prompts.prompt = (request) => PromptGuard.provide(realPrompt(request), loaded.parent.id, parentCheck)
loaded.task.execute = (params, ctx) => Effect.gen(function* () {
  state.calls++
  requireFact(state.calls === 1 && ctx.sessionID === loaded.parent.id && (ctx.agentID ?? ctx.agent) === "maestro" && params.subagent_type === "archie" && params.prompt === job.assignment && params.model === job.model && JSON.stringify(params.writePaths) === JSON.stringify([dispatchPath]) && params.background !== true && params.governed === undefined && params.authorizationID === undefined && params.workflow === undefined && params.task_id === undefined, "AUTHORING_TASK_REQUEST_OUT_OF_SCOPE")
  const ops = ctx.extra?.promptOps
  requireFact(isOps(ops), "AUTHORING_REAL_TASK_PROMPT_OPS_MISSING")
  return yield* taskExecute(params, { ...ctx, extra: { ...ctx.extra, promptOps: { ...ops,
    prompt: (request, options) => Effect.gen(function* () {
      // Bind the inherited deny + exact allowance before prompt admission/tool selection, not after tools are built.
      const child = yield* loaded.sessions.get(request.sessionID)
      requireFact(child.parentID === loaded.parent.id && child.agent === "archie" && child.projectID === loaded.parent.projectID && child.directory === job.project, "AUTHORING_NATIVE_CHILD_BINDING_MISMATCH")
      const roots = WriteRoots.read(child.permission)
      requireFact(JSON.stringify(roots) === JSON.stringify([proposalRoot]), "AUTHORING_RESERVED_ROOT_NOT_OWNER_PROPOSAL")
      yield* loaded.sessions.setPermission({ sessionID: child.id, permission: [...(child.permission ?? []), { permission: "edit", pattern: proposalPattern, action: "allow" }] })
      const beforeModel = Effect.gen(function* () {
        stage("child_pre_model", "before")
        const archie = yield* loaded.agents.get("archie")
        const child = yield* loaded.sessions.get(request.sessionID)
        requireFact(archie.id === "archie" && archie.native === true && archie.mode === "subagent" && Seats.find("archie")?.profileKey === "upstream" && request.agent === "archie" && child.agent === "archie" && child.parentID === loaded.parent.id && child.projectID === loaded.parent.projectID && child.directory === job.project, "AUTHORING_NATIVE_CHILD_BINDING_MISMATCH")
        const bound = yield* loaded.sessions.get(child.id)
        const canonicalRoot = yield* Effect.promise(() => realpath(proposalRoot).catch(async (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error
          return (await realpath(dirname(proposalRoot))) + "/proposal.md"
        }))
        requireFact(canonicalRoot === proposalRoot && JSON.stringify(WriteRoots.read(bound.permission)) === JSON.stringify([proposalRoot]), "AUTHORING_RESERVED_ROOT_CHANGED_BEFORE_MODEL")
        requireFact(Permission.evaluate("edit", proposalPattern, archie.permission, bound.permission ?? []).action === "allow" && Permission.evaluate("edit", contextPattern, archie.permission, bound.permission ?? []).action === "deny" && Permission.evaluate("bash", "*", archie.permission, bound.permission ?? []).action === "deny", "AUTHORING_CHILD_PERMISSION_NOT_PROPOSAL_ONLY")
        state.childChecks++
        stage("child_pre_model", "after")
      }).pipe(Effect.provideService(InstanceRef, loaded.ctx))
      return yield* ops.prompt(request, { beforeModel: Effect.all([options?.beforeModel ?? Effect.void, beforeModel], { discard: true }) })
    }).pipe(Effect.provideService(InstanceRef, loaded.ctx))
  } } })
}).pipe(Effect.provideService(InstanceRef, loaded.ctx))
try {
  console.log(JSON.stringify({ type: "authoring_native_preflight", sessionID: loaded.parent.id, projectID: loaded.parent.projectID, worktree: loaded.ctx.worktree }))
  requireFact(RunCommand.handler, "AUTHORING_REAL_CLI_HANDLER_MISSING")
  const hostPrompt = "Use exactly one existing foreground Task with subagent_type=archie, model=" + job.model + ", writePaths=" + JSON.stringify([dispatchPath]) + ", and the exact assignment supplied below on stdin. Omit governed, authorizationID, workflow, task_id and background. Do no implementation yourself. Return the actual Task result without additional dispatch."
  stage("cli", "before")
  await RunCommand.handler({ $0: "orchestra", _: ["run"], message: [hostPrompt], command: undefined, continue: false, session: loaded.parent.id, fork: false,
    model: job.model, agent: "maestro", format: "json", file: undefined, title: undefined, attach: undefined, password: undefined, username: undefined,
    dir: job.project, port: undefined, variant: undefined, thinking: false, mini: false, interactive: false, replay: undefined,
    "replay-limit": undefined, replayLimit: undefined, auto: false, yolo: false, "dangerously-skip-permissions": false, dangerouslySkipPermissions: false, demo: false })
  stage("cli", "after")
  requireFact(state.calls === 1 && state.parentChecks > 0 && state.childChecks > 0, "AUTHORING_EXECUTION_GUARDS_NOT_OBSERVED")
} catch (error) {
  stage(stageState.current, "failed", safeCode(error))
  console.error(error instanceof Error && /^AUTHORING_[A-Z_]+$/.test(error.message) ? error.message : "AUTHORING_INITIALIZER_OR_NATIVE_RUN_FAILED")
  process.exitCode = 1
} finally { loaded.task.execute = taskExecute; loaded.prompts.prompt = realPrompt }
}
} finally { stage("dispose", "before"); await AppRuntime.dispose(); stage("dispose", "after") }
} finally { await releaseSpawner() }
stage("initializer", "after")
} catch (error) {
  stage(stageState.current, "failed", safeCode(error))
  console.error(safeCode(error)); process.exitCode = 1
}
`
}
async function verifyDatabase(path: string, parentID: string, project: string, model: string, assignment: string, worktree: string) {
  await canonical(path, false)
  const db = new Database(path, { readonly: true, strict: true })
  try {
    const sessionRow = Schema.Struct({ id: Schema.String, project_id: Schema.String, parent_id: Schema.NullOr(Schema.String), directory: Schema.String, agent: Schema.NullOr(Schema.String), permission: Schema.String })
    const parent = decode(sessionRow, db.query("SELECT id,project_id,parent_id,directory,agent,permission FROM session WHERE id=?").get(parentID), "AUTHORING_PARENT_DB_MISSING")
    requireAuthoring(parent.parent_id === null && parent.directory === project && parent.agent === "maestro", "AUTHORING_PARENT_DB_BINDING_MISMATCH")
    const rows = decode(Schema.Array(Schema.Struct({ id: Schema.String, message_id: Schema.String, data: Schema.String, message: Schema.String })), db.query("SELECT p.id,p.message_id,p.data,m.data AS message FROM part p JOIN message m ON m.id=p.message_id WHERE p.session_id=? AND m.session_id=? AND json_extract(p.data,'$.type')='tool' AND json_extract(p.data,'$.tool')='task'").all(parentID, parentID), "AUTHORING_TASK_DB_SCHEMA_INVALID")
    requireAuthoring(rows.length === 1, "AUTHORING_TASK_DB_MISSING_OR_MULTIPLE")
    const row = rows[0]
    const task = decode(Schema.Struct({ callID: Schema.String, state: Schema.Struct({ status: Schema.Literal("completed"), input: Schema.Record(Schema.String, Schema.Unknown), metadata: Schema.Struct({ sessionId: Schema.String, parentSessionId: Schema.String, workResult: Schema.Struct({ schema: Schema.Literal("upstream-work-result-v1"), taskId: Schema.String, author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.String, messageID: Schema.String }), card: Schema.Struct({ messageID: Schema.String }), writeRoots: Schema.Array(Schema.String) }) }) }) }), json(row.data), "AUTHORING_CAPTURED_TASK_RETURN_MISSING")
    const author = task.state.metadata.workResult.author
    const dispatchPath = relative(worktree === "/" ? project : worktree, join(project, "proposal.md")).replaceAll("\\", "/")
    requireAuthoring(task.state.input.subagent_type === "archie" && task.state.input.prompt === assignment && task.state.input.model === model && JSON.stringify(task.state.input.writePaths) === JSON.stringify([dispatchPath]) && task.state.input.governed === undefined && task.state.input.authorizationID === undefined && task.state.input.workflow === undefined && task.state.input.task_id === undefined && task.state.input.background !== true && task.state.metadata.parentSessionId === parentID && task.state.metadata.sessionId === author.executionSessionID && task.state.metadata.workResult.card.messageID === author.messageID && JSON.stringify(task.state.metadata.workResult.writeRoots) === JSON.stringify([dispatchPath]), "AUTHORING_TASK_RETURN_BINDING_MISMATCH")
    decode(Schema.Struct({ role: Schema.Literal("assistant"), agent: Schema.Literal("maestro") }), json(row.message), "AUTHORING_TASK_CALLER_NOT_MAESTRO")
    const child = decode(sessionRow, db.query("SELECT id,project_id,parent_id,directory,agent,permission FROM session WHERE id=?").get(author.executionSessionID), "AUTHORING_CHILD_DB_MISSING")
    requireAuthoring(child.parent_id === parentID && child.project_id === parent.project_id && child.directory === project && child.agent === "archie", "AUTHORING_CHILD_DB_BINDING_MISMATCH")
    const rules = decode(Schema.Array(Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Schema.String })), json(child.permission), "AUTHORING_CHILD_RULES_INVALID")
    const roots = rules.filter((rule) => rule.permission === "tool_safety_write_root" && rule.action === "allow").map((rule) => rule.pattern)
    const proposalPattern = relative(worktree, join(project, "proposal.md")).replaceAll("\\", "/")
    requireAuthoring(JSON.stringify(roots) === JSON.stringify([join(project, "proposal.md")]) && rules.some((rule) => rule.permission === "edit" && rule.pattern === "*" && rule.action === "deny") && rules.findLast((rule) => rule.permission === "edit" && ["*", proposalPattern].includes(rule.pattern))?.action === "allow" && rules.some((rule) => rule.permission === "bash" && rule.pattern === "*" && rule.action === "deny"), "AUTHORING_PERSISTED_CHILD_SCOPE_MISMATCH")
    const returned = decode(Schema.Struct({ session_id: Schema.String, data: Schema.String }), db.query("SELECT session_id,data FROM message WHERE id=?").get(author.messageID), "AUTHORING_CAPTURED_ASSISTANT_DB_MISSING")
    const info = decode(Schema.Struct({ role: Schema.Literal("assistant"), agent: Schema.Literal("archie"), providerID: Schema.String, modelID: Schema.String }), json(returned.data), "AUTHORING_CAPTURED_ASSISTANT_NOT_ARCHIE")
    requireAuthoring(returned.session_id === child.id && `${info.providerID}/${info.modelID}` === model, "AUTHORING_CAPTURED_ASSISTANT_MODEL_OR_SESSION_MISMATCH")
    const bindings = decode(Schema.Array(Schema.Struct({ data: Schema.String })), db.query("SELECT data FROM event WHERE aggregate_id=? AND type='maestro.task.bound.1'").all(child.id), "AUTHORING_LOGICAL_TASK_DB_INVALID")
    requireAuthoring(bindings.length === 1, "AUTHORING_LOGICAL_TASK_MISSING_OR_AMBIGUOUS")
    const bound = decode(Schema.Struct({ taskId: Schema.String, memberID: Schema.Literal("archie"), projectID: Schema.String, executionSessionID: Schema.String, authoritySessionID: Schema.String, source: Schema.Literal("host") }), json(bindings[0].data), "AUTHORING_ORDINARY_TASK_BINDING_INVALID")
    requireAuthoring(bound.taskId === task.state.metadata.workResult.taskId && bound.executionSessionID === child.id && bound.authoritySessionID === parentID && bound.projectID === parent.project_id, "AUTHORING_LOGICAL_TASK_BINDING_MISMATCH")
    const texts = decode(Schema.Array(Schema.Struct({ data: Schema.String })), db.query("SELECT data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='text' ORDER BY id").all(child.id, author.messageID), "AUTHORING_CAPTURED_ASSISTANT_TEXT_MISSING")
    const returnedText = texts.map((item) => decode(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }), json(item.data), "AUTHORING_CAPTURED_TEXT_INVALID").text).join("\n")
    return { provenance: { parentSessionID: parentID, parentMessageID: row.message_id, parentCallID: task.callID, childSessionID: child.id, projectID: child.project_id, logicalTaskID: bound.taskId, returnedAssistantID: author.messageID, nativeMemberID: child.agent }, returnedText }
  } finally { db.close() }
}

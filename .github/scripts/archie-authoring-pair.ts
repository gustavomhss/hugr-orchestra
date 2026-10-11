#!/usr/bin/env bun
import { Database } from "bun:sqlite"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { userInfo } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import { initializer } from "./archie-authoring-pair-initializer"
import type { Schema } from "effect"

// Observation wrapper, not an approval/benefit gate. No inference in prepare/preflight modes.
// Direct mode on the Claude Code engine: the host creates and prompts one native archie Session per arm; no Maestro.
export const claude = { engine: "claude-code", model: "anthropic/claude-opus-5-5", credentialKind: "claude-code-keychain-oauth" } as const
export const model = claude.model
// Measured 2026-10-11: one Opus 5.5 stage takes about 6 minutes, so four stages need more than 20.
export const armBudgetMs = 40 * 60_000
export const totalBudgetMs = 2 * armBudgetMs + 2 * 60_000
const outputLimit = 32 * 1024 * 1024
// Credential stores stay outside every read grant even though no arm is given their paths.
const credentialPaths = (home: string) => [join(home, ".claude/.credentials.json"), join(home, ".claude.json")]
const runtimeFiles = ["agent/agent.ts", "agent/subagent-permissions.ts", "tool/registry.ts", "session/prompt.ts", "session/session.ts",
  "session/prompt-guard.ts", "maestro/seats/archie.ts", "maestro/roster.ts", "maestro/write-roots.ts", "maestro/backend-result.ts", "effect/app-runtime.ts",
  "claude-code/engine.ts", "claude-code/sdk.ts", "claude-code/mirror.ts", "claude-code/permissions.ts", "claude-code/tools.ts"]
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
class PairError extends Error {}
function requireFact(value: unknown, code: string): asserts value {
  if (!value) throw new PairError(code)
}
const safeCode = (error: unknown) => error instanceof PairError ? error.message : "PAIR_IO_OR_RUNTIME_UNAVAILABLE"

export function secretForms(values: readonly string[]) {
  requireFact(values.every((value) => value.length > 0), "PAIR_EMPTY_SECRET_REFUSED")
  return [...new Set(values.flatMap((text) => [text, JSON.stringify(text).slice(1, -1), encodeURIComponent(text), Buffer.from(text).toString("base64")]))].sort((a, b) => b.length - a.length)
}
type JsonDecoder = (text: string) => { value: unknown } | undefined
export async function evidenceDecoder(candidate: string): Promise<JsonDecoder> {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  return (text) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
    return Option.isSome(parsed) ? { value: parsed.value } : undefined
  }
}
export function requireSecretFree(value: unknown, secrets: readonly string[], decodeJson?: JsonDecoder) {
  requireFact(!serializedEvidence(value, secrets, decodeJson).receipt.redacted, "PAIR_MODEL_INPUT_SECRET_BEARING")
}
export function serializedEvidence(value: unknown, secrets: readonly string[], decodeJson?: JsonDecoder) {
  const original = (() => {
    try { return JSON.stringify(value) }
    catch { throw new PairError("PAIR_EVIDENCE_NOT_SERIALIZABLE") }
  })()
  requireFact(typeof original === "string", "PAIR_EVIDENCE_NOT_SERIALIZABLE")
  const redact = (text: string) => secrets.reduce((result, secret) => result.split(secret).join(""), text)
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      const direct = redact(item)
      if (direct !== item) return direct
      const parsed = decodeJson?.(item)
      if (!parsed) return item
      const next = walk(parsed.value)
      return JSON.stringify(next) === JSON.stringify(parsed.value) ? item : JSON.stringify(next)
    }
    if (Array.isArray(item)) return item.map(walk)
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, value]) => [redact(key), walk(value)]))
    return item
  }
  // Walk the JSON projection, so toJSON/function/undefined differences never read as redaction.
  const text = JSON.stringify(walk(JSON.parse(original))) + "\n"
  requireFact(!secrets.some((secret) => text.includes(secret)), "PAIR_EVIDENCE_REDACTION_FAILED")
  return { text, receipt: { redacted: text !== original + "\n", secretScanPerformed: secrets.length > 0, replacement: "empty-string",
    originalSha256: sha256(Buffer.from(original + "\n")), originalUtf8ByteLength: Buffer.byteLength(original + "\n"),
    writtenSha256: sha256(Buffer.from(text)), writtenUtf8ByteLength: Buffer.byteLength(text), originalDatabase: "retained-unmodified" } }
}
// Redaction secrets for the Claude Code login the engine hands its SDK process. Held in memory only, never written.
export async function claudeLoginSecrets(candidate: string, raw: string, minimumValidMs: number, now = Date.now()) {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(raw)
  const login = Option.isSome(parsed) ? Schema.decodeUnknownOption(Schema.Struct({ claudeAiOauth: Schema.Struct({ accessToken: Schema.NonEmptyString,
    refreshToken: Schema.optional(Schema.NonEmptyString), expiresAt: Schema.Finite, scopes: Schema.Array(Schema.String) }) }))(parsed.value) : Option.none()
  // sdk.ts refuses an expired access token on every spawn and never refreshes it; each stage spawns, so cover the whole run.
  requireFact(Option.isSome(login) && login.value.claudeAiOauth.scopes.includes("user:inference") && login.value.claudeAiOauth.expiresAt > now + minimumValidMs, "PAIR_CLAUDE_LOGIN_INVALID_OR_EXPIRY_TOO_CLOSE")
  return secretForms([login.value.claudeAiOauth.accessToken, ...(login.value.claudeAiOauth.refreshToken ? [login.value.claudeAiOauth.refreshToken] : [])])
}
// The same store sdk.ts reads per spawn: the unsuffixed Keychain item (CLAUDE_SECURESTORAGE_CONFIG_DIR=""), else its file.
export async function readClaudeLogin(candidate: string, home: string, user: string, minimumValidMs: number) {
  const { ClaudeCodeSDK } = await import(join(candidate, "packages/orchestra/src/claude-code/sdk.ts"))
  const storage = ClaudeCodeSDK.credentialStorage({ CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, home)
  const keychain = process.platform === "darwin" ? Bun.spawnSync(["security", "find-generic-password", "-a", /^[a-zA-Z0-9._-]+$/.test(user) ? user : "claude-code-user", "-w", "-s", storage.service],
    { env: { PATH: process.env.PATH, HOME: home, USER: user }, stdout: "pipe", stderr: "ignore" }) : undefined
  const raw = keychain?.exitCode === 0 ? keychain.stdout.toString() : await Bun.file(storage.file).text().catch(() => "")
  return claudeLoginSecrets(candidate, raw, minimumValidMs)
}
export async function saveEvidence(path: string, value: unknown, secrets: readonly string[], decodeJson?: JsonDecoder) {
  const serialized = serializedEvidence(value, secrets, decodeJson)
  await writeFile(path, serialized.text, { flag: "wx", mode: 0o600 })
  await writeFile(path + ".redaction.json", JSON.stringify(serialized.receipt) + "\n", { flag: "wx", mode: 0o600 })
}
export function admitArm(arm: "E" | "P", startedAt: number, totalDeadlineAt: number, budgetMs = armBudgetMs) {
  requireFact(Number.isSafeInteger(startedAt) && Number.isSafeInteger(totalDeadlineAt) && budgetMs > 0 && totalDeadlineAt - startedAt >= budgetMs, "PAIR_TOTAL_CAP_CANNOT_ADMIT_FULL_ARM")
  return { arm, startedAt, deadlineAt: startedAt + budgetMs, budgetMs, totalDeadlineAt }
}
export function requireArmTime(timing: ReturnType<typeof admitArm>, now = Date.now()) {
  requireFact(now < timing.totalDeadlineAt, "PAIR_TOTAL_DEADLINE")
  requireFact(now < timing.deadlineAt, "PAIR_ARM_DEADLINE")
}

export async function pinNativeAssets(candidate: string, packet: Packet) {
  const root = await canonical(join(candidate, "packages/archie-specialist/skills"), true)
  const visit = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return visit(await canonical(path, true))
    requireFact(entry.isFile(), "PAIR_NATIVE_ASSET_LINK_OR_TYPE_REFUSED")
    return [await canonical(path)]
  }))).flat()
  const paths = [...await visit(root), await canonical(join(candidate, "packages/orchestra/src/agent/prompt/archie.txt"))].sort()
  requireFact(paths.length > 1, "PAIR_NATIVE_ASSETS_EMPTY")
  const pins = await Promise.all(paths.map(async (path) => {
    const suffix = "/" + relative(candidate, path).replaceAll("\\", "/")
    const matches = packet.sources.filter((source) => source.path.endsWith(suffix))
    requireFact(matches.length === 1, `PAIR_NATIVE_ASSET_PACKET_BINDING_MISSING:${suffix}`)
    const bytes = await read(path)
    requireFact(sha256(bytes) === matches[0].sha256 && bytes.length === matches[0].utf8ByteLength, `PAIR_NATIVE_ASSET_BYTES_MISMATCH:${suffix}`)
    requireFact(packet.stages[0].sourceIDs.includes(matches[0].id), "PAIR_NATIVE_ASSET_NOT_SHARED_INITIALLY")
    return { id: matches[0].id, path, sha256: sha256(bytes), utf8ByteLength: bytes.length }
  }))
  requireFact(new Set(pins.map((pin) => pin.id)).size === pins.length, "PAIR_NATIVE_ASSET_BINDING_AMBIGUOUS")
  return pins
}
export type AssetPins = Awaited<ReturnType<typeof pinNativeAssets>>
type Rule = { permission: string; pattern: string; action: "allow" | "deny" }
export function boundaryRules(worktree: string, project: string, localFiles: readonly string[], assets: AssetPins): Rule[] {
  requireFact(assets.length > 0 && [...localFiles, ...assets.map((asset) => asset.path)].every((path) => !/[?*]/.test(path)), "PAIR_BOUNDARY_LITERAL_PATH_REQUIRED")
  return [...["read", "edit", "bash", "glob", "grep", "external_directory", "task", "todowrite"].map((permission) => ({ permission, pattern: "*", action: "deny" as const })),
    // The project folder itself may be listed: stageInventory keeps it flat and limited to revealed sources.
    { permission: "read", pattern: relative(worktree, project).replaceAll("\\", "/"), action: "allow" as const },
    ...[...localFiles, join(project, "proposal.md"), ...assets.map((asset) => asset.path)].map((path) => ({ permission: "read", pattern: relative(worktree, path).replaceAll("\\", "/"), action: "allow" as const })),
    ...[...new Set(assets.map((asset) => dirname(asset.path)))].map((dir) => ({ permission: "external_directory", pattern: join(dir, "*").replaceAll("\\", "/"), action: "allow" as const }))]
}
export async function stageInventory(project: string, expected: readonly { file: string; sha256: string; utf8ByteLength: number }[]) {
  const entries = await readdir(project, { withFileTypes: true })
  requireFact(entries.every((entry) => entry.isFile()) && entries.every((entry) => entry.name === "proposal.md" || expected.some((item) => item.file === entry.name))
    && expected.every((item) => entries.some((entry) => entry.name === item.file)), "PAIR_STAGE_READABLE_INVENTORY_MISMATCH")
  await Promise.all(expected.map(async (item) => {
    const bytes = await read(await canonical(join(project, item.file)))
    requireFact(sha256(bytes) === item.sha256 && bytes.length === item.utf8ByteLength, "PAIR_STAGE_EXPOSED_BYTES_CHANGED")
  }))
  return entries.map((entry) => entry.name).sort()
}
export function requireReadBoundary(input: { worktree: string; allowed: readonly string[]; forbidden: readonly string[]; operations: readonly string[];
  evaluate: (permission: string, pattern: string) => string; tools: readonly string[]; operationGrants: readonly { permission: string; pattern: string }[] }) {
  requireFact(input.allowed.length > 0 && input.forbidden.length > 0 && input.operations.length > 0, "PAIR_BOUNDARY_CHECK_EMPTY")
  input.allowed.forEach((path) => requireFact(input.evaluate("read", relative(input.worktree, path).replaceAll("\\", "/")) === "allow", "PAIR_PINNED_READ_GRANT_MISSING"))
  input.forbidden.forEach((path) => requireFact(input.evaluate("read", relative(input.worktree, path).replaceAll("\\", "/")) === "deny", "PAIR_PRIVATE_READ_BOUNDARY_BYPASS"))
  // Claude Code keeps its own tools; Orchestra's gate asks bash/glob/grep/webfetch/websearch by those names and any other
  // tool under its own name, so an unlisted name stands for that remainder and must fall to the deny default.
  const deniedTools = ["bash", "task", "glob", "grep", "read_mcp_resource", "list_mcp_resources", "list_mcp_resource_templates", "webfetch", "websearch", "claude_code_unlisted_tool"]
  deniedTools.forEach((permission) =>
    requireFact(input.evaluate(permission, "*") === "deny", "PAIR_READ_CAPABLE_TOOL_BYPASS"))
  const methods = ["maestro_arsenal_describe", "maestro_arsenal_execute"]
  input.operations.forEach((operation) => methods.forEach((permission) =>
    requireFact(input.evaluate(permission, operation) === "allow", "PAIR_NATIVE_METHOD_GRANT_MISSING")))
  methods.forEach((permission) => requireFact(input.evaluate(permission, "workflow-execute") === "deny" && input.evaluate(permission, "*") === "deny", "PAIR_WORKFLOW_PERMISSION_BYPASS"))
  requireFact(input.operationGrants.every((grant) => methods.includes(grant.permission) && input.operations.includes(grant.pattern)), "PAIR_NATIVE_OPERATION_GRANT_BYPASS")
  // The engine hands Claude Code Orchestra's read/edit/write and its session-history tools; none reads another file.
  requireFact(input.tools.length > 0 && input.tools.every((tool) => ["read", "edit", "write", "apply_patch", "skill", "maestro_arsenal_catalog", "maestro_arsenal_describe", "maestro_arsenal_execute", "context_recall", "context_compact"].includes(tool)), "PAIR_NATIVE_TOOL_SURFACE_BYPASS")
}

export function requireStageObserved(observed: { calls: number; checks: number; turns: number; result?: unknown }) {
  requireFact(observed.calls === 1 && observed.checks > 0 && observed.turns > 0 && observed.result, "PAIR_STAGE_NATIVE_EXECUTION_INCOMPLETE")
}
// Native retries re-stream the same assistant message, so several records may name one message; none may be missing or foreign.
export function requireTurnBoundaries(messageIDs: readonly string[], records: readonly { assistantMessageID: string; tools: readonly string[] }[]) {
  requireFact(messageIDs.length > 0 && messageIDs.every((id) => records.some((record) => record.assistantMessageID === id)), "PAIR_PROVIDER_TURN_BOUNDARY_MISSING")
  requireFact(records.every((record) => record.tools.length > 0 && messageIDs.includes(record.assistantMessageID)), "PAIR_PROVIDER_TURN_BOUNDARY_UNBOUND")
}
// Stage N+1 resumes stage N: one Orchestra Session and one Claude Code SDK session, four prompts, four replies.
export function requireSameSessionResume(stages: readonly { sessionID: string; claudeSessionID: string; promptMessageID: string; returnedAssistantID: string }[]) {
  requireFact(stages.length === 4 && new Set(stages.map((stage) => stage.sessionID)).size === 1 && new Set(stages.map((stage) => stage.claudeSessionID)).size === 1
    && new Set(stages.map((stage) => stage.promptMessageID)).size === 4 && new Set(stages.map((stage) => stage.returnedAssistantID)).size === 4, "PAIR_SAME_SESSION_RESUME_NOT_OBSERVED")
}
// The card may name the proposal relative to the dispatch base (as writePaths does), to the Session's project directory,
// or to the arm root, since the packet's handoff asks for `project/proposal.md`. It must still resolve to that exact file.
// Direct mode has no Task, so no logical task ID: the work result is the native assembler's (BackendResult.assemble).
export async function requireSuccessfulAuthoring(candidate: string, work: unknown, message: unknown, proposal: string, base: string) {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  const { UpstreamResult } = await import(join(candidate, "packages/orchestra/src/maestro/upstream-result.ts"))
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal("upstream-work-result-v1"),
    card: Schema.Struct({ parsed: Schema.Literal(true), messageID: Schema.NonEmptyString }), outcome: Schema.Literal("done"), terminal: Schema.Struct({ reason: Schema.Literal("ended"), hostDetail: Schema.optional(Schema.Unknown) }),
    blockers: Schema.Array(Schema.Unknown), artifacts: Schema.Array(Schema.Struct({ kind: Schema.String, path: Schema.optional(Schema.String) })), risks: Schema.Array(Schema.String), nextActions: Schema.Array(Schema.String),
    author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.NonEmptyString, messageID: Schema.NonEmptyString }) }))(work)
  requireFact(Option.isSome(decoded) && decoded.value.blockers.length === 0 && decoded.value.terminal.hostDetail === undefined, "PAIR_SUCCESSFUL_WORK_RESULT_REQUIRED")
  const returned = Schema.decodeUnknownOption(Schema.Struct({ info: Schema.Struct({ id: Schema.String, sessionID: Schema.String, role: Schema.Literal("assistant"), agent: Schema.Literal("archie"),
    finish: Schema.NonEmptyString, error: Schema.optional(Schema.Unknown) }), parts: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)) }))(message)
  requireFact(Option.isSome(returned) && returned.value.info.error === undefined && !["tool-calls", "unknown"].includes(returned.value.info.finish), "PAIR_FINISHED_ASSISTANT_REQUIRED")
  requireFact(returned.value.parts.every((part) => part.type !== "tool" || (part.state && typeof part.state === "object" && "status" in part.state && part.state.status === "completed")), "PAIR_COMPLETED_ASSISTANT_TOOLS_REQUIRED")
  const text = returned.value.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n")
  const card = UpstreamResult.parse(text)
  requireFact(card && card.outcome === "done" && card.blockers.length === 0 && card.artifacts.some((artifact: { path?: string }) => artifact.path && [base, dirname(proposal), dirname(dirname(proposal))].some((root) => resolve(root, artifact.path ?? "") === proposal)), "PAIR_CANONICAL_PROPOSAL_CARD_REQUIRED")
  requireFact(decoded.value.author.messageID === returned.value.info.id && decoded.value.card.messageID === returned.value.info.id && decoded.value.author.executionSessionID === returned.value.info.sessionID
    && ["outcome", "artifacts", "blockers", "risks", "nextActions"].every((field) => JSON.stringify(Reflect.get(decoded.value, field)) === JSON.stringify(Reflect.get(card, field))), "PAIR_CANONICAL_WORK_RESULT_MISMATCH")
  return decoded.value
}
export async function requireStoredPrompt(candidate: string, db: Database, sessionID: string, messageID: string, assignment: string) {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  const row = Schema.decodeUnknownOption(Schema.Struct({ data: Schema.String }))(db.query("SELECT data FROM message WHERE session_id=? AND id=?").get(sessionID, messageID))
  requireFact(Option.isSome(row), "PAIR_STORED_CHILD_PROMPT_MISSING")
  const info = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row.value.data)
  requireFact(Option.isSome(info) && Option.isSome(Schema.decodeUnknownOption(Schema.Struct({ role: Schema.Literal("user") }))(info.value)), "PAIR_STORED_CHILD_PROMPT_NOT_USER")
  const rows = Schema.decodeUnknownOption(Schema.Array(Schema.Struct({ data: Schema.String })))(db.query("SELECT data FROM part WHERE session_id=? AND message_id=? ORDER BY id").all(sessionID, messageID))
  requireFact(Option.isSome(rows) && rows.value.length > 0, "PAIR_STORED_CHILD_PROMPT_PARTS_MISSING")
  const parts = rows.value.map((row) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row.data)
    requireFact(Option.isSome(parsed), "PAIR_STORED_CHILD_PROMPT_PART_INVALID")
    const text = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, synthetic: Schema.optional(Schema.Boolean), ignored: Schema.optional(Schema.Boolean) }))(parsed.value)
    requireFact(Option.isSome(text), "PAIR_STORED_CHILD_PROMPT_ATTACHMENT_REFUSED")
    return text.value
  }).filter((part) => !part.synthetic && !part.ignored)
  requireFact(parts.length === 1 && parts[0].text === assignment, "PAIR_STORED_CHILD_PROMPT_ASSIGNMENT_MISMATCH")
}
async function preserveDatabaseEvidence(output: string, arm: string, secrets: readonly string[], decodeJson: JsonDecoder) {
  const path = join(output, "session.db")
  const exists = await lstat(path).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return false; throw error })
  if (!exists) return saveEvidence(join(output, arm, "database-evidence.json"), { available: false, reason: "database-not-created" }, secrets, decodeJson)
  const before = sha256(await Bun.file(path).bytes())
  const db = new Database(path, { readonly: true, strict: true })
  try {
    await saveEvidence(join(output, arm, "database-evidence.json"), { available: true, source: path, originalDatabaseSha256: before, verifierReadOnly: true,
      sessions: db.query("SELECT * FROM session").all(), messages: db.query("SELECT * FROM message").all(), parts: db.query("SELECT * FROM part").all(), events: db.query("SELECT * FROM event").all() }, secrets, decodeJson)
  } finally { db.close() }
  requireFact(sha256(await Bun.file(path).bytes()) === before, "PAIR_ORIGINAL_DATABASE_CHANGED_BY_VERIFIER")
}

async function canonical(value: string | undefined, directory = false) {
  requireFact(value && isAbsolute(value) && !value.split(/[\\/]/).includes(".."), "PAIR_ABSOLUTE_PATH_REQUIRED")
  const path = resolve(value)
  requireFact(await realpath(path) === path, "PAIR_PATH_ALIAS_REFUSED")
  const stat = await lstat(path)
  requireFact((directory ? stat.isDirectory() : stat.isFile()) && stat.uid === process.getuid?.() && !(stat.mode & 0o022), "PAIR_PATH_OWNERSHIP_OR_TYPE_INVALID")
  return path
}

async function read(path: string, privateMode = false) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    requireFact(before.isFile() && before.uid === process.getuid?.() && !(before.mode & (privateMode ? 0o077 : 0o022)) && before.size <= 8 * 1024 * 1024, "PAIR_FILE_MODE_OR_SIZE_INVALID")
    const bytes = await handle.readFile()
    const after = await handle.stat()
    requireFact(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, "PAIR_INPUT_CHANGED_DURING_READ")
    return bytes
  } finally { await handle.close() }
}

function utf8(bytes: Uint8Array) {
  const text = (() => {
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
    catch { throw new PairError("PAIR_UTF8_INVALID") }
  })()
  requireFact(Buffer.from(text).equals(Buffer.from(bytes)), "PAIR_UTF8_ROUNDTRIP_FAILED")
  return text
}

// Exported so refusal probes execute this verifier rather than a second implementation.
export async function verifyPacket(candidate: string, packetPath: string) {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  function decode<S extends Schema.Decoder<unknown>>(schema: S, value: unknown, code: string): S["Type"] {
    const result = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
    requireFact(Option.isSome(result), code)
    return result.value
  }
  const packetBytes = await read(await canonical(packetPath))
  const digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
  const byteLength = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
  const sourceFields = { id: Schema.NonEmptyString, path: Schema.NonEmptyString, sha256: digest, utf8ByteLength: byteLength }
  // Authorized schema-1 successor: enumerate documented metadata, never relax execution fields or excess-property refusal.
  const source = Schema.Union([
    Schema.Struct(sourceFields),
    Schema.Struct({ ...sourceFields, provenance: Schema.Literal("EXACT_HASH_PINNED_RECOVERY"), originalPath: Schema.NonEmptyString, originalSha256: digest }),
    Schema.Struct({ ...sourceFields, provenance: Schema.Literal("FRESH_RECONSTRUCTION_NOT_HISTORICAL_BYTES") }),
  ])
  const packet = decode(Schema.Struct({ schema: Schema.Literal(1),
    status: Schema.optional(Schema.Literal("FRESH_RECONSTRUCTION_UNEXECUTED_NOT_HISTORICAL_SAME_MATERIALS")),
    sourceUniverse: Schema.Array(source),
    globalPath: Schema.NonEmptyString,
    globalSha256: Schema.optional(digest), globalUtf8ByteLength: Schema.optional(byteLength),
    sourceUniverseDigest: Schema.optional(Schema.Struct({ sha256: digest, utf8ByteLength: byteLength,
      encoding: Schema.Literal("UTF-8 JSON of complete sourceUniverse array including optional fields; sort_keys=True; ensure_ascii=False; compact comma/colon separators; array order retained; no trailing LF") })),
    stages: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, requestPath: Schema.NonEmptyString, sourceIDs: Schema.Array(Schema.NonEmptyString),
      requestSha256: Schema.optional(digest), requestUtf8ByteLength: Schema.optional(byteLength) })),
    exposure: Schema.optional(Schema.Struct({
      E: Schema.Struct({ initialSourceIDs: Schema.Array(Schema.NonEmptyString), later: Schema.Literal("retain all; same four request bytes") }),
      P: Schema.Struct({ schedule: Schema.Literal("cumulative stages[].sourceIDs; retain previous exposure") }),
      shared: Schema.Literal("GLOBAL.md initially; all native method and prompt assets at P stage 1; no other readable input"),
      requirementUniverse: Schema.Literal("complete and unchanged from stage 1"),
    })),
    rubricPath: Schema.optional(Schema.NonEmptyString), originalDemandSha256: Schema.optional(digest),
    producerDriverHashAgreement: Schema.optional(Schema.Literal("PRODUCER_HASHES_RECORDED_DRIVER_AGREEMENT_PENDING; preserve optional fields; no driver execution or agreement claimed")),
  }), decode(Schema.UnknownFromJsonString, utf8(packetBytes), "PAIR_PACKET_JSON_INVALID"), "PAIR_PACKET_SCHEMA_INVALID")
  requireFact(packet.stages.length === 4, "PAIR_EXACTLY_FOUR_STAGES_REQUIRED")
  requireFact(packet.sourceUniverse.length > 0, "PAIR_SOURCE_UNIVERSE_EMPTY")
  requireFact(new Set(packet.sourceUniverse.map((item) => item.id)).size === packet.sourceUniverse.length, "PAIR_DUPLICATE_SOURCE_ID")
  requireFact(new Set(packet.stages.map((item) => item.id)).size === 4, "PAIR_DUPLICATE_STAGE_ID")
  requireFact(packet.stages.every((stage) => new Set(stage.sourceIDs).size === stage.sourceIDs.length && stage.sourceIDs.every((id) => packet.sourceUniverse.some((item) => item.id === id))), "PAIR_STAGE_SOURCE_MEMBERSHIP_INVALID")
  requireFact(packet.sourceUniverse.every((item) => !("originalSha256" in item) || (item.originalSha256 === item.sha256
    && isAbsolute(item.originalPath) && !item.originalPath.split(/[\\/]/).includes(".."))), "PAIR_SOURCE_PROVENANCE_INCONSISTENT")
  requireFact((packet.globalSha256 === undefined) === (packet.globalUtf8ByteLength === undefined)
    && packet.stages.every((stage) => (stage.requestSha256 === undefined) === (stage.requestUtf8ByteLength === undefined)), "PAIR_DECLARED_INTEGRITY_FIELDS_INCOMPLETE")
  if (packet.sourceUniverseDigest) {
    const bytes = Buffer.from(JSON.stringify(packet.sourceUniverse.map((item) => Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)))))
    requireFact(sha256(bytes) === packet.sourceUniverseDigest.sha256 && bytes.length === packet.sourceUniverseDigest.utf8ByteLength, "PAIR_SOURCE_UNIVERSE_DIGEST_MISMATCH")
  }
  if (packet.exposure) {
    requireFact(JSON.stringify(packet.exposure.E.initialSourceIDs) === JSON.stringify(packet.sourceUniverse.map((item) => item.id)), "PAIR_E_EXPOSURE_DECLARATION_MISMATCH")
    requireFact(packet.stages.every((stage, index) => packet.stages.slice(0, index).every((prior) => prior.sourceIDs.every((id) => stage.sourceIDs.includes(id)))), "PAIR_P_CUMULATIVE_EXPOSURE_DECLARATION_MISMATCH")
  }
  requireFact(!packet.originalDemandSha256 || packet.sourceUniverse.some((item) => item.id === "fresh-demand" && item.sha256 === packet.originalDemandSha256), "PAIR_ORIGINAL_DEMAND_DECLARATION_MISMATCH")
  const artifact = async (path: string) => {
    requireFact(!path.split(/[\\/]/).includes(".."), "PAIR_ARTIFACT_TRAVERSAL_REFUSED")
    try {
      const absolute = await canonical(isAbsolute(path) ? path : join(dirname(packetPath), path))
      const bytes = await read(absolute)
      requireFact(bytes.length > 0, "PAIR_ARTIFACT_EMPTY")
      return { path: absolute, sha256: sha256(bytes), utf8ByteLength: bytes.length, text: utf8(bytes) }
    } catch (error) {
      if (error instanceof PairError) throw error
      throw new PairError(`PAIR_ARTIFACT_UNAVAILABLE:${path}`)
    }
  }
  const sources = await Promise.all(packet.sourceUniverse.map(async (item, index) => {
    const source = await artifact(item.path)
    requireFact(source.sha256 === item.sha256 && source.utf8ByteLength === item.utf8ByteLength, `PAIR_SOURCE_HASH_OR_LENGTH_MISMATCH:${item.id}`)
    return { ...item, ...source, file: `source-${index + 1}.txt` }
  }))
  requireFact(new Set(sources.map((item) => item.path)).size === sources.length, "PAIR_DUPLICATE_SOURCE_PATH")
  const global = await artifact(packet.globalPath)
  requireFact(packet.globalSha256 === undefined || (packet.globalSha256 === global.sha256 && packet.globalUtf8ByteLength === global.utf8ByteLength), "PAIR_GLOBAL_DECLARED_HASH_OR_LENGTH_MISMATCH")
  const stages = await Promise.all(packet.stages.map(async (item) => {
    const request = await artifact(item.requestPath)
    requireFact(item.requestSha256 === undefined || (item.requestSha256 === request.sha256 && item.requestUtf8ByteLength === request.utf8ByteLength), `PAIR_REQUEST_DECLARED_HASH_OR_LENGTH_MISMATCH:${item.id}`)
    return { ...item, request }
  }))
  const nonModelArtifacts = packet.rubricPath ? [receipt(await artifact(packet.rubricPath))] : []
  requireFact(nonModelArtifacts.every((item) => ![global, ...sources, ...stages.map((stage) => stage.request)].some((input) => input.path === item.path)), "PAIR_BLIND_RUBRIC_IN_MODEL_INPUTS")
  // Retain declarations as evidence only. They do not grant authority or become model prompt text.
  return { schema: 1, packetPath, packetSha256: sha256(packetBytes), declarations: packet, nonModelArtifacts, global, sources, stages }
}
export type Packet = Awaited<ReturnType<typeof verifyPacket>>
const receipt = (item: { path: string; sha256: string; utf8ByteLength: number }) => ({ path: item.path, sha256: item.sha256, utf8ByteLength: item.utf8ByteLength })
async function unchanged(packet: Packet) {
  requireFact(sha256(await read(packet.packetPath)) === packet.packetSha256, "PAIR_PACKET_CHANGED")
  await Promise.all([packet.global, ...packet.sources, ...packet.stages.map((stage) => stage.request), ...packet.nonModelArtifacts].map(async (item) => {
    const bytes = await read(await canonical(item.path))
    requireFact(bytes.length === item.utf8ByteLength && sha256(bytes) === item.sha256, `PAIR_INPUT_CHANGED:${item.path}`)
  }))
}

async function launch(entry: string, candidate: string, env: Record<string, string | undefined>, arm: "E" | "P", totalDeadlineAt: number, budget = armBudgetMs) {
  requireFact(["darwin", "linux"].includes(process.platform), "PAIR_OWNED_GROUP_HOST_UNSUPPORTED")
  const timing = admitArm(arm, Date.now(), totalDeadlineAt, budget)
  const child = spawn(process.execPath, [entry], { cwd: join(candidate, "packages/orchestra"), env: { ...env, PAIR_ARM_STARTED_AT: String(timing.startedAt), PAIR_ARM_BUDGET_MS: String(timing.budgetMs), PAIR_TOTAL_DEADLINE_AT: String(timing.totalDeadlineAt) }, detached: true, stdio: ["ignore", "pipe", "pipe"] })
  const state: { bytes: number; failure?: string; exit?: number | null; signal?: string | null; live?: boolean; groupGone?: boolean; closedAt?: number } = { bytes: 0 }
  const startedAt = timing.startedAt
  const chunks: Buffer[][] = [[], []]
  const alive = () => {
    if (!child.pid || state.groupGone) return false
    try { process.kill(-child.pid, 0); return true } catch (error) {
      requireFact(error instanceof Error && "code" in error && error.code === "ESRCH", "PAIR_GROUP_INSPECTION_FAILED")
      state.groupGone = true
      return false
    }
  }
  const signal = (value: NodeJS.Signals) => {
    if (!child.pid || !alive()) return
    try { process.kill(-child.pid, value) } catch (error) {
      requireFact(error instanceof Error && "code" in error && error.code === "ESRCH", "PAIR_GROUP_SIGNAL_FAILED")
      state.groupGone = true
    }
  }
  const interruption: { timer?: ReturnType<typeof setTimeout> } = {}
  const abort = () => { state.failure = "PAIR_INTERRUPTED"; signal("SIGTERM"); interruption.timer ??= setTimeout(() => signal("SIGKILL"), 3000) }
  process.once("SIGINT", abort); process.once("SIGTERM", abort)
  const timer = setTimeout(() => { state.failure = "PAIR_ARM_DEADLINE"; signal("SIGKILL") }, timing.deadlineAt - Date.now())
  const totalTimer = setTimeout(() => { state.failure = "PAIR_TOTAL_DEADLINE"; signal("SIGKILL") }, timing.totalDeadlineAt - Date.now())
  const drains = [child.stdout, child.stderr].map(async (stream, index) => {
    for await (const part of stream) {
      const bytes = Buffer.from(part)
      state.bytes += bytes.length
      if (state.bytes > outputLimit) { state.failure = "PAIR_OUTPUT_LIMIT"; signal("SIGKILL"); continue }
      chunks[index].push(bytes)
    }
  })
  try {
    state.live = alive()
    requireFact(state.live, "PAIR_GROUP_NOT_LIVE_AT_ADMISSION")
    await new Promise<void>((done) => {
      child.once("close", (code, value) => { state.exit = code; state.signal = value; state.closedAt = Date.now(); done() })
      child.once("error", () => { state.failure = "PAIR_SPAWN_FAILED"; done() })
    })
    await Promise.all(drains)
  } finally {
    clearTimeout(timer)
    clearTimeout(totalTimer)
    clearTimeout(interruption.timer)
    signal("SIGTERM")
    const until = Date.now() + 3000
    while (alive() && Date.now() < until) await Bun.sleep(25)
    signal("SIGKILL")
    const killedUntil = Date.now() + 3000
    while (alive() && Date.now() < killedUntil) await Bun.sleep(25)
    if (alive()) state.failure = "PAIR_GROUP_CLEANUP_FAILED"
    process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort)
  }
  return { stdout: Buffer.concat(chunks[0]).toString("utf8"), stderr: Buffer.concat(chunks[1]).toString("utf8"),
    launcher: { ...state, ...timing, pid: child.pid, startedAt, endedAt: state.closedAt ?? Date.now(), cleanupEndedAt: Date.now(), deadlineMs: budget }, code: state.failure ?? (state.exit === 0 && state.closedAt && state.closedAt <= timing.deadlineAt ? undefined : "PAIR_NATIVE_PROCESS_FAILED_OR_LATE") }
}

async function main() {
  const args = parseArgs({ args: Bun.argv.slice(2), strict: true, allowPositionals: false, options: {
    candidate: { type: "string" }, packet: { type: "string" }, output: { type: "string" }, "archie-engine": { type: "string" }, "archie-model": { type: "string" },
    direct: { type: "boolean" }, "prepare-only": { type: "boolean" }, "preflight-only": { type: "boolean" }, run: { type: "boolean" },
  } }).values
  requireFact([args.run, args["prepare-only"], args["preflight-only"]].filter(Boolean).length === 1, "PAIR_EXACTLY_ONE_MODE_REQUIRED")
  // The legacy Maestro→Task path on Codex is retired: only the direct archie Session on the Claude Code engine runs.
  requireFact(args["archie-engine"] === claude.engine && args.direct === true, "PAIR_DIRECT_CLAUDE_ENGINE_REQUIRED")
  requireFact(args["archie-model"] === model, "PAIR_EXACT_MODEL_REQUIRED")
  const candidate = await canonical(args.candidate, true)
  const packetPath = await canonical(args.packet)
  // Verification precedes output creation, credential inspection and any runtime initialization.
  const packet = await verifyPacket(candidate, packetPath)
  const assets = await pinNativeAssets(candidate, packet)
  const driverSha256 = sha256(await read(await canonical(fileURLToPath(import.meta.url))))
  requireFact(args.output && isAbsolute(args.output) && !args.output.split(/[\\/]/).includes(".."), "PAIR_OUTPUT_ABSOLUTE_PATH_REQUIRED")
  const output = resolve(args.output)
  const parent = await canonical(dirname(output), true)
  requireFact(output !== candidate && !output.startsWith(candidate + "/") && !candidate.startsWith(output + "/")
    && !packetPath.startsWith(output + "/") && ![packet.global, ...packet.sources, ...packet.stages.map((stage) => stage.request), ...packet.nonModelArtifacts].some((item) => item.path.startsWith(output + "/")), "PAIR_OUTPUT_INPUT_OVERLAP")
  requireFact(parent === dirname(output), "PAIR_OUTPUT_PARENT_ALIAS")
  const runtimeHashes = await Promise.all(runtimeFiles.map(async (file) => {
    const path = await canonical(join(candidate, "packages/orchestra/src", file))
    return { path, sha256: sha256(await read(path)) }
  }))
  const git = Bun.spawn(["git", "--no-optional-locks", "-C", candidate, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" })
  const head = (await new Response(git.stdout).text()).trim()
  requireFact(await git.exited === 0 && /^[a-f0-9]{40}$/.test(head), "PAIR_CANDIDATE_HEAD_UNAVAILABLE")
  // `security` finds the login Keychain through $HOME and sdk.ts names the item's account from $USER, so the engine needs
  // both real values. Only a run reads the login (redaction + expiry); preflight checks presence, prepare reads nothing.
  const user = { home: userInfo().homedir, name: userInfo().username }
  const secrets = args.run ? await readClaudeLogin(candidate, user.home, user.name, totalBudgetMs + 15 * 60_000) : []
  const decodeJson = await evidenceDecoder(candidate)
  requireSecretFree({ packet, assets }, secrets, decodeJson)
  process.umask(0o077)
  await mkdir(output, { mode: 0o700 }) // Existing output is refused: no overwrite or mixed-run receipts.
  const save = (file: string, value: unknown) => saveEvidence(join(output, file), value, secrets, decodeJson)
  await save("prepared.json", { schema: 1, packetContract: "schema-1-documented-metadata-successor", candidate, head, ...claude, authConsumerPins: "not-applicable",
    dispatch: "direct-archie", parentSession: null,
    scope: "Native archie authoring on the Claude Code engine. Not a Maestro-to-Task chain: no Maestro Session, model turn, Task call or logical-task binding exists.",
    notApplicable: ["maestro-parent-session", "parent-model", "single-task-call", "task-request-scope", "task-db-row", "logical-task-binding", "legacy-codex-auth-pins"],
    providerTurnBoundary: "SDK turns bypass LLM.stream; PromptGuard.check before each SDK spawn plus Session.updateMessage at each mirrored provider step",
    runtimeHashes, packetPath, packetSha256: packet.packetSha256,
    packetDeclarations: packet.declarations, nonModelArtifacts: packet.nonModelArtifacts, assets, driverSha256,
    global: receipt(packet.global), sources: packet.sources.map((item) => ({ id: item.id, file: item.file, ...receipt(item) })),
    stages: packet.stages.map((item) => ({ id: item.id, sourceIDs: item.sourceIDs, request: receipt(item.request) })),
    armBudgetMs, totalBudgetMs, outputLimitPerArm: outputLimit, judgment: "not-performed", order: ["E", "P"] })
  try {
    await Promise.all(["E", "P"].map(async (arm) => {
      await mkdir(join(output, arm), { mode: 0o700 })
      await mkdir(join(output, arm, "project"), { mode: 0o700 })
      await writeFile(join(output, arm, "project", "global.txt"), packet.global.text, { flag: "wx", mode: 0o400 })
    }))
    const entries = await Promise.all((["E", "P"] as const).map(async (arm) => {
      const program = initializer({ candidate, output, packet, assets, driverSha256, arm, preflightOnly: Boolean(args["preflight-only"]), credentialPaths: credentialPaths(user.home) })
      requireSecretFree(program, secrets, decodeJson)
      new Bun.Transpiler({ loader: "ts" }).transformSync(program)
      const entry = join(output, "initializer-" + arm + ".ts")
      await writeFile(entry, program, { flag: "wx", mode: 0o600 })
      return { arm, entry }
    }))
    if (args["prepare-only"]) { console.log(JSON.stringify({ code: "PAIR_PREPARED_NO_MODEL", output })); return }
    const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
    const env: Record<string, string | undefined> = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(output, key.toLowerCase())]))
    await Promise.all(Object.values(env).filter((path): path is string => typeof path === "string").map((path) => mkdir(path, { mode: 0o700 })))
    Object.assign(env, { PATH: process.env.PATH, ORCHESTRA_DB: join(output, "session.db"), ORCHESTRA_CONFIG: join(output, "config.json"),
      ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_TEST_HOME: env.HOME, TMP: env.TMPDIR, TEMP: env.TMPDIR })
    // Orchestra state stays isolated (ORCHESTRA_TEST_HOME, XDG_*); Claude Code state goes to a per-arm CLAUDE_CONFIG_DIR, and
    // the empty secure-storage directory keeps sdk.ts on the unsuffixed "Claude Code-credentials" item. "~" in permission
    // patterns now means the real home.
    Object.assign(env, { HOME: user.home, USER: user.name, CLAUDE_SECURESTORAGE_CONFIG_DIR: "" })
    await Promise.all(["E", "P"].map((arm) => mkdir(join(output, "claude-" + arm), { mode: 0o700 })))
    await writeFile(String(env.ORCHESTRA_CONFIG), JSON.stringify({ model, default_agent: "maestro", agent: { maestro: { permission: { "*": "deny", task: { "*": "deny", archie: "allow" } } },
      archie: { engine: claude.engine, model } } }) + "\n", { flag: "wx", mode: 0o600 })
    await unchanged(packet)
    const pairStartedAt = Date.now()
    const totalDeadlineAt = pairStartedAt + (args.run ? totalBudgetMs : 3 * 60_000)
    const launched = []
    for (const item of entries) {
      const result = await launch(item.entry, candidate, { ...env, CLAUDE_CONFIG_DIR: join(output, "claude-" + item.arm) }, item.arm, totalDeadlineAt, args["preflight-only"] ? 60_000 : armBudgetMs)
      launched.push(result)
      await save(item.arm + "/launcher.json", result.launcher)
      await save(item.arm + "/stdout.json", { text: result.stdout })
      await save(item.arm + "/stderr.json", { text: result.stderr })
      await preserveDatabaseEvidence(output, item.arm, secrets, decodeJson)
      requireFact(!result.code, result.code ?? "PAIR_PROCESS_FAILED")
    }
    await save("pair-timing.json", { pairStartedAt, totalDeadlineAt, endedAt: Date.now(), armBudgetMs, totalBudgetMs, arms: launched.map((item) => item.launcher) })
    await unchanged(packet)
    await Promise.all(runtimeHashes.map(async (item) =>
      requireFact(sha256(await read(await canonical(item.path))) === item.sha256, `PAIR_CANDIDATE_SOURCE_CHANGED:${item.path}`)))
    if (args["preflight-only"]) {
      const events = launched.flatMap((result) => result.stdout.split("\n")).flatMap((line) => {
        const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
        if (Option.isNone(parsed)) return []
        const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("pair_preflight"), arm: Schema.Literals(["E", "P"]), dispatch: Schema.Literal("direct-archie"), parentSessionID: Schema.Null, sessionID: Schema.String }))(parsed.value)
        return Option.isSome(event) ? [event.value] : []
      })
      requireFact(events.length === 2 && new Set(events.map((event) => event.arm)).size === 2 && new Set(events.map((event) => event.sessionID)).size === 2, "PAIR_PREFLIGHT_RECORDS_MISSING_OR_AMBIGUOUS")
      await save("status.json", { code: "PAIR_PREFLIGHT_COMPLETED_NO_MODEL" }); console.log(JSON.stringify({ code: "PAIR_PREFLIGHT_COMPLETED_NO_MODEL", output })); return
    }
    await verifyDatabase(candidate, output, packet, secrets, totalDeadlineAt)
    requireFact(Date.now() < totalDeadlineAt, "PAIR_TOTAL_DEADLINE")
    await save("status.json", { code: "PAIR_NATIVE_RESULTS_OBSERVED", judgment: "not-performed" })
    console.log(JSON.stringify({ code: "PAIR_NATIVE_RESULTS_OBSERVED", output, judgment: "not-performed" }))
  } catch (error) {
    await save("failure.json", { code: safeCode(error), judgment: "not-performed" })
    throw error
  }
}

async function verifyDatabase(candidate: string, output: string, packet: Packet, secrets: string[], totalDeadlineAt: number) {
  const db = new Database(join(output, "session.db"), { readonly: true, strict: true })
  const decodeJson = await evidenceDecoder(candidate)
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  function decode<S extends Schema.Decoder<unknown>>(schema: S, value: unknown, code: string): S["Type"] {
    const result = Schema.decodeUnknownOption(schema)(value)
    requireFact(Option.isSome(result), code)
    return result.value
  }
  const json = (text: string) => decode(Schema.UnknownFromJsonString, text, "PAIR_DB_JSON_INVALID")
  const rowSchema = Schema.Struct({ id: Schema.String, data: Schema.String })
  const sessionSchema = Schema.Struct({ id: Schema.String, parent_id: Schema.NullOr(Schema.String), project_id: Schema.String, directory: Schema.String, agent: Schema.String, permission: Schema.String, metadata: Schema.NullOr(Schema.String) })
  try {
    const arms = await Promise.all(["E", "P"].map(async (arm) => {
      const stages = await Promise.all(packet.stages.map(async (stage, index) => {
        const root = join(output, arm, `stage-${index + 1}`)
        const nativeBytes = await read(await canonical(join(root, "native.json")))
        requireFact(!secrets.some((secret) => nativeBytes.includes(Buffer.from(secret))), "PAIR_RAW_RESULT_SECRET_BEARING")
        const native = decode(Schema.Struct({ dispatch: Schema.Literal("direct-archie"), parentSessionID: Schema.Null, sessionID: Schema.String, promptMessageID: Schema.String, claudeSessionID: Schema.String,
          worktree: Schema.String, assignment: Schema.String, assignmentSha256: Schema.String, turns: Schema.Int, checks: Schema.Int, dispatchBase: Schema.String, requestSha256: Schema.String,
          proposalSha256: Schema.String, proposalBytes: Schema.Int, revealedSourceIDs: Schema.Array(Schema.String), workResult: Schema.Unknown }), json(utf8(nativeBytes)), "PAIR_STAGE_RECEIPT_INVALID")
        requireFact(native.requestSha256 === stage.request.sha256 && native.assignment.endsWith(stage.request.text) && native.assignmentSha256 === sha256(Buffer.from(native.assignment)), "PAIR_STAGE_REQUEST_CHANGED")
        const session = decode(sessionSchema, db.query("SELECT id,parent_id,project_id,directory,agent,permission,metadata FROM session WHERE id=?").get(native.sessionID), "PAIR_DIRECT_SESSION_DB_MISSING")
        requireFact(session.parent_id === null && session.agent === "archie" && session.directory === join(output, arm, "project"), "PAIR_DB_DIRECT_SESSION_MISMATCH")
        // ClaudeCode.turn stores the SDK session it resumes; a fresh SDK session per stage would replace it.
        const metadata = decode(Schema.Struct({ claudeCode: Schema.Struct({ sessionId: Schema.NonEmptyString }) }), json(session.metadata ?? ""), "PAIR_DB_CLAUDE_SESSION_MISSING")
        requireFact(metadata.claudeCode.sessionId === native.claudeSessionID, "PAIR_DB_CLAUDE_SESSION_MISMATCH")
        const rules = decode(Schema.Array(Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Schema.String })), json(session.permission), "PAIR_PERSISTED_CHILD_RULES_INVALID")
        const proposalPath = join(session.directory, "proposal.md")
        const proposalPattern = relative(native.worktree, proposalPath).replaceAll("\\", "/")
        requireFact(JSON.stringify(rules.filter((rule) => rule.permission === "tool_safety_write_root" && rule.action === "allow").map((rule) => rule.pattern)) === JSON.stringify([proposalPath])
          && rules.some((rule) => rule.permission === "edit" && rule.pattern === "*" && rule.action === "deny")
          && rules.findLast((rule) => rule.permission === "edit" && ["*", proposalPattern].includes(rule.pattern))?.action === "allow"
          && rules.some((rule) => rule.permission === "bash" && rule.pattern === "*" && rule.action === "deny"), "PAIR_PERSISTED_CHILD_SCOPE_MISMATCH")
        const work = decode(Schema.Struct({ author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.String, messageID: Schema.String }), card: Schema.Struct({ messageID: Schema.String }) }), native.workResult, "PAIR_STAGE_WORK_RESULT_INVALID")
        requireFact(work.author.executionSessionID === session.id && work.author.messageID === work.card.messageID, "PAIR_STAGE_WORK_RESULT_BINDING_MISMATCH")
        const message = decode(Schema.Struct({ session_id: Schema.String, data: Schema.String }), db.query("SELECT session_id,data FROM message WHERE id=?").get(work.author.messageID), "PAIR_ASSISTANT_DB_MISSING")
        const info = decode(Schema.Struct({ role: Schema.Literal("assistant"), agent: Schema.Literal("archie"), providerID: Schema.String, modelID: Schema.String, parentID: Schema.String }), json(message.data), "PAIR_ASSISTANT_IDENTITY_INVALID")
        requireFact(message.session_id === session.id && info.providerID + "/" + info.modelID === model, "PAIR_ASSISTANT_MODEL_OR_SESSION_MISMATCH")
        const storedParts = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? ORDER BY id").all(session.id, work.author.messageID), "PAIR_ASSISTANT_PARTS_INVALID")
        const assistant = { info: { ...decode(Schema.Record(Schema.String, Schema.Unknown), json(message.data), "PAIR_ASSISTANT_INFO_INVALID"), id: work.author.messageID, sessionID: session.id }, parts: storedParts.map((row) => json(row.data)) }
        await saveEvidence(join(root, "stored-assistant-evidence.json"), assistant, secrets, decodeJson)
        requireFact(info.parentID === native.promptMessageID, "PAIR_STORED_CHILD_PROMPT_ID_MISMATCH")
        await requireStoredPrompt(candidate, db, session.id, info.parentID, native.assignment)
        await requireSuccessfulAuthoring(candidate, native.workResult, assistant, proposalPath, native.dispatchBase)
        const texts = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='text' ORDER BY id").all(session.id, work.author.messageID), "PAIR_ASSISTANT_TEXT_ROWS_INVALID")
        const returned = texts.map((row) => decode(Schema.Struct({ text: Schema.String }), json(row.data), "PAIR_ASSISTANT_TEXT_INVALID").text).join("\n")
        requireFact(returned.length > 0 && !secrets.some((secret) => returned.includes(secret)), "PAIR_ASSISTANT_EMPTY_OR_SECRET_BEARING")
        await saveEvidence(join(root, "returned-assistant.json"), { text: returned, originalUtf8Sha256: sha256(Buffer.from(returned)), originalUtf8ByteLength: Buffer.byteLength(returned) }, secrets, decodeJson)
        const proposal = await read(await canonical(join(root, "proposal.md")))
        utf8(proposal)
        requireFact(proposal.length === native.proposalBytes && sha256(proposal) === native.proposalSha256 && !secrets.some((secret) => proposal.includes(Buffer.from(secret))), "PAIR_PROPOSAL_SNAPSHOT_MISMATCH_OR_SECRET")
        // Collect every stored provider step belonging to this stage prompt, including tool turns.
        const messages = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM message WHERE session_id=? AND json_extract(data,'$.role')='assistant' AND json_extract(data,'$.parentID')=? ORDER BY id").all(session.id, info.parentID), "PAIR_USAGE_MESSAGE_ROWS_INVALID")
        requireFact(messages.length > 0, "PAIR_STAGE_PROVIDER_MESSAGES_MISSING")
        const premodel = decode(Schema.Struct({ sessionID: Schema.String, promptMessageID: Schema.String }), json(utf8(await read(await canonical(join(root, "pre-model-boundary.json"))))), "PAIR_PRE_MODEL_BOUNDARY_RECORD_INVALID")
        requireFact(native.checks === 1 && premodel.sessionID === session.id && premodel.promptMessageID === native.promptMessageID, "PAIR_PRE_MODEL_BOUNDARY_RECORD_MISMATCH")
        const boundaries = await Promise.all((await readdir(root)).filter((file) => /^provider-boundary-\d+\.json$/.test(file)).map(async (file) =>
          decode(Schema.Struct({ assistantMessageID: Schema.String, tools: Schema.Array(Schema.String) }), json(utf8(await read(await canonical(join(root, file))))), "PAIR_PROVIDER_BOUNDARY_RECORD_INVALID")))
        requireFact(boundaries.length === native.turns, "PAIR_PROVIDER_BOUNDARY_RECORD_COUNT_MISMATCH")
        requireTurnBoundaries(messages.map((row) => row.id), boundaries)
        const steps = messages.flatMap((msg) => decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='step-finish' ORDER BY id").all(session.id, msg.id), "PAIR_STEP_ROWS_INVALID").map((row) => {
          const stored = decode(Schema.Record(Schema.String, Schema.Unknown), json(row.data), "PAIR_STEP_DATA_INVALID")
          const tokens = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(stored.tokens)
          const cache = Option.isSome(tokens) ? Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(tokens.value.cache) : Option.none()
          const missingFields = [...["total", "input", "output", "reasoning", "cache"].filter((field) => Option.isNone(tokens) || !Object.hasOwn(tokens.value, field)),
            ...["read", "write"].filter((field) => Option.isNone(cache) || !Object.hasOwn(cache.value, field)).map((field) => "cache." + field)]
          return { messageID: msg.id, partID: row.id, stored, missingFields }
        }))
        const evidence = { arm, index, id: stage.id, ...native, returnedAssistantID: work.author.messageID, promptMessageID: info.parentID,
          returnedAssistantSha256: sha256(Buffer.from(returned)), providerMessages: messages.map((row) => ({ id: row.id, stored: json(row.data) })),
          // The mirror writes per-step token counts with cost 0 and puts the SDK's turn cost on the last step's message.
          usage: { scope: "native-archie-session-only", source: "stored-step-finish", turnCost: "stored assistant info.cost (SDK total_cost_usd delta)", steps, missingness: steps.length === 0 ? "no-stored-step-finish" : "per-step-missingFields-no-inferred-counts" },
          inputs: [receipt(packet.global), ...packet.sources.map(receipt), ...packet.stages.map((item) => receipt(item.request))], judgment: "not-performed" }
        await saveEvidence(join(root, "verified.json"), evidence, secrets, decodeJson)
        return evidence
      }))
      requireSameSessionResume(stages)
      const prompts = decode(Schema.Array(Schema.Struct({ id: Schema.String })), db.query("SELECT id FROM message WHERE session_id=? AND json_extract(data,'$.role')='user' ORDER BY id").all(stages[0].sessionID), "PAIR_SESSION_PROMPT_ROWS_INVALID")
      requireFact(JSON.stringify(prompts.map((row) => row.id)) === JSON.stringify(stages.map((stage) => stage.promptMessageID)), "PAIR_SESSION_EXTRA_OR_MISSING_PROMPTS")
      const children = decode(Schema.Array(Schema.Struct({ id: Schema.String })), db.query("SELECT id FROM session WHERE parent_id=?").all(stages[0].sessionID), "PAIR_NATIVE_CHILD_ROWS_INVALID")
      requireFact(children.length === 0, "PAIR_UNEXPECTED_CHILD_SESSION")
      return { arm, stages }
    }))
    const sessions = decode(Schema.Array(Schema.Struct({ id: Schema.String })), db.query("SELECT id FROM session ORDER BY id").all(), "PAIR_SESSION_ROWS_INVALID")
    requireFact(sessions.length === 2 && arms.every((item) => sessions.some((row) => row.id === item.stages[0].sessionID)), "PAIR_EXTRA_OR_MISSING_SESSION")
    requireFact(arms[0].stages[0].sessionID !== arms[1].stages[0].sessionID && arms[0].stages[0].claudeSessionID !== arms[1].stages[0].claudeSessionID, "PAIR_ARMS_NOT_INDEPENDENT")
    const settings = await Promise.all(["E", "P"].map(async (arm) => {
      const raw = json(utf8(await read(await canonical(join(output, arm, "native-settings.json")))))
      const timing = decode(Schema.Struct({ timing: Schema.Struct({ startedAt: Schema.Int, deadlineAt: Schema.Int, budgetMs: Schema.Int, totalDeadlineAt: Schema.Int }) }), raw, "PAIR_ARM_TIMING_MISSING").timing
      requireFact(timing.budgetMs === armBudgetMs && timing.deadlineAt - timing.startedAt === armBudgetMs, "PAIR_ARM_BUDGET_NOT_EQUAL")
      return decode(Schema.Struct({ archie: Schema.Unknown, engine: Schema.Unknown, toolIDs: Schema.Array(Schema.String) }), raw, "PAIR_NATIVE_SETTINGS_MISSING")
    }))
    requireFact(JSON.stringify(settings[0]) === JSON.stringify(settings[1]), "PAIR_NATIVE_SETTINGS_OR_TOOLS_DIFFER")
    requireFact(Date.now() < totalDeadlineAt, "PAIR_TOTAL_DEADLINE")
    await saveEvidence(join(output, "results.json"), { schema: 1, ...claude, dispatch: "direct-archie", parentSession: null, arms, judgment: "not-performed", benefit: "not-assessed", approval: "not-assessed" }, secrets, decodeJson)
  } finally { db.close() }
}

if (import.meta.main) await main().catch((error: unknown) => { console.error(safeCode(error).split(":")[0]); process.exitCode = 1 })

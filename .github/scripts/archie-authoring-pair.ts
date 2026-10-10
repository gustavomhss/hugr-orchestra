#!/usr/bin/env bun
import { Database } from "bun:sqlite"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import type { Schema } from "effect"

// Observation wrapper, not an approval/benefit gate. No inference in prepare/preflight modes.
const selectedAuth = "/Users/gustavoschneiter/.local/share/opencode/auth.json"
const model = "openai/gpt-6.1-sol"
export const armBudgetMs = 20 * 60_000
export const totalBudgetMs = 2 * armBudgetMs + 2 * 60_000
const outputLimit = 32 * 1024 * 1024
const authPins = [
  ["auth/index.ts", "4b9ac63bd8a69c6cd6e554bcde95908246ee9cef"],
  ["plugin/openai/codex.ts", "97f34ae2b4420014b61f0f3a1574aa10dff4e434"],
  ["plugin/openai/siwc.ts", "203e07b88371a420db664c01e7796401cbad44df"],
  ["plugin/openai/legacy-codex-readonly.ts", "5e357d979ab74a6415821bd7747bf47d35ebceba"],
  ["plugin/index.ts", "40133ca0a23d93afe20e5e53d6e6a67ce5919bf5"],
] as const
const consumerSourceReview = { reviewer: "W6", verdict: "SOURCE_APPROVE", file: "packages/orchestra/src/plugin/index.ts",
  blob: "40133ca0a23d93afe20e5e53d6e6a67ce5919bf5", runtimeQualification: "pending" }
const runtimeFiles = ["agent/agent.ts", "agent/subagent-permissions.ts", "tool/task.ts", "tool/registry.ts", "session/prompt.ts",
  "session/task-prompt-ops.ts", "session/prompt-guard.ts", "maestro/seats/archie.ts", "maestro/roster.ts", "maestro/write-roots.ts",
  "maestro/logical-task.ts", "maestro/backend-work.ts", "maestro/backend-result.ts", "effect/app-runtime.ts"]
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const blob = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
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
  const original = JSON.stringify(value)
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
  const text = JSON.stringify(walk(value)) + "\n"
  requireFact(!secrets.some((secret) => text.includes(secret)), "PAIR_EVIDENCE_REDACTION_FAILED")
  return { text, receipt: { redacted: text !== original + "\n", secretScanPerformed: secrets.length > 0, replacement: "empty-string",
    originalSha256: sha256(Buffer.from(original + "\n")), originalUtf8ByteLength: Buffer.byteLength(original + "\n"),
    writtenSha256: sha256(Buffer.from(text)), writtenUtf8ByteLength: Buffer.byteLength(text), originalDatabase: "retained-unmodified" } }
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
type AssetPins = Awaited<ReturnType<typeof pinNativeAssets>>
type Rule = { permission: string; pattern: string; action: "allow" | "deny" }
export function boundaryRules(worktree: string, project: string, localFiles: readonly string[], assets: AssetPins): Rule[] {
  requireFact(assets.length > 0 && [...localFiles, ...assets.map((asset) => asset.path)].every((path) => !/[?*]/.test(path)), "PAIR_BOUNDARY_LITERAL_PATH_REQUIRED")
  return [...["read", "edit", "bash", "glob", "grep", "external_directory", "task", "todowrite"].map((permission) => ({ permission, pattern: "*", action: "deny" as const })),
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
  evaluate: (permission: string, pattern: string) => string; tools?: readonly string[]; operationGrants: readonly { permission: string; pattern: string }[] }) {
  requireFact(input.allowed.length > 0 && input.forbidden.length > 0 && input.operations.length > 0, "PAIR_BOUNDARY_CHECK_EMPTY")
  input.allowed.forEach((path) => requireFact(input.evaluate("read", relative(input.worktree, path).replaceAll("\\", "/")) === "allow", "PAIR_PINNED_READ_GRANT_MISSING"))
  input.forbidden.forEach((path) => requireFact(input.evaluate("read", relative(input.worktree, path).replaceAll("\\", "/")) === "deny", "PAIR_PRIVATE_READ_BOUNDARY_BYPASS"))
  const deniedTools = ["bash", "task", "glob", "grep", "read_mcp_resource", "list_mcp_resources", "list_mcp_resource_templates"]
  deniedTools.forEach((permission) =>
    requireFact(input.evaluate(permission, "*") === "deny", "PAIR_READ_CAPABLE_TOOL_BYPASS"))
  const methods = ["maestro_arsenal_describe", "maestro_arsenal_execute"]
  input.operations.forEach((operation) => methods.forEach((permission) =>
    requireFact(input.evaluate(permission, operation) === "allow", "PAIR_NATIVE_METHOD_GRANT_MISSING")))
  methods.forEach((permission) => requireFact(input.evaluate(permission, "workflow-execute") === "deny" && input.evaluate(permission, "*") === "deny", "PAIR_WORKFLOW_PERMISSION_BYPASS"))
  requireFact(input.operationGrants.every((grant) => methods.includes(grant.permission) && input.operations.includes(grant.pattern)), "PAIR_NATIVE_OPERATION_GRANT_BYPASS")
  if (input.tools) requireFact(input.tools.every((tool) => ["read", "edit", "write", "apply_patch", "skill", "maestro_arsenal_catalog", "maestro_arsenal_describe", "maestro_arsenal_execute"].includes(tool)), "PAIR_NATIVE_TOOL_SURFACE_BYPASS")
}

export async function requireSuccessfulAuthoring(candidate: string, work: unknown, message: unknown, proposal: string) {
  const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
  const { UpstreamResult } = await import(join(candidate, "packages/orchestra/src/maestro/upstream-result.ts"))
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal("upstream-work-result-v1"), taskId: Schema.NonEmptyString,
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
  requireFact(card && card.outcome === "done" && card.blockers.length === 0 && card.artifacts.some((artifact: { path?: string }) => artifact.path && resolve(dirname(proposal), artifact.path) === proposal), "PAIR_CANONICAL_PROPOSAL_CARD_REQUIRED")
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
type Packet = Awaited<ReturnType<typeof verifyPacket>>
const receipt = (item: { path: string; sha256: string; utf8ByteLength: number }) => ({ path: item.path, sha256: item.sha256, utf8ByteLength: item.utf8ByteLength })
async function unchanged(packet: Packet) {
  requireFact(sha256(await read(packet.packetPath)) === packet.packetSha256, "PAIR_PACKET_CHANGED")
  await Promise.all([packet.global, ...packet.sources, ...packet.stages.map((stage) => stage.request), ...packet.nonModelArtifacts].map(async (item) => {
    const bytes = await read(await canonical(item.path))
    requireFact(bytes.length === item.utf8ByteLength && sha256(bytes) === item.sha256, `PAIR_INPUT_CHANGED:${item.path}`)
  }))
}

export function initializer(job: { candidate: string; output: string; packet: Packet; assets: AssetPins; driverSha256: string; arm: "E" | "P"; preflightOnly: boolean }) {
  // Real services and native Task are never substituted. Wrappers only assert boundaries/capture facts.
  return `import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { mkdir, realpath, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
const job = ${JSON.stringify(job)}
const model = ${JSON.stringify(model)}
const requireCandidate = createRequire(job.candidate + "/packages/orchestra/package.json")
const { Effect, ManagedRuntime, Option, Schema, Stream } = await import(requireCandidate.resolve("effect"))
const driverPath = ${JSON.stringify(fileURLToPath(import.meta.url))}
const driverSha256 = ${JSON.stringify(job.driverSha256)}
const { secretForms, evidenceDecoder, requireSecretFree, serializedEvidence, saveEvidence, admitArm, requireArmTime, boundaryRules, stageInventory, requireReadBoundary, requireSuccessfulAuthoring } = await import(driverPath)
const decodeJson = await evidenceDecoder(job.candidate)
const authStore = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(process.env.ORCHESTRA_AUTH_CONTENT)
fact(Option.isSome(authStore), "PAIR_AUTH_CONTENT_INVALID")
const auth = Schema.decodeUnknownOption(Schema.Struct({ openai: Schema.Struct({ access: Schema.String, refresh: Schema.String, accountId: Schema.optional(Schema.String) }) }))(authStore.value)
fact(Option.isSome(auth), "PAIR_AUTH_CONTENT_INVALID")
const secrets = secretForms([auth.value.openai.access, auth.value.openai.refresh, ...(auth.value.openai.accountId ? [auth.value.openai.accountId] : [])])
requireSecretFree({ global: job.packet.global, sources: job.packet.sources, stages: job.packet.stages }, secrets, decodeJson)
const redact = (text: string) => secrets.reduce((result, secret) => result.split(secret).join(""), text)
const { ChildProcess, ChildProcessSpawner } = await import(requireCandidate.resolve("effect/unstable/process"))
const { CrossSpawnSpawner } = await import(job.candidate + "/packages/core/src/cross-spawn-spawner.ts")
const { LayerNode } = await import(job.candidate + "/packages/core/src/effect/layer-node.ts")
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
const { validateLegacyCodexReadonlyAuth } = await import(job.candidate + "/packages/orchestra/src/plugin/openai/legacy-codex-readonly.ts")
validateLegacyCodexReadonlyAuth()
const { AppRuntime } = await import(job.candidate + "/packages/orchestra/src/effect/app-runtime.ts")
try {
const { InstanceStore } = await import(job.candidate + "/packages/orchestra/src/project/instance-store.ts")
const { InstanceRef } = await import(job.candidate + "/packages/orchestra/src/effect/instance-ref.ts")
const { Agent } = await import(job.candidate + "/packages/orchestra/src/agent/agent.ts")
const { Session } = await import(job.candidate + "/packages/orchestra/src/session/session.ts")
const { SessionPrompt } = await import(job.candidate + "/packages/orchestra/src/session/prompt.ts")
const { ToolRegistry } = await import(job.candidate + "/packages/orchestra/src/tool/registry.ts")
const { WriteRoots } = await import(job.candidate + "/packages/orchestra/src/maestro/write-roots.ts")
const { Permission } = await import(job.candidate + "/packages/orchestra/src/permission/index.ts")
const { Wildcard } = await import(job.candidate + "/packages/core/src/util/wildcard.ts")
const { Seats } = await import(job.candidate + "/packages/orchestra/src/maestro/seats/index.ts")
const { SeatSkillRoot } = await import(job.candidate + "/packages/orchestra/src/maestro/seat-skill-root.ts")
const { UpstreamArsenal } = await import(job.candidate + "/packages/core/src/tool/upstream-arsenal.ts")
const { LLM } = await import(job.candidate + "/packages/orchestra/src/session/llm.ts")
type TaskPromptOps = import(${JSON.stringify(join(job.candidate, "packages/orchestra/src/tool/task.ts"))}).TaskPromptOps
function isOps(value: unknown): value is TaskPromptOps {
  return !!value && typeof value === "object" && "prompt" in value && typeof value.prompt === "function"
    && "cancel" in value && typeof value.cancel === "function" && "resolvePromptParts" in value && typeof value.resolvePromptParts === "function"
}
const loaded = await AppRuntime.runPromise(Effect.gen(function* () {
  const git = yield* Git.Service
  const store = yield* InstanceStore.Service
  fact(git === seeded.git && seeded.processes.spawn === groupSpawner.spawn, "PAIR_CONTAINED_GIT_NOT_BOUND")
  return { store }
}))
// Sequential arms avoid cross-arm tool wrapping; each has an independent Instance, parent, child and proposal.
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
    const llm = yield* LLM.Service
    const archie = yield* agents.get("archie")
    const maestro = yield* agents.get("maestro")
    const named = yield* registry.named()
    fact(archie.native === true && archie.mode === "subagent" && maestro.native === true && maestro.mode === "primary"
      && Seats.find("archie")?.profileKey === "upstream" && Seats.find("archie")?.strictResume === true && named.task.id === "task", "PAIR_NATIVE_ABI_MISMATCH")
    fact(SeatSkillRoot.roots.archie === job.candidate + "/packages/archie-specialist/skills", "PAIR_NATIVE_SKILL_ROOT_UNPINNED")
    const denies = boundaryRules(placement.worktree, project, [join(project, "global.txt")], job.assets).filter((rule) => rule.permission !== "task")
    const parent = yield* sessions.create({ agent: "maestro", title: "archie-pair-" + arm, permission: denies })
    yield* sessions.setPermission({ sessionID: parent.id, permission: denies })
    return { agents, sessions, prompts, llm, task: named.task, parent, denies, archie, maestro, toolIDs: Object.keys(named) }
  }))
  const base = await realpath(placement.worktree === "/" ? placement.directory : placement.worktree)
  const proposal = join(project, "proposal.md")
  const dispatchPath = relative(base, proposal).replaceAll("\\\\", "/")
  const pattern = relative(placement.worktree, proposal).replaceAll("\\\\", "/")
  fact(dispatchPath && !dispatchPath.split("/").includes(".."), "PAIR_WRITE_ROOT_OUTSIDE_WORKTREE")
  await run(Effect.gen(function* () {
    const rules = yield* WriteRoots.bind("archie", [dispatchPath], services.denies)
    fact(JSON.stringify(WriteRoots.read(rules)) === JSON.stringify([proposal]), "PAIR_WRITE_ROOT_BINDING_INVALID")
  }))
  emit({ type: "pair_preflight", arm, parentSessionID: services.parent.id, projectID: services.parent.projectID, worktree: placement.worktree, project, dispatchPath })
  await save(join(root, "native-settings.json"), { archie: services.archie, maestro: services.maestro, toolIDs: services.toolIDs, parent: services.parent, denies: services.denies, dispatchPath, worktree: placement.worktree, timing, assets: job.assets })
  if (job.preflightOnly) continue
  const state: { index: number; calls: number; checks: number; turns: number; child?: string; logical?: string; prompt?: string; result?: unknown; childReturned?: unknown; childPromptID?: string; parentMessageID?: string; callID?: string } = { index: 0, calls: 0, checks: 0, turns: 0 }
  const revealed = new Set<string>()
  const expectedLocal = () => [{ file: "global.txt", sha256: job.packet.global.sha256, utf8ByteLength: job.packet.global.utf8ByteLength }, ...job.packet.sources.filter((source) => revealed.has(source.id))]
  const localFiles = () => expectedLocal().map((source) => join(project, source.file))
  const blockedPaths = () => [job.packet.packetPath, job.packet.global.path, ...job.packet.sources.flatMap((source) => [source.path, ...("originalPath" in source ? [source.originalPath] : [])]),
    ...job.packet.stages.map((stage) => stage.request.path), ...job.packet.nonModelArtifacts.map((item) => item.path), driverPath, join(job.output, "initializer-" + arm + ".ts"),
    join(job.output, "session.db"), join(job.output, "config.json"), ${JSON.stringify(selectedAuth)}, ...["E", "P"].filter((other) => other !== arm).flatMap((other) => [join(job.output, "initializer-" + other + ".ts"), join(job.output, other, "project", "global.txt"), join(job.output, other, "project", "proposal.md"), ...job.packet.sources.map((source) => join(job.output, other, "project", source.file))]),
    ...job.packet.sources.filter((source) => !revealed.has(source.id)).map((source) => join(project, source.file))]
  const boundary = async (bound: { permission?: import(${JSON.stringify(join(job.candidate, "packages/core/src/v1/permission.ts"))}).PermissionV1.Ruleset }, tools?: string[]) => {
    requireArmTime(timing)
    await verifyInputs()
    const inventory = await stageInventory(project, expectedLocal())
    const expectedRules = [...boundaryRules(placement.worktree, project, localFiles(), job.assets), { permission: "edit", pattern, action: "allow" }]
    fact(JSON.stringify((bound.permission ?? []).filter((rule) => rule.permission !== "tool_safety_write_root")) === JSON.stringify(expectedRules), "PAIR_CHILD_PERMISSION_DRIFT")
    requireReadBoundary({ worktree: placement.worktree, allowed: [...localFiles(), proposal, ...job.assets.map((asset) => asset.path)], forbidden: blockedPaths(), operations: UpstreamArsenal.UPSTREAM_AUTHORING_OPERATIONS,
      operationGrants: [...services.archie.permission, ...(bound.permission ?? [])].filter((rule) => rule.action === "allow" && ["maestro_arsenal_describe", "maestro_arsenal_execute"].some((permission) => Wildcard.match(permission, rule.permission))),
      evaluate: (permission, path) => Permission.evaluate(permission, path, services.archie.permission, bound.permission ?? []).action, tools })
    job.assets.forEach((asset) => fact(Permission.evaluate("external_directory", join(dirname(asset.path), "*"), services.archie.permission, bound.permission ?? []).action === "allow", "PAIR_NATIVE_REFERENCE_EXTERNAL_GRANT_MISSING"))
    state.checks++
    return inventory
  }
  const stream = services.llm.stream
  services.llm.stream = (input) => Stream.unwrap(Effect.gen(function* () {
    requireArmTime(timing)
    requireSecretFree({ system: input.system, messages: input.messages, tools: input.tools, agentPrompt: input.agent.prompt }, secrets, decodeJson)
    if (input.sessionID === state.child) {
      const bound = yield* services.sessions.get(input.sessionID)
      const inventory = yield* Effect.promise(() => boundary(bound, Object.keys(input.tools)))
      state.turns++
      yield* Effect.promise(() => save(join(root, "stage-" + (state.index + 1), "provider-boundary-" + state.turns + ".json"), { checkedAt: Date.now(), timing, inventory, tools: Object.keys(input.tools), revealedSourceIDs: [...revealed], assets: job.assets, forbiddenPaths: blockedPaths() }))
    }
    return stream(input)
  }).pipe(Effect.provideService(InstanceRef, placement)))
  const execute = services.task.execute
  services.task.execute = (params, ctx) => Effect.gen(function* () {
    state.calls++
    fact(state.calls === 1 && ctx.sessionID === services.parent.id && (ctx.agentID ?? ctx.agent) === "maestro"
      && params.subagent_type === "archie" && params.model === model && params.prompt === state.prompt
      && JSON.stringify(params.writePaths) === JSON.stringify([dispatchPath]) && params.task_id === state.logical
      && params.background !== true && params.governed === undefined && params.authorizationID === undefined && params.workflow === undefined
      && params.memoryUnit === undefined && params.command === undefined, "PAIR_NATIVE_TASK_REQUEST_MISMATCH")
    state.parentMessageID = ctx.messageID
    state.callID = ctx.callID
    const ops = ctx.extra?.promptOps
    fact(isOps(ops), "PAIR_NATIVE_PROMPT_OPS_MISSING")
    const result = yield* execute(params, { ...ctx, extra: { ...ctx.extra, promptOps: { ...ops,
      prompt: (request, options) => Effect.gen(function* () {
        fact(request.parts.length === 1 && request.parts[0].type === "text" && request.parts[0].text === state.prompt, "PAIR_NATIVE_ATTACHMENT_EXPANSION_REFUSED")
        const child = yield* services.sessions.get(request.sessionID)
        fact(child.parentID === services.parent.id && child.agent === "archie" && child.directory === project
          && child.projectID === services.parent.projectID && (!state.child || state.child === child.id), "PAIR_SAME_CHILD_BINDING_MISMATCH")
        state.child = child.id
        state.childPromptID = request.messageID
        yield* Effect.promise(() => save(join(root, "stage-" + (state.index + 1), "child-prompt-request.json"), request))
        fact(JSON.stringify(WriteRoots.read(child.permission)) === JSON.stringify([proposal]), "PAIR_CHILD_WRITE_ROOT_INVALID")
        // Native child inheritance retains denies, not parent read allowances. Bind the same local read surface in both arms.
        yield* services.sessions.setPermission({ sessionID: child.id, permission: [...(child.permission ?? []).filter((rule) => rule.permission === "tool_safety_write_root"),
          ...boundaryRules(placement.worktree, project, localFiles(), job.assets), { permission: "edit", pattern, action: "allow" }] })
        const check = Effect.gen(function* () {
          yield* Effect.promise(verifyInputs)
          const bound = yield* services.sessions.get(child.id)
          const archie = yield* services.agents.get("archie")
          const canonicalProposal = yield* Effect.promise(() => realpath(proposal).catch(async (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error
            return (await realpath(dirname(proposal))) + "/proposal.md"
          }))
          fact(canonicalProposal === proposal && JSON.stringify(WriteRoots.read(bound.permission)) === JSON.stringify([proposal]), "PAIR_CHILD_WRITE_ROOT_CHANGED")
          fact(archie.native === true && request.agent === "archie" && Permission.evaluate("edit", pattern, archie.permission, bound.permission ?? []).action === "allow"
            && Permission.evaluate("edit", relative(placement.worktree, join(project, "global.txt")), archie.permission, bound.permission ?? []).action === "deny"
            && Permission.evaluate("bash", "*", archie.permission, bound.permission ?? []).action === "deny"
            && Permission.evaluate("task", "archie", archie.permission, bound.permission ?? []).action === "deny"
            && Permission.evaluate("read", relative(placement.worktree, join(project, "global.txt")), archie.permission, bound.permission ?? []).action === "allow"
            && Permission.evaluate("read", relative(placement.worktree, job.packet.packetPath), archie.permission, bound.permission ?? []).action === "deny", "PAIR_CHILD_SCOPE_INVALID")
          yield* Effect.promise(() => boundary(bound))
        })
        const returned = yield* ops.prompt(request, { beforeModel: Effect.all([options?.beforeModel ?? Effect.void, check], { discard: true }) })
        state.childReturned = returned
        yield* Effect.promise(() => save(join(root, "stage-" + (state.index + 1), "child-return.json"), returned))
        return returned
      }).pipe(Effect.provideService(InstanceRef, placement))
    } } })
    yield* Effect.promise(() => save(join(root, "stage-" + (state.index + 1), "task-return.json"), result))
    const work = result.metadata.workResult
    yield* Effect.promise(() => requireSuccessfulAuthoring(job.candidate, work, state.childReturned, proposal))
    fact(work && work.schema === "upstream-work-result-v1" && work.author?.memberId === "archie"
      && work.author.executionSessionID === state.child && work.author.messageID === work.card?.messageID
      && (!state.logical || state.logical === work.taskId), "PAIR_NATIVE_RETURN_BINDING_MISMATCH")
    state.logical = work.taskId
    state.result = result
    return result
  }).pipe(Effect.provideService(InstanceRef, placement))
  try {
    for (const [index, stage] of job.packet.stages.entries()) {
      requireArmTime(timing)
      await verifyInputs()
      state.index = index; state.calls = 0; state.checks = 0; state.turns = 0; state.result = undefined; state.childReturned = undefined; state.childPromptID = undefined
      const stageRoot = join(root, "stage-" + (index + 1))
      await mkdir(stageRoot, { mode: 0o700 })
      const reveal = arm === "E" && index === 0 ? job.packet.sources : arm === "P" ? job.packet.sources.filter((item) => stage.sourceIDs.includes(item.id) && !revealed.has(item.id)) : []
      await Promise.all(reveal.map(async (item) => {
        await writeFile(join(project, item.file), item.text, { flag: "wx", mode: 0o400 })
        revealed.add(item.id)
      }))
      const context = index === 0 ? "GLOBAL OBLIGATIONS (complete):\\n" + job.packet.global.text + "\\n\\n" : ""
      const sources = reveal.map((item) => "SOURCE " + JSON.stringify(item.id) + " [" + item.file + "]:\\n" + item.text).join("\\n\\n")
      // Request bytes are appended without trimming. Context differs only by scheduled source revelation.
      state.prompt = "Proposal-only native authoring. Write only proposal.md. No child dispatch, implementation, workflow execution, approval or publication. Return native upstream-result card.\\n\\n"
        + context + sources + "\\n\\nSTAGE REQUEST (exact UTF-8 bytes):\\n" + stage.request.text
      requireSecretFree(state.prompt, secrets, decodeJson)
      const host = "Use exactly one foreground native Task: subagent_type=archie, model=" + model + ", writePaths=" + JSON.stringify([dispatchPath])
        + (state.logical ? ", task_id=" + state.logical : ", omit task_id")
        + ". Omit background, governed, authorizationID, workflow, memoryUnit and command. Copy following assignment exactly into prompt; no trimming, rewriting or added obligations. Return actual Task result.\\n\\n" + state.prompt
      requireSecretFree(host, secrets, decodeJson)
      emit({ type: "pair_stage_start", arm, index, id: stage.id, requestSha256: stage.request.sha256, assignmentSha256: digest(Buffer.from(state.prompt)), revealedSourceIDs: [...revealed] })
      const returned = await run(services.prompts.prompt({ sessionID: services.parent.id, agent: "maestro", model: { providerID: "openai", modelID: "gpt-6.1-sol" }, parts: [{ type: "text", text: host }] }))
      await save(join(stageRoot, "parent-return.json"), returned)
      requireArmTime(timing)
      fact(returned.info.role === "assistant" && !returned.info.error && state.calls === 1 && state.checks > 0 && state.result, "PAIR_STAGE_NATIVE_EXECUTION_INCOMPLETE")
      const inputHashes = await verifyInputs()
      const bytes = await Bun.file(proposal).bytes()
      fact(bytes.length > 0 && (await realpath(proposal)) === proposal, "PAIR_PROPOSAL_MISSING_OR_ALIAS")
      fact(!secrets.some((secret) => Buffer.from(bytes).includes(Buffer.from(secret))), "PAIR_PROPOSAL_SECRET_BEARING")
      await writeFile(join(stageRoot, "proposal.md"), bytes, { flag: "wx", mode: 0o600 })
      await save(join(stageRoot, "native.json"), { arm, index, id: stage.id, parentSessionID: services.parent.id, parentMessageID: state.parentMessageID, callID: state.callID,
        childSessionID: state.child, childPromptMessageID: state.childPromptID, logicalTaskID: state.logical, worktree: placement.worktree, result: state.result, parentReturned: returned, proposalSha256: digest(bytes), proposalBytes: bytes.length, timing,
        requestSha256: stage.request.sha256, assignment: state.prompt, assignmentSha256: digest(Buffer.from(state.prompt)), revealedSourceIDs: [...revealed], inputHashes, checks: state.checks })
      emit({ type: "pair_stage_end", arm, index, childSessionID: state.child, logicalTaskID: state.logical })
    }
  } finally { services.task.execute = execute; services.llm.stream = stream; await save(join(root, "arm-timing.json"), { ...timing, endedAt: Date.now(), elapsedMs: Date.now() - timing.startedAt }) }
}
} finally { await AppRuntime.dispose() }
} catch (error) {
  emit({ type: "pair_failure", code: error instanceof Error && /^(PAIR|LEGACY_CODEX)_[A-Z_]+$/.test(error.message) ? error.message : "PAIR_INITIALIZER_OR_NATIVE_RUNTIME_FAILED", diagnostic: redact(String(error)) })
  process.exitCode = 1
} finally {
  await processRuntime.dispose()
  Object.assign(sharedSpawner, originalSpawner)
  await spawnerRuntime.dispose()
}
process.exit(process.exitCode ?? 0)
`
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
    candidate: { type: "string" }, packet: { type: "string" }, output: { type: "string" }, "auth-source": { type: "string" },
    model: { type: "string" }, "prepare-only": { type: "boolean" }, "preflight-only": { type: "boolean" }, run: { type: "boolean" },
  } }).values
  requireFact([args.run, args["prepare-only"], args["preflight-only"]].filter(Boolean).length === 1, "PAIR_EXACTLY_ONE_MODE_REQUIRED")
  requireFact(args.model === model, "PAIR_EXACT_MODEL_REQUIRED")
  const candidate = await canonical(args.candidate, true)
  const packetPath = await canonical(args.packet)
  // Verification precedes output creation, credential inspection and any runtime initialization.
  const packet = await verifyPacket(candidate, packetPath)
  const assets = await pinNativeAssets(candidate, packet)
  const driverSha256 = sha256(await read(await canonical(fileURLToPath(import.meta.url))))
  requireFact(args["auth-source"] === selectedAuth, "PAIR_EXACT_SELECTED_AUTH_REQUIRED")
  requireFact(args.output && isAbsolute(args.output) && !args.output.split(/[\\/]/).includes(".."), "PAIR_OUTPUT_ABSOLUTE_PATH_REQUIRED")
  const output = resolve(args.output)
  const parent = await canonical(dirname(output), true)
  requireFact(output !== candidate && !output.startsWith(candidate + "/") && !candidate.startsWith(output + "/")
    && !packetPath.startsWith(output + "/") && ![packet.global, ...packet.sources, ...packet.stages.map((stage) => stage.request), ...packet.nonModelArtifacts].some((item) => item.path.startsWith(output + "/")), "PAIR_OUTPUT_INPUT_OVERLAP")
  requireFact(parent === dirname(output), "PAIR_OUTPUT_PARENT_ALIAS")
  const sourceHashes = await Promise.all(authPins.map(async ([file, expected]) => {
    const bytes = await read(await canonical(join(candidate, "packages/orchestra/src", file)))
    requireFact(blob(bytes) === expected, `PAIR_AUTH_CONSUMER_PIN_MISMATCH:${file}`)
    return { file, blob: expected, sha256: sha256(bytes) }
  }))
  const coreAuth = await read(await canonical(join(candidate, "packages/core/src/auth/siwc.ts")))
  requireFact(blob(coreAuth) === "6f70d249c2cb3d58558a9ae2e3d85402a1b1b9e3", "PAIR_CORE_AUTH_PIN_MISMATCH")
  const runtimeHashes = await Promise.all(runtimeFiles.map(async (file) => {
    const path = await canonical(join(candidate, "packages/orchestra/src", file))
    return { path, sha256: sha256(await read(path)) }
  }))
  const git = Bun.spawn(["git", "--no-optional-locks", "-C", candidate, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" })
  const head = (await new Response(git.stdout).text()).trim()
  requireFact(await git.exited === 0 && /^[a-f0-9]{40}$/.test(head), "PAIR_CANDIDATE_HEAD_UNAVAILABLE")
  const snapshot = args["prepare-only"] ? undefined : await (async () => {
    const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
    const source = await canonical(args["auth-source"])
    const bytes = await read(source, true)
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(utf8(bytes))
    requireFact(Option.isSome(parsed) && parsed.value && typeof parsed.value === "object" && "openai" in parsed.value, "PAIR_SELECTED_OPENAI_AUTH_MISSING")
    const value = parsed.value.openai
    requireFact(value && typeof value === "object" && !Object.hasOwn(value, "metadata"), "PAIR_LEGACY_AUTH_METADATA_REFUSED")
    const auth = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("oauth"), access: Schema.NonEmptyString, refresh: Schema.NonEmptyString,
      expires: Schema.Int, accountId: Schema.optional(Schema.String) }))(value)
    requireFact(Option.isSome(auth) && auth.value.expires > Date.now() + (args.run ? totalBudgetMs : 2 * 60_000) + 15 * 60_000, "PAIR_LEGACY_AUTH_INVALID_OR_EXPIRY_TOO_CLOSE")
    return { source, sha256: sha256(bytes), content: JSON.stringify({ openai: auth.value }), secrets: secretForms([auth.value.access, auth.value.refresh, ...(auth.value.accountId ? [auth.value.accountId] : [])]) }
  })()
  const secrets = snapshot?.secrets ?? []
  const decodeJson = await evidenceDecoder(candidate)
  requireSecretFree({ packet, assets }, secrets, decodeJson)
  process.umask(0o077)
  await mkdir(output, { mode: 0o700 }) // Existing output is refused: no overwrite or mixed-run receipts.
  const save = (file: string, value: unknown) => saveEvidence(join(output, file), value, secrets, decodeJson)
  await save("prepared.json", { schema: 1, packetContract: "schema-1-documented-metadata-successor", candidate, head, model, sourceHashes, consumerSourceReview, runtimeHashes, coreAuthBlob: blob(coreAuth), packetPath, packetSha256: packet.packetSha256,
    packetDeclarations: packet.declarations, nonModelArtifacts: packet.nonModelArtifacts, assets, driverSha256,
    global: receipt(packet.global), sources: packet.sources.map((item) => ({ id: item.id, file: item.file, ...receipt(item) })),
    stages: packet.stages.map((item) => ({ id: item.id, sourceIDs: item.sourceIDs, request: receipt(item.request) })),
    armBudgetMs, totalBudgetMs, outputLimitPerArm: outputLimit, judgment: "not-performed", authAdapter: "explicit-legacy-codex-readonly", order: ["E", "P"] })
  try {
    await Promise.all(["E", "P"].map(async (arm) => {
      await mkdir(join(output, arm), { mode: 0o700 })
      await mkdir(join(output, arm, "project"), { mode: 0o700 })
      await writeFile(join(output, arm, "project", "global.txt"), packet.global.text, { flag: "wx", mode: 0o400 })
    }))
    const entries = await Promise.all((["E", "P"] as const).map(async (arm) => {
      const program = initializer({ candidate, output, packet, assets, driverSha256, arm, preflightOnly: Boolean(args["preflight-only"]) })
      requireSecretFree(program, secrets, decodeJson)
      new Bun.Transpiler({ loader: "ts" }).transformSync(program)
      const entry = join(output, "initializer-" + arm + ".ts")
      await writeFile(entry, program, { flag: "wx", mode: 0o600 })
      return { arm, entry }
    }))
    if (args["prepare-only"]) { console.log(JSON.stringify({ code: "PAIR_PREPARED_NO_MODEL", output })); return }
    const { Option, Schema }: typeof import("effect") = await import(createRequire(join(candidate, "packages/orchestra/package.json")).resolve("effect"))
    requireFact(snapshot, "PAIR_SELECTED_AUTH_SNAPSHOT_MISSING")
    const env: Record<string, string | undefined> = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(output, key.toLowerCase())]))
    await Promise.all(Object.values(env).filter((path): path is string => typeof path === "string").map((path) => mkdir(path, { mode: 0o700 })))
    Object.assign(env, { PATH: process.env.PATH, ORCHESTRA_DB: join(output, "session.db"), ORCHESTRA_CONFIG: join(output, "config.json"),
      ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_LEGACY_CODEX_READONLY: "1", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_TEST_HOME: env.HOME,
      ORCHESTRA_AUTH_CONTENT: snapshot.content, TMP: env.TMPDIR, TEMP: env.TMPDIR })
    await writeFile(String(env.ORCHESTRA_CONFIG), JSON.stringify({ model, default_agent: "maestro", agent: { maestro: { permission: { "*": "deny", task: { "*": "deny", archie: "allow" } } } } }) + "\n", { flag: "wx", mode: 0o600 })
    await unchanged(packet)
    const pairStartedAt = Date.now()
    const totalDeadlineAt = pairStartedAt + (args.run ? totalBudgetMs : 3 * 60_000)
    const launched = []
    for (const item of entries) {
      const result = await launch(item.entry, candidate, env, item.arm, totalDeadlineAt, args["preflight-only"] ? 60_000 : armBudgetMs)
      launched.push(result)
      await save(item.arm + "/launcher.json", result.launcher)
      await save(item.arm + "/stdout.json", { text: result.stdout })
      await save(item.arm + "/stderr.json", { text: result.stderr })
      await preserveDatabaseEvidence(output, item.arm, secrets, decodeJson)
      requireFact(!result.code, result.code ?? "PAIR_PROCESS_FAILED")
    }
    await save("pair-timing.json", { pairStartedAt, totalDeadlineAt, endedAt: Date.now(), armBudgetMs, totalBudgetMs, arms: launched.map((item) => item.launcher) })
    requireFact(sha256(await read(snapshot.source, true)) === snapshot.sha256, "PAIR_SELECTED_AUTH_STORE_CHANGED")
    await unchanged(packet)
    await Promise.all([...runtimeHashes, ...sourceHashes.map((item) => ({ path: join(candidate, "packages/orchestra/src", item.file), sha256: item.sha256 }))].map(async (item) =>
      requireFact(sha256(await read(await canonical(item.path))) === item.sha256, `PAIR_CANDIDATE_SOURCE_CHANGED:${item.path}`)))
    requireFact(blob(await read(await canonical(join(candidate, "packages/core/src/auth/siwc.ts")))) === blob(coreAuth), "PAIR_CORE_AUTH_SOURCE_CHANGED")
    if (args["preflight-only"]) {
      const events = launched.flatMap((result) => result.stdout.split("\n")).flatMap((line) => {
        const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
        if (Option.isNone(parsed)) return []
        const event = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("pair_preflight"), arm: Schema.Literals(["E", "P"]), parentSessionID: Schema.String }))(parsed.value)
        return Option.isSome(event) ? [event.value] : []
      })
      requireFact(events.length === 2 && new Set(events.map((event) => event.arm)).size === 2 && new Set(events.map((event) => event.parentSessionID)).size === 2, "PAIR_PREFLIGHT_RECORDS_MISSING_OR_AMBIGUOUS")
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
  const sessionSchema = Schema.Struct({ id: Schema.String, parent_id: Schema.NullOr(Schema.String), project_id: Schema.String, directory: Schema.String, agent: Schema.String, permission: Schema.String })
  try {
    const arms = await Promise.all(["E", "P"].map(async (arm) => {
      const stages = await Promise.all(packet.stages.map(async (stage, index) => {
        const root = join(output, arm, `stage-${index + 1}`)
        const nativeBytes = await read(await canonical(join(root, "native.json")))
        requireFact(!secrets.some((secret) => nativeBytes.includes(Buffer.from(secret))), "PAIR_RAW_RESULT_SECRET_BEARING")
        const native = decode(Schema.Struct({ parentSessionID: Schema.String, parentMessageID: Schema.String, callID: Schema.String,
          childSessionID: Schema.String, logicalTaskID: Schema.String, worktree: Schema.String, assignment: Schema.String, assignmentSha256: Schema.String,
          childPromptMessageID: Schema.String, requestSha256: Schema.String, proposalSha256: Schema.String, proposalBytes: Schema.Int, revealedSourceIDs: Schema.Array(Schema.String) }), json(utf8(nativeBytes)), "PAIR_STAGE_RECEIPT_INVALID")
        requireFact(native.requestSha256 === stage.request.sha256 && native.assignment.endsWith(stage.request.text) && native.assignmentSha256 === sha256(Buffer.from(native.assignment)), "PAIR_STAGE_REQUEST_CHANGED")
        const parent = decode(sessionSchema, db.query("SELECT id,parent_id,project_id,directory,agent,permission FROM session WHERE id=?").get(native.parentSessionID), "PAIR_PARENT_DB_MISSING")
        const child = decode(sessionSchema, db.query("SELECT id,parent_id,project_id,directory,agent,permission FROM session WHERE id=?").get(native.childSessionID), "PAIR_CHILD_DB_MISSING")
        requireFact(parent.parent_id === null && parent.agent === "maestro" && child.agent === "archie" && child.parent_id === parent.id && child.project_id === parent.project_id && parent.directory === child.directory && child.directory === join(output, arm, "project"), "PAIR_DB_LINEAGE_MISMATCH")
        const caller = decode(Schema.Struct({ data: Schema.String }), db.query("SELECT data FROM message WHERE session_id=? AND id=?").get(parent.id, native.parentMessageID), "PAIR_TASK_CALLER_MESSAGE_MISSING")
        const callerInfo = decode(Schema.Struct({ role: Schema.Literal("assistant"), agent: Schema.Literal("maestro"), providerID: Schema.String, modelID: Schema.String }), json(caller.data), "PAIR_TASK_CALLER_IDENTITY_INVALID")
        requireFact(callerInfo.providerID + "/" + callerInfo.modelID === model, "PAIR_TASK_CALLER_MODEL_MISMATCH")
        const rules = decode(Schema.Array(Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Schema.String })), json(child.permission), "PAIR_PERSISTED_CHILD_RULES_INVALID")
        const proposalPath = join(child.directory, "proposal.md")
        const proposalPattern = relative(native.worktree, proposalPath).replaceAll("\\", "/")
        requireFact(JSON.stringify(rules.filter((rule) => rule.permission === "tool_safety_write_root" && rule.action === "allow").map((rule) => rule.pattern)) === JSON.stringify([proposalPath])
          && rules.some((rule) => rule.permission === "edit" && rule.pattern === "*" && rule.action === "deny")
          && rules.findLast((rule) => rule.permission === "edit" && ["*", proposalPattern].includes(rule.pattern))?.action === "allow"
          && rules.some((rule) => rule.permission === "bash" && rule.pattern === "*" && rule.action === "deny"), "PAIR_PERSISTED_CHILD_SCOPE_MISMATCH")
        const taskRows = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.tool')='task' AND json_extract(data,'$.callID')=?").all(parent.id, native.parentMessageID, native.callID), "PAIR_TASK_ROWS_INVALID")
        requireFact(taskRows.length === 1, "PAIR_STAGE_TASK_MISSING_OR_AMBIGUOUS")
        await saveEvidence(join(root, "stored-task-evidence.json"), { rows: taskRows }, secrets, decodeJson)
        const task = decode(Schema.Struct({ state: Schema.Struct({ status: Schema.Literal("completed"), input: Schema.Struct({ prompt: Schema.String, model: Schema.String, subagent_type: Schema.Literal("archie"), task_id: Schema.optional(Schema.String) }),
          metadata: Schema.Struct({ parentSessionId: Schema.String, sessionId: Schema.String, workResult: Schema.Struct({ schema: Schema.Literal("upstream-work-result-v1"), taskId: Schema.String,
             author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.String, messageID: Schema.String }), card: Schema.Struct({ messageID: Schema.String }) }) }) }) }), json(taskRows[0].data), "PAIR_STORED_NATIVE_TASK_INVALID")
        const work = task.state.metadata.workResult
        requireFact(task.state.input.prompt === native.assignment && task.state.input.model === model && task.state.input.task_id === (index === 0 ? undefined : native.logicalTaskID)
          && work.taskId === native.logicalTaskID && work.author.executionSessionID === child.id && work.author.messageID === work.card.messageID
          && task.state.metadata.sessionId === child.id && task.state.metadata.parentSessionId === parent.id, "PAIR_STORED_NATIVE_RETURN_MISMATCH")
        const bindings = decode(Schema.Array(Schema.Struct({ data: Schema.String })), db.query("SELECT data FROM event WHERE aggregate_id=? AND type='maestro.task.bound.1'").all(child.id), "PAIR_LOGICAL_BINDING_ROWS_INVALID")
        requireFact(bindings.length === 1, "PAIR_LOGICAL_BINDING_MISSING_OR_AMBIGUOUS")
        const bound = decode(Schema.Struct({ taskId: Schema.String, memberID: Schema.Literal("archie"), executionSessionID: Schema.String, authoritySessionID: Schema.String, projectID: Schema.String, source: Schema.Literal("host") }), json(bindings[0].data), "PAIR_LOGICAL_BINDING_INVALID")
        requireFact(bound.taskId === work.taskId && bound.executionSessionID === child.id && bound.authoritySessionID === parent.id && bound.projectID === child.project_id, "PAIR_LOGICAL_BINDING_MISMATCH")
        const message = decode(Schema.Struct({ session_id: Schema.String, data: Schema.String }), db.query("SELECT session_id,data FROM message WHERE id=?").get(work.author.messageID), "PAIR_ASSISTANT_DB_MISSING")
        const info = decode(Schema.Struct({ role: Schema.Literal("assistant"), agent: Schema.Literal("archie"), providerID: Schema.String, modelID: Schema.String, parentID: Schema.String }), json(message.data), "PAIR_ASSISTANT_IDENTITY_INVALID")
        requireFact(message.session_id === child.id && info.providerID + "/" + info.modelID === model, "PAIR_ASSISTANT_MODEL_OR_SESSION_MISMATCH")
        const storedParts = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? ORDER BY id").all(child.id, work.author.messageID), "PAIR_ASSISTANT_PARTS_INVALID")
        const assistant = { info: { ...decode(Schema.Record(Schema.String, Schema.Unknown), json(message.data), "PAIR_ASSISTANT_INFO_INVALID"), id: work.author.messageID, sessionID: child.id }, parts: storedParts.map((row) => json(row.data)) }
        await saveEvidence(join(root, "stored-assistant-evidence.json"), assistant, secrets, decodeJson)
        requireFact(info.parentID === native.childPromptMessageID, "PAIR_STORED_CHILD_PROMPT_ID_MISMATCH")
        await requireStoredPrompt(candidate, db, child.id, info.parentID, native.assignment)
        await requireSuccessfulAuthoring(candidate, decode(Schema.Struct({ state: Schema.Struct({ metadata: Schema.Struct({ workResult: Schema.Unknown }) }) }), json(taskRows[0].data), "PAIR_STORED_WORK_RESULT_MISSING").state.metadata.workResult, assistant, proposalPath)
        const texts = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='text' ORDER BY id").all(child.id, work.author.messageID), "PAIR_ASSISTANT_TEXT_ROWS_INVALID")
        const returned = texts.map((row) => decode(Schema.Struct({ text: Schema.String }), json(row.data), "PAIR_ASSISTANT_TEXT_INVALID").text).join("\n")
        requireFact(returned.length > 0 && !secrets.some((secret) => returned.includes(secret)), "PAIR_ASSISTANT_EMPTY_OR_SECRET_BEARING")
        await saveEvidence(join(root, "returned-assistant.json"), { text: returned, originalUtf8Sha256: sha256(Buffer.from(returned)), originalUtf8ByteLength: Buffer.byteLength(returned) }, secrets, decodeJson)
        const proposal = await read(await canonical(join(root, "proposal.md")))
        utf8(proposal)
        requireFact(proposal.length === native.proposalBytes && sha256(proposal) === native.proposalSha256 && !secrets.some((secret) => proposal.includes(Buffer.from(secret))), "PAIR_PROPOSAL_SNAPSHOT_MISMATCH_OR_SECRET")
        // Collect every stored provider step belonging to this child prompt, including tool turns.
        const messages = decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM message WHERE session_id=? AND json_extract(data,'$.role')='assistant' AND json_extract(data,'$.parentID')=? ORDER BY id").all(child.id, info.parentID), "PAIR_USAGE_MESSAGE_ROWS_INVALID")
        requireFact(messages.length > 0, "PAIR_STAGE_PROVIDER_MESSAGES_MISSING")
        const steps = messages.flatMap((msg) => decode(Schema.Array(rowSchema), db.query("SELECT id,data FROM part WHERE session_id=? AND message_id=? AND json_extract(data,'$.type')='step-finish' ORDER BY id").all(child.id, msg.id), "PAIR_STEP_ROWS_INVALID").map((row) => {
          const stored = decode(Schema.Record(Schema.String, Schema.Unknown), json(row.data), "PAIR_STEP_DATA_INVALID")
          const tokens = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(stored.tokens)
          const cache = Option.isSome(tokens) ? Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(tokens.value.cache) : Option.none()
          const missingFields = [...["total", "input", "output", "reasoning", "cache"].filter((field) => Option.isNone(tokens) || !Object.hasOwn(tokens.value, field)),
            ...["read", "write"].filter((field) => Option.isNone(cache) || !Object.hasOwn(cache.value, field)).map((field) => "cache." + field)]
          return { messageID: msg.id, partID: row.id, stored, missingFields }
        }))
        const evidence = { arm, index, id: stage.id, ...native, returnedAssistantID: work.author.messageID, childPromptMessageID: info.parentID,
          returnedAssistantSha256: sha256(Buffer.from(returned)), providerMessages: messages.map((row) => ({ id: row.id, stored: json(row.data) })),
          usage: { scope: "native-child-only-parent-overhead-excluded", source: "stored-step-finish", steps, missingness: steps.length === 0 ? "no-stored-step-finish" : "per-step-missingFields-no-inferred-counts" },
          inputs: [receipt(packet.global), ...packet.sources.map(receipt), ...packet.stages.map((item) => receipt(item.request))], judgment: "not-performed" }
        await saveEvidence(join(root, "verified.json"), evidence, secrets, decodeJson)
        return evidence
      }))
      requireFact(new Set(stages.map((stage) => stage.childSessionID)).size === 1 && new Set(stages.map((stage) => stage.logicalTaskID)).size === 1
        && new Set(stages.map((stage) => stage.returnedAssistantID)).size === 4, "PAIR_SAME_CHILD_RESUME_NOT_OBSERVED")
      const tasks = db.query("SELECT id FROM part WHERE session_id=? AND json_extract(data,'$.tool')='task'").all(stages[0].parentSessionID)
      requireFact(tasks.length === 4, "PAIR_PARENT_EXTRA_OR_MISSING_TASKS")
      const children = decode(Schema.Array(Schema.Struct({ id: Schema.String })), db.query("SELECT id FROM session WHERE parent_id=?").all(stages[0].parentSessionID), "PAIR_NATIVE_CHILD_ROWS_INVALID")
      requireFact(children.length === 1 && children[0].id === stages[0].childSessionID, "PAIR_EXTRA_OR_MISSING_NATIVE_CHILD")
      return { arm, stages }
    }))
    requireFact(arms[0].stages[0].childSessionID !== arms[1].stages[0].childSessionID && arms[0].stages[0].parentSessionID !== arms[1].stages[0].parentSessionID, "PAIR_ARMS_NOT_INDEPENDENT")
    const settings = await Promise.all(["E", "P"].map(async (arm) => {
      const raw = json(utf8(await read(await canonical(join(output, arm, "native-settings.json")))))
      const timing = decode(Schema.Struct({ timing: Schema.Struct({ startedAt: Schema.Int, deadlineAt: Schema.Int, budgetMs: Schema.Int, totalDeadlineAt: Schema.Int }) }), raw, "PAIR_ARM_TIMING_MISSING").timing
      requireFact(timing.budgetMs === armBudgetMs && timing.deadlineAt - timing.startedAt === armBudgetMs, "PAIR_ARM_BUDGET_NOT_EQUAL")
      return decode(Schema.Struct({ archie: Schema.Unknown, maestro: Schema.Unknown, toolIDs: Schema.Array(Schema.String) }), raw, "PAIR_NATIVE_SETTINGS_MISSING")
    }))
    requireFact(JSON.stringify(settings[0]) === JSON.stringify(settings[1]), "PAIR_NATIVE_SETTINGS_OR_TOOLS_DIFFER")
    requireFact(Date.now() < totalDeadlineAt, "PAIR_TOTAL_DEADLINE")
    await saveEvidence(join(output, "results.json"), { schema: 1, model, arms, judgment: "not-performed", benefit: "not-assessed", approval: "not-assessed" }, secrets, decodeJson)
  } finally { db.close() }
}

if (import.meta.main) await main().catch((error: unknown) => { console.error(safeCode(error).split(":")[0]); process.exitCode = 1 })

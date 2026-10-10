#!/usr/bin/env bun
// Ordinary authoring preparation only. No model may start while consumer provenance or trusted Task scope is unbound.
import { Option, Schema } from "effect"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const selectedAuth = "/Users/gustavoschneiter/.local/share/opencode/auth.json"
const guarded = [
  ["packages/orchestra/src/auth/index.ts", "4b9ac63bd8a69c6cd6e554bcde95908246ee9cef"],
  ["packages/orchestra/src/plugin/openai/codex.ts", "97f34ae2b4420014b61f0f3a1574aa10dff4e434"],
  ["packages/orchestra/src/plugin/openai/siwc.ts", "203e07b88371a420db664c01e7796401cbad44df"],
  ["packages/core/src/auth/siwc.ts", "6f70d249c2cb3d58558a9ae2e3d85402a1b1b9e3"],
] as const
// Lead must supply actual reviewed plugin + wiring paths and Git blob IDs. An empty list is a named execution blocker.
const legacyPins: ReadonlyArray<{ role: "plugin" | "wiring"; file: string; blob: string }> = []
const sourcePaths = [
  "packages/orchestra/src/agent/agent.ts", "packages/orchestra/src/maestro/seats/walt.ts",
  "packages/orchestra/src/tool/task.ts", "packages/orchestra/src/maestro/write-roots.ts",
  "packages/orchestra/src/maestro/logical-task.ts", "packages/orchestra/src/maestro/backend-work.ts",
  "packages/orchestra/src/tool/task-background.ts", "packages/orchestra/src/effect/app-runtime.ts",
  "packages/orchestra/src/cli/cmd/run.ts",
] as const
class AuthoringError extends Error {}
function requireAuthoring(value: unknown, code: string): asserts value { if (!value) throw new AuthoringError(code) }
function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown, code: string): S["Type"] {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  requireAuthoring(Option.isSome(decoded), code)
  return decoded.value
}
const json = (text: string) => decode(Schema.UnknownFromJsonString, text, "AUTHORING_JSON_INVALID")
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const blob = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
const inside = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

await main().catch((error: unknown) => {
  console.error(error instanceof AuthoringError ? error.message : "AUTHORING_IO_OR_DEPENDENCY_UNAVAILABLE")
  process.exitCode = 1
})

async function main() {
  requireAuthoring(process.getuid && constants.O_NOFOLLOW, "AUTHORING_PRIVATE_FILE_HOST_UNSUPPORTED")
  const args = parseArgs({ args: Bun.argv.slice(2), strict: true, allowPositionals: false, options: {
    candidate: { type: "string" }, pilot: { type: "string" }, "auth-source": { type: "string" },
    model: { type: "string", default: "openai/gpt-6.1-sol" }, "prepare-only": { type: "boolean" }, run: { type: "boolean" },
  } }).values
  requireAuthoring(!(args.run && args["prepare-only"]), "AUTHORING_MODE_CONFLICT")
  const model = args.model ?? "openai/gpt-6.1-sol"
  requireAuthoring(/^openai\/[A-Za-z0-9._-]{1,128}$/.test(model), "AUTHORING_MODEL_INVALID")
  const candidate = await canonical(args.candidate, true)
  const pilot = await canonical(args.pilot, true)
  const project = await canonical(join(pilot, "project"), true)
  requireAuthoring(!inside(pilot, candidate) && !inside(candidate, pilot), "AUTHORING_CANDIDATE_FIXTURE_OVERLAP")
  const source = await canonical(args["auth-source"], false)
  requireAuthoring(source === selectedAuth, "AUTHORING_OWNER_SELECTED_AUTH_SOURCE_REQUIRED")
  const sourceHashes = await Promise.all(guarded.map(async ([file, expected]) => {
    const bytes = await read(await canonical(join(candidate, file), false))
    requireAuthoring(blob(bytes) === expected, "AUTHORING_OLD_AUTH_GUARD_CHANGED")
    return { file, blob: expected, sha256: sha256(bytes) }
  }))
  const nativeSourceHashes = await Promise.all(sourcePaths.map(async (file) => {
    const bytes = await read(await canonical(join(candidate, file), false))
    return { file, blob: blob(bytes), sha256: sha256(bytes) }
  }))
  const head = await gitHead(candidate)
  requireAuthoring(/^[a-f0-9]{40}$/.test(head), "AUTHORING_CANDIDATE_HEAD_INVALID")
  const roles = legacyPins.map((pin) => pin.role)
  const pinsAvailable = roles.includes("plugin") && roles.includes("wiring")
  requireAuthoring(new Set(roles).size === roles.length && new Set(legacyPins.map((pin) => pin.file)).size === legacyPins.length, "AUTHORING_LEGACY_SOURCE_PINS_DUPLICATED")
  const legacySourceHashes = await Promise.all(legacyPins.map(async (pin) => {
    requireAuthoring(!isAbsolute(pin.file) && !pin.file.split(/[\\/]/).includes("..") && /^[a-f0-9]{40}$/.test(pin.blob), "AUTHORING_LEGACY_SOURCE_PIN_INVALID")
    const bytes = await read(await canonical(join(candidate, pin.file), false))
    requireAuthoring(blob(bytes) === pin.blob, "AUTHORING_LEGACY_SOURCE_PIN_MISMATCH")
    return { ...pin, sha256: sha256(bytes) }
  }))
  if (args.run) {
    requireAuthoring(pinsAvailable, "AUTHORING_LEGACY_SOURCE_PINS_REQUIRED")
    // No CLI --agent walt: RunCommand.localAgent rejects a subagent and falls back.
    // A prompt alone cannot constrain Maestro's Task writePaths or attest native identity before its first model call.
    throw new AuthoringError("AUTHORING_TRUSTED_NATIVE_TASK_PREFLIGHT_UNBOUND")
  }
  const demand = await read(await canonical(join(pilot, "demand.txt"), false))
  requireAuthoring(demand.length > 0, "AUTHORING_DEMAND_EMPTY")
  const domainBytes = await read(await canonical(join(pilot, "DOMAIN-SOURCE.json"), false))
  decode(Schema.Record(Schema.String, Schema.Unknown), json(Buffer.from(domainBytes).toString("utf8")), "AUTHORING_DOMAIN_SOURCE_NOT_OBJECT")
  const instructions = await read(await canonical(join(pilot, "AUTHORING-RUN-INPUT.md"), false))
  requireAuthoring(instructions.length > 0, "AUTHORING_RUN_INPUT_EMPTY")
  // Schema inspection only: no JWT-claim inference, issued registration, Siwc calls, login or refresh.
  const store = decode(Schema.Record(Schema.String, Schema.Unknown), json(Buffer.from(await read(source, true)).toString("utf8")), "AUTHORING_LEGACY_AUTH_STORE_INVALID")
  const value = decode(Schema.Record(Schema.String, Schema.Unknown), store.openai, "AUTHORING_OPENAI_AUTH_MISSING")
  requireAuthoring(!Object.hasOwn(value, "metadata"), "AUTHORING_LEGACY_AUTH_METADATA_MUST_BE_ABSENT")
  const auth = decode(Schema.Struct({ type: Schema.Literal("oauth"), access: Schema.NonEmptyString, refresh: Schema.NonEmptyString,
    expires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), accountId: Schema.optional(Schema.String), enterpriseUrl: Schema.optional(Schema.String),
  }), value, "AUTHORING_LEGACY_OAUTH_INVALID")
  requireAuthoring(auth.expires > Date.now() + 15 * 60_000, "AUTHORING_LEGACY_AUTH_EXPIRED_OR_TOO_SOON")
  process.umask(0o077)
  const runtime = await mkdtemp(join(pilot, "ordinary-authoring-"))
  const env: Record<string, string> = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(runtime, key.toLowerCase())]))
  await Promise.all(Object.values(env).map((path) => mkdir(path, { mode: 0o700 })))
  Object.assign(env, { ORCHESTRA_DB: join(runtime, "session.db"), ORCHESTRA_CONFIG: join(runtime, "config.json"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_LEGACY_CODEX_READONLY: "1", ORCHESTRA_TEST_HOME: env.HOME, TMP: env.TMPDIR, TEMP: env.TMPDIR })
  await writeFile(env.ORCHESTRA_CONFIG, JSON.stringify({ model, default_agent: "maestro", permission: { "*": "deny", task: { "*": "deny", walt: "allow" } } }) + "\n", { flag: "wx", mode: 0o600 })
  const report = { schema: 1, phase: "prepared-blocked", runtime, candidate, head, project, model,
    sourceHashes, nativeSourceHashes, legacySourceHashes,
    inputDocuments: [{ file: "demand.txt", sha256: sha256(demand) }, { file: "DOMAIN-SOURCE.json", sha256: sha256(domainBytes) }, { file: "AUTHORING-RUN-INPUT.md", sha256: sha256(instructions) }],
    env, blockedBy: [...(!pinsAvailable ? ["AUTHORING_LEGACY_SOURCE_PINS_REQUIRED"] : []), "AUTHORING_TRUSTED_NATIVE_TASK_PREFLIGHT_UNBOUND", "AUTHORING_DOMAIN_INVENTORY_CONTRACT_UNBOUND"],
    plannedExecutionBudget: { deadlineMs: 10 * 60_000, stdoutBytes: 32 * 1024 * 1024 },
    runtimeNativeAttested: false, modelExecuted: false, semanticJudgment: "not-performed", proposalSha256: null,
  }
  // No auth values or auth-source digest enter configuration, report, process environment, stdout or errors.
  await writeFile(join(runtime, "prepared.json"), JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 })
  console.log(JSON.stringify({ code: "AUTHORING_PREPARED_BLOCKED", runtime, blockedBy: report.blockedBy }))
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
  const child = Bun.spawn(["git", "--no-optional-locks", "-C", candidate, "rev-parse", "HEAD"], {
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "ignore",
  })
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
  const output = await Promise.all([child.exited, new Response(child.stdout).text()]).finally(() => clearTimeout(timer))
  requireAuthoring(output[0] === 0, "AUTHORING_CANDIDATE_GIT_UNAVAILABLE")
  return output[1].trim()
}

#!/usr/bin/env bun
// Admission/resume driver only. Production Maestro presents and decides; this file never creates approval evidence.
import { Database } from "bun:sqlite"
import { Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, realpath, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { isDeepStrictEqual, parseArgs } from "node:util"

const deadline = 10 * 60 * 1000
const pinned = [
  ["packages/orchestra/src/auth/index.ts", "4b9ac63bd8a69c6cd6e554bcde95908246ee9cef"],
  ["packages/orchestra/src/plugin/openai/codex.ts", "97f34ae2b4420014b61f0f3a1574aa10dff4e434"],
  ["packages/orchestra/src/plugin/openai/siwc.ts", "203e07b88371a420db664c01e7796401cbad44df"],
  ["packages/core/src/auth/siwc.ts", "6f70d249c2cb3d58558a9ae2e3d85402a1b1b9e3"],
] as const
const Journal = Schema.Struct({
  schema: Schema.Literal(1), candidate: Schema.String, head: Schema.String, pilot: Schema.String,
  project: Schema.String, model: Schema.String, authSource: Schema.String,
  guarded: Schema.Record(Schema.String, Schema.String), env: Schema.Record(Schema.String, Schema.String),
  configHash: Schema.String, runs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  phase: Schema.Literals(["prepared", "running", "awaiting-owner", "finished", "failed"]),
  sessionID: Schema.optional(Schema.String), projectID: Schema.optional(Schema.String),
  presentationID: Schema.optional(Schema.String), ownerRequestAt: Schema.optional(Schema.Int),
})
type Journal = typeof Journal.Type
const Envelope = Schema.Struct({ type: Schema.Literals(["tool_use", "step_start", "step_finish", "text", "reasoning", "error", "retry"]),
  timestamp: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), sessionID: Schema.String,
  part: Schema.optional(Schema.Struct({ id: Schema.String, messageID: Schema.String, sessionID: Schema.String,
    type: Schema.Literals(["tool", "text", "reasoning", "step-start", "step-finish"]), text: Schema.optional(Schema.String), tool: Schema.optional(Schema.String) })) })
class PilotError extends Error {}
function requirePilot(value: unknown, code: string): asserts value { if (!value) throw new PilotError(code) }
function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown, code: string): S["Type"] {
  const value = Schema.decodeUnknownOption(schema)(input)
  requirePilot(Option.isSome(value), code)
  return value.value
}
const json = (text: string) => decode(Schema.UnknownFromJsonString, text, "PILOT_JSON_INVALID")
const digest = (text: string) => createHash("sha256").update(text).digest("hex")
const inside = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

await main().catch((error: unknown) => {
  console.error(error instanceof PilotError ? error.message : "PILOT_IO_OR_RUNTIME_FAILED")
  process.exitCode = 1
})

async function main() {
  requirePilot(process.getuid && constants.O_NOFOLLOW, "PILOT_PRIVATE_FILE_HOST_UNSUPPORTED")
  const args = parseArgs({ args: Bun.argv.slice(2), strict: true, allowPositionals: false, options: {
    candidate: { type: "string" }, pilot: { type: "string" }, "auth-source": { type: "string" },
    model: { type: "string", default: "openai/gpt-6.1-sol" }, "prepare-only": { type: "boolean" }, run: { type: "boolean" },
    runtime: { type: "string" }, session: { type: "string" }, "reply-file": { type: "string" },
  } }).values
  requirePilot(!(args.run && args["prepare-only"]), "PILOT_MODE_CONFLICT")
  requirePilot(!(args.session || args["reply-file"]) || args.runtime, "PILOT_RESUME_RUNTIME_REQUIRED")
  requirePilot(!args.run || Boolean(args.session) === Boolean(args["reply-file"]), "PILOT_RESUME_INPUT_INCOMPLETE")
  const model = args.model ?? "openai/gpt-6.1-sol"
  requirePilot(/^openai\/[A-Za-z0-9._-]{1,128}$/.test(model), "PILOT_MODEL_INVALID")
  const candidate = await canonical(args.candidate, true)
  const pilot = await canonical(args.pilot, true)
  const project = await canonical(join(pilot, "project"), true)
  requirePilot(!inside(pilot, candidate) && !inside(candidate, pilot), "PILOT_CANDIDATE_FIXTURE_OVERLAP")
  const authSource = await canonical(args["auth-source"], false)
  const head = await git(candidate, ["rev-parse", "HEAD"])
  requirePilot(/^[a-f0-9]{40}$/.test(head), "PILOT_CANDIDATE_HEAD_INVALID")
  requirePilot(await git(project, ["rev-parse", "--show-toplevel"]) === project, "PILOT_PROJECT_GIT_ROOT_REQUIRED")
  await Promise.all(pinned.map(async ([file, expected]) => {
    const bytes = await privateText(await canonical(join(candidate, file), false), false)
    requirePilot(createHash("sha1").update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest("hex") === expected, "PILOT_CANDIDATE_GUARDED_BASELINE_REQUIRED")
  }))
  await canonical(join(candidate, "packages/orchestra/src/index.ts"), false)
  process.umask(0o077)
  const runtime = args.runtime ? await canonical(args.runtime, true) : await mkdtemp(join(pilot, "maestro-pilot-"))
  requirePilot(inside(runtime, pilot) && runtime !== pilot && !inside(runtime, project) && ((await lstat(runtime)).mode & 0o077) === 0, "PILOT_RUNTIME_NOT_PRIVATE_OWNED_CHILD")
  const expectedEnv: Record<string, string> = { ...Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(runtime, key.toLowerCase())])),
    ORCHESTRA_DB: join(runtime, "session.db"), ORCHESTRA_CONFIG: join(runtime, "config.json"), ORCHESTRA_INHERIT_CREDENTIALS: "0" }
  const state = { journal: args.runtime ? decode(Journal, json(await privateText(join(runtime, "journal.json"))), "PILOT_JOURNAL_INVALID") :
    decode(Journal, { schema: 1, candidate, head, pilot, project, model, authSource, guarded: Object.fromEntries(pinned), env: expectedEnv,
      configHash: "", runs: 0, phase: "prepared" }, "PILOT_JOURNAL_INVALID") }
  requirePilot(state.journal.candidate === candidate && state.journal.head === head && state.journal.pilot === pilot && state.journal.project === project && state.journal.model === model && state.journal.authSource === authSource && isDeepStrictEqual(state.journal.guarded, Object.fromEntries(pinned)) && isDeepStrictEqual(state.journal.env, expectedEnv), "PILOT_RESUME_IDENTITY_CHANGED")
  if (!args.runtime) {
    await Promise.all(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map((key) => mkdir(expectedEnv[key], { mode: 0o700 })))
    await writeFile(expectedEnv.ORCHESTRA_CONFIG, JSON.stringify({ model, default_agent: "maestro" }) + "\n", { flag: "wx", mode: 0o600 })
    state.journal = { ...state.journal, configHash: await configIdentity(runtime, project) }
    await save(runtime, state.journal)
  }
  await Promise.all(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "TMPDIR"].map(async (key) => {
    requirePilot(await canonical(expectedEnv[key], true) === expectedEnv[key] && ((await lstat(expectedEnv[key])).mode & 0o077) === 0, "PILOT_ISOLATE_DIRECTORY_IDENTITY_CHANGED")
  }))
  requirePilot(await configIdentity(runtime, project) === state.journal.configHash, "PILOT_CONFIG_IDENTITY_CHANGED")
  const path = process.env.PATH
  Object.keys(process.env).forEach((key) => { delete process.env[key] })
  Object.assign(process.env, expectedEnv, { PATH: path, TMP: expectedEnv.TMPDIR, TEMP: expectedEnv.TMPDIR, ORCHESTRA_TEST_HOME: expectedEnv.HOME })
  // Prepare-only performs no credential read, provider call, or CLI/model launch.
  if (!args.run) { console.log(JSON.stringify({ code: "PILOT_PREPARED", runtime, sessionID: state.journal.sessionID ?? null })); return }
  requirePilot(state.journal.phase === "prepared" || state.journal.phase === "awaiting-owner", "PILOT_RUNTIME_NOT_IDLE_OR_RESUMABLE")
  requirePilot(Boolean(state.journal.sessionID) === Boolean(args.session), "PILOT_EXPLICIT_SESSION_REQUIRED")
  requirePilot(!args.session || state.journal.sessionID === args.session, "PILOT_RESUME_SESSION_MISMATCH")
  requirePilot(!args.session || /^ses/.test(args.session), "PILOT_RESUME_SESSION_INVALID")
  const lock = await open(join(runtime, "driver.lock"), "wx", 0o600).catch(() => { throw new PilotError("PILOT_RUNTIME_BUSY") })
  try {
    requirePilot(isDeepStrictEqual(decode(Journal, json(await privateText(join(runtime, "journal.json"))), "PILOT_JOURNAL_INVALID"), state.journal), "PILOT_JOURNAL_CHANGED_WHILE_WAITING")
    const before = args.session ? await evidence(state.journal, args.session) : undefined
    requirePilot(!args.session || before?.presentation, "PILOT_COMPLETED_APPROVAL_PRESENTATION_REQUIRED")
    requirePilot(!before || before.projectID === state.journal.projectID, "PILOT_SESSION_PROJECT_CHANGED")
    if (!args.session) requirePilot(await lstat(expectedEnv.ORCHESTRA_DB).then(() => false, (error: NodeJS.ErrnoException) => error.code === "ENOENT"), "PILOT_PREPARED_DATABASE_NOT_FRESH")
    const reply = args["reply-file"] ? await canonical(args["reply-file"], false) : undefined
    requirePilot(!reply || (!inside(reply, pilot) && !inside(reply, candidate)), "PILOT_OWNER_REPLY_MUST_BE_EXTERNAL")
    const input = await privateSnapshot(reply ?? await canonical(join(pilot, "demand.txt"), false), false)
    requirePilot(input.text.trim().length > 0 && Buffer.byteLength(input.text) <= 1024 * 1024, "PILOT_INPUT_EMPTY_OR_TOO_LARGE")
    requirePilot(!reply || (input.mtimeMs > Math.max(before?.presentation?.completedAt ?? Infinity, state.journal.ownerRequestAt ?? Infinity) && before?.presentation?.id === state.journal.presentationID), "PILOT_OWNER_REPLY_NOT_POST_PRESENTATION")
    const snapshot = await authSnapshot(candidate, authSource)
    const redact = (text: string) => snapshot.secrets.reduce((value, secret) => value.split(secret).join("[REDACTED]"), text)
    state.journal = { ...state.journal, runs: state.journal.runs + 1, phase: "running" }
    await save(runtime, state.journal)
    const output = await run(candidate, project, model, expectedEnv, path, snapshot.content, input.text, args.session)
    const { SessionID }: typeof import("../../packages/schema/src/session-id") = await import(join(candidate, "packages/schema/src/session-id.ts"))
    const events = output.text.split("\n").flatMap((line) => {
      const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
      if (Option.isNone(parsed)) return []
      const event = Schema.decodeUnknownOption(Envelope)(parsed.value)
      if (Option.isNone(event)) return []
      decode(SessionID, event.value.sessionID, "PILOT_EVENT_SESSION_INVALID")
      requirePilot(!event.value.part || event.value.part.sessionID === event.value.sessionID, "PILOT_EVENT_SESSION_CONFLICT")
      return [event.value]
    })
    const sessions = [...new Set(events.map((event) => event.sessionID))]
    requirePilot(sessions.length === 1 && (!args.session || sessions[0] === args.session), "PILOT_EVENT_SESSION_MISSING_OR_AMBIGUOUS")
    const identity = await evidence(state.journal, sessions[0], false)
    requirePilot(!state.journal.projectID || state.journal.projectID === identity.projectID, "PILOT_SESSION_PROJECT_CHANGED")
    state.journal = { ...state.journal, sessionID: sessions[0], projectID: identity.projectID }
    await save(runtime, state.journal)
    const safe = events.map((event) => ({ type: event.type, timestamp: event.timestamp, sessionID: event.sessionID,
      ...(event.part ? { part: { id: redact(event.part.id), messageID: redact(event.part.messageID), type: event.part.type,
        ...(typeof event.part.text === "string" ? { text: redact(event.part.text) } : {}),
        ...(event.type === "tool_use" ? { tool: event.part.tool ? redact(event.part.tool) : "unknown", state: "withheld; inspect owned DB" } : {}) } } : {}),
      ...(event.type === "error" ? { code: "PILOT_PROVIDER_OR_SESSION_ERROR" } : {}) }))
    await writeFile(join(runtime, `events-${state.journal.runs}.jsonl`), safe.map((event) => JSON.stringify(event)).join("\n") + "\n", { flag: "wx", mode: 0o600 })
    await writeFile(join(runtime, `status-${state.journal.runs}.txt`), output.code ?? "PILOT_CHILD_COMPLETED", { flag: "wx", mode: 0o600 })
    const observed = await evidence(state.journal, sessions[0])
    state.journal = { ...state.journal, phase: output.code ? "failed" : observed.presentation ? "awaiting-owner" : "finished",
      presentationID: observed.presentation?.id, ownerRequestAt: observed.presentation ? Date.now() : undefined }
    await save(runtime, state.journal)
    console.log(JSON.stringify({ code: "PILOT_SESSION_OBSERVED", runtime, sessionID: sessions[0], phase: state.journal.phase }))
    if (observed.presentation && !output.code) {
      console.log(redact(observed.presentation.output))
      console.log(JSON.stringify({ code: "PILOT_OWNER_REPLY_REQUIRED", runtime, sessionID: sessions[0], presentationID: observed.presentation.id }))
    }
    if (output.code) throw new PilotError(output.code)
  } catch (error) {
    if (state.journal.phase === "running") { state.journal = { ...state.journal, phase: "failed" }; await save(runtime, state.journal) }
    throw error instanceof PilotError ? error : new PilotError("PILOT_IO_OR_RUNTIME_FAILED")
  } finally { await lock.close(); await rm(join(runtime, "driver.lock")) }
}

async function canonical(value: string | undefined, directory: boolean) {
  requirePilot(value && isAbsolute(value) && !value.split(/[\\/]/).includes(".."), "PILOT_PATH_INVALID")
  const path = resolve(value)
  requirePilot(await realpath(path) === path, "PILOT_PATH_ALIAS_UNSUPPORTED")
  const info = await lstat(path)
  requirePilot((directory ? info.isDirectory() : info.isFile()) && info.uid === process.getuid?.() && !(info.mode & 0o022), "PILOT_PATH_NOT_OWNED_OR_REGULAR")
  return path
}

async function privateText(path: string, privateMode = true) {
  return (await privateSnapshot(path, privateMode)).text
}

async function privateSnapshot(path: string, privateMode = true) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    requirePilot(before.isFile() && before.uid === process.getuid?.() && !(before.mode & (privateMode ? 0o077 : 0o022)) && before.size <= 1024 * 1024, "PILOT_PRIVATE_FILE_INVALID")
    const text = await handle.readFile("utf8")
    const after = await handle.stat()
    requirePilot(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, "PILOT_PRIVATE_FILE_CHANGED")
    return { text, mtimeMs: before.mtimeMs }
  } finally { await handle.close() }
}

async function save(runtime: string, journal: Journal) {
  const temporary = join(runtime, `journal-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(decode(Journal, journal, "PILOT_JOURNAL_INVALID")) + "\n", { flag: "wx", mode: 0o600 })
  await rename(temporary, join(runtime, "journal.json")).finally(() => rm(temporary, { force: true }))
}

async function git(directory: string, args: string[]) {
  const child = Bun.spawn(["git", "--no-optional-locks", "-C", directory, ...args], { env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "ignore" })
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
  const result = await Promise.all([child.exited, new Response(child.stdout).text()]).finally(() => clearTimeout(timer))
  requirePilot(result[0] === 0, "PILOT_GIT_IDENTITY_UNAVAILABLE")
  return result[1].trim()
}

async function configIdentity(runtime: string, project: string) {
  const config = await privateText(join(runtime, "config.json"))
  const files = await Promise.all(["orchestra.json", "orchestra.jsonc", ".orchestra/orchestra.json", ".orchestra/orchestra.jsonc"].map(async (file) => {
    const path = join(project, file)
    const exists = await lstat(path).then(() => true, (error: NodeJS.ErrnoException) => {
      requirePilot(error.code === "ENOENT", "PILOT_PROJECT_CONFIG_UNAVAILABLE"); return false
    })
    return [file, exists ? digest(await privateText(await canonical(path, false), false)) : null]
  }))
  return digest(JSON.stringify({ config, files }))
}

async function authSnapshot(candidate: string, source: string) {
  const { Siwc }: typeof import("../../packages/core/src/auth/siwc") = await import(join(candidate, "packages/core/src/auth/siwc.ts"))
  const store = decode(Schema.Record(Schema.String, Schema.Unknown), json(await privateText(source)), "PILOT_AUTH_LEGACY_STORE_MISMATCH")
  const auth = decode(Schema.Struct({ type: Schema.Literal("oauth"), access: Schema.NonEmptyString, refresh: Schema.NonEmptyString,
    expires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), accountId: Schema.optional(Schema.String),
    metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) }), store.openai, "PILOT_AUTH_OPENAI_OAUTH_REQUIRED")
  requirePilot(auth.metadata, "PILOT_AUTH_METADATA_MISSING")
  const registration = (() => {
    try { Siwc.requirePlanUsage(auth); return Siwc.registration(auth.metadata) }
    catch { throw new PilotError("PILOT_AUTH_UNSUPPORTED_REGISTRATION_OR_PLAN_USAGE") }
  })()
  requirePilot(auth.expires > Date.now() + deadline + 5 * 60 * 1000, "PILOT_AUTH_EXPIRED_OR_TOO_SOON")
  const secrets = [auth.access, auth.refresh, registration.idToken].flatMap((value) => [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value), Buffer.from(value).toString("base64")]).sort((left, right) => right.length - left.length)
  return { content: JSON.stringify({ openai: auth }), secrets }
}

async function run(candidate: string, project: string, model: string, env: Record<string, string>, path: string | undefined, auth: string, input: string, session?: string) {
  const child = Bun.spawn([process.execPath, "./src/index.ts", "run", "--dir", project, "--agent", "maestro", "--model", model,
    "--format", "json", "--log-level", "WARN", ...(session ? ["--session", session] : ["--title", "upstream-authoring-candidate"])], {
    cwd: join(candidate, "packages/orchestra"), stdin: new Blob([input]).stream(), stdout: "pipe", stderr: "pipe",
    env: { ...env, PATH: path, TMP: env.TMPDIR, TEMP: env.TMPDIR, ORCHESTRA_TEST_HOME: env.HOME, ORCHESTRA_AUTH_CONTENT: auth },
  })
  const chunks: Uint8Array[] = []
  const state: { bytes: number; code?: string } = { bytes: 0 }
  const readers = [child.stdout.getReader(), child.stderr.getReader()]
  const stop = () => { if (child.exitCode === null) child.kill("SIGKILL"); readers.forEach((reader) => { void reader.cancel().catch(() => undefined) }) }
  const abort = () => { state.code = "PILOT_INTERRUPTED"; stop() }
  process.once("SIGINT", abort); process.once("SIGTERM", abort)
  const timer = setTimeout(() => { state.code = "PILOT_DEADLINE"; stop() }, deadline)
  try {
    const drains = readers.map(async (reader, index) => {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return
        if (index !== 0) continue
        state.bytes += chunk.value.length
        if (state.bytes > 32 * 1024 * 1024) { state.code = "PILOT_OUTPUT_LIMIT"; stop(); return }
        chunks.push(chunk.value)
      }
    })
    const [status] = await Promise.all([child.exited, ...drains])
    return { text: Buffer.concat(chunks).toString("utf8"), code: state.code ?? (status === 0 ? undefined : "PILOT_CHILD_FAILED") }
  } finally {
    clearTimeout(timer); stop(); await child.exited
    process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort)
  }
}

async function evidence(journal: Journal, sessionID: string, approval = true) {
  const path = await canonical(journal.env.ORCHESTRA_DB, false)
  requirePilot(((await lstat(path)).mode & 0o077) === 0, "PILOT_OWNED_DB_NOT_PRIVATE")
  const database = new Database(path, { readonly: true, strict: true })
  try {
    database.exec("BEGIN")
    const session = decode(Schema.Struct({ id: Schema.String, directory: Schema.String, project_id: Schema.String, parent_id: Schema.NullOr(Schema.String) }), database.query("SELECT id,directory,project_id,parent_id FROM session WHERE id=?").get(sessionID), "PILOT_ACTUAL_SESSION_NOT_FOUND")
    requirePilot(session.id === sessionID && session.parent_id === null && session.directory === journal.project, "PILOT_SESSION_NOT_OWNED_PARENT_PROJECT")
    const user = decode(Schema.Struct({ data: Schema.String, time_created: Schema.Number, id: Schema.String }), database.query("SELECT id,data,time_created FROM message WHERE session_id=? AND json_extract(data,'$.role')='user' ORDER BY time_created DESC,id DESC LIMIT 1").get(sessionID), "PILOT_ACTUAL_USER_MESSAGE_MISSING")
    const input = decode(Schema.Struct({ agent: Schema.String, model: Schema.Struct({ providerID: Schema.String, modelID: Schema.String }) }), json(user.data), "PILOT_SESSION_MODEL_EVIDENCE_INVALID")
    requirePilot(input.agent === "maestro" && `${input.model.providerID}/${input.model.modelID}` === journal.model, "PILOT_SESSION_AGENT_OR_MODEL_CHANGED")
    if (!approval) return { projectID: session.project_id, presentation: undefined }
    const { MaestroEvent }: typeof import("../../packages/schema/src/maestro-event") = await import(join(journal.candidate, "packages/schema/src/maestro-event.ts"))
    const { Event }: typeof import("../../packages/schema/src/event") = await import(join(journal.candidate, "packages/schema/src/event.ts"))
    const { renderPresentation }: typeof import("../../packages/orchestra/src/maestro/approval") = await import(join(journal.candidate, "packages/orchestra/src/maestro/approval.ts"))
    const rows = decode(Schema.Array(Schema.Struct({ data: Schema.String })), database.query("SELECT data FROM event WHERE aggregate_id=? AND type=? ORDER BY seq").all(sessionID, Event.versionedType(MaestroEvent.Approval.Presented.type, 1)), "PILOT_APPROVAL_EVENT_SCHEMA_UNAVAILABLE")
    const presented = rows.map((row) => decode(MaestroEvent.Approval.Presented.data, json(row.data), "PILOT_APPROVAL_EVENT_INVALID"))
    requirePilot(new Set(presented.map((item) => item.assistantMessageID)).size === presented.length, "PILOT_APPROVAL_PRESENTATION_NOT_CURRENT")
    const visible = presented.map((item) => {
      requirePilot(item.sessionID === sessionID && item.projectID === session.project_id && item.memberID === "maestro", "PILOT_APPROVAL_BINDING_MISMATCH")
      const rows = decode(Schema.Array(Schema.Struct({ data: Schema.String, message_created: Schema.Number, role: Schema.String })), database.query("SELECT p.data,m.time_created AS message_created,json_extract(m.data,'$.role') AS role FROM part p JOIN message m ON m.id=p.message_id WHERE p.session_id=? AND m.session_id=? AND p.message_id=?").all(sessionID, sessionID, item.assistantMessageID), "PILOT_APPROVAL_PROJECTION_UNAVAILABLE")
      const output = renderPresentation({ ...item, actor: { projectId: item.projectID, sessionId: item.sessionID, memberId: item.memberID } })
      const parts = rows.flatMap((row) => {
        const part = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.Literal("tool"), tool: Schema.Literal("maestro_present_approval"), callID: Schema.String,
          state: Schema.Struct({ status: Schema.Literal("completed"), output: Schema.String, time: Schema.Struct({ end: Schema.Int }) }) }))(json(row.data))
        return Option.isSome(part) && row.role === "assistant" && part.value.callID === item.callID && part.value.state.output === output ? [{ completedAt: part.value.state.time.end, created: row.message_created }] : []
      })
      requirePilot(parts.length === 1, "PILOT_COMPLETED_APPROVAL_OUTPUT_NOT_PROVABLE")
      return { id: item.id, messageID: item.assistantMessageID, output, ...parts[0] }
    }).sort((left, right) => right.created - left.created || right.messageID.localeCompare(left.messageID))
    const current = visible[0]
    const decided = current ? database.query("SELECT id FROM event WHERE aggregate_id=? AND type=? AND json_extract(data,'$.presentationID')=? LIMIT 1").get(sessionID, Event.versionedType(MaestroEvent.Approval.Decided.type, 1), current.id) : undefined
    const afterUser = current && (user.time_created > current.created || (user.time_created === current.created && user.id.localeCompare(current.messageID) > 0))
    return { projectID: session.project_id, presentation: current && !decided && !afterUser ? current : undefined }
  } finally { database.close() }
}

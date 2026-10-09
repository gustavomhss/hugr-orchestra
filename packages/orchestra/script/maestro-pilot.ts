import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, mkdtemp, open, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const deadline = 10 * 60 * 1000
// Git blob IDs from 75546395d0: exact bytes, not security inferred from text matches.
const pinned = [
  ["packages/orchestra/src/auth/index.ts", "4b9ac63bd8a69c6cd6e554bcde95908246ee9cef"],
  ["packages/orchestra/src/plugin/openai/codex.ts", "97f34ae2b4420014b61f0f3a1574aa10dff4e434"],
  ["packages/orchestra/src/plugin/openai/siwc.ts", "203e07b88371a420db664c01e7796401cbad44df"],
  ["packages/core/src/auth/siwc.ts", "6f70d249c2cb3d58558a9ae2e3d85402a1b1b9e3"],
] as const

class PilotError extends Error {}
function fail(code: string): never { throw new PilotError(code) }
function checked<T>(fn: () => T, code: string): T {
  try { return fn() } catch { return fail(code) }
}
async function existing(value: string | undefined, directory: boolean) {
  if (!value || !isAbsolute(value) || value.split("/").includes("..")) fail("PILOT_PATH_INVALID")
  const path = resolve(value)
  if (await realpath(path) !== path) fail("PILOT_PATH_ALIAS_UNSUPPORTED")
  const info = await stat(path)
  if (directory ? !info.isDirectory() : !info.isFile()) fail("PILOT_PATH_KIND_INVALID")
  return path
}

async function main() {
  const args = checked(() => parseArgs({ args: Bun.argv.slice(2), strict: true, options: {
    candidate: { type: "string" }, pilot: { type: "string" }, "auth-source": { type: "string" },
    model: { type: "string", default: "openai/gpt-6.1-sol" },
    "prepare-only": { type: "boolean", default: false }, run: { type: "boolean", default: false },
  } }).values, "PILOT_ARGUMENTS_INVALID")
  if (args.run && args["prepare-only"]) fail("PILOT_MODE_CONFLICT")
  const model = args.model ?? "openai/gpt-6.1-sol"
  if (!model.startsWith("openai/") || !model.slice(7).trim()) fail("PILOT_MODEL_INVALID")
  const candidate = await existing(args.candidate, true)
  const pilot = await existing(args.pilot, true)
  if ((await stat(pilot)).uid !== process.getuid?.()) fail("PILOT_FIXTURE_NOT_OWNED")
  const project = await existing(join(pilot, "project"), true)
  const demand = await existing(join(pilot, "demand.txt"), false)
  const source = await existing(args["auth-source"], false)
  await Promise.all(pinned.map(async ([file, expected]) => {
    const bytes = await Bun.file(join(candidate, file)).bytes()
    if (createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== expected)
      fail("PILOT_CANDIDATE_GUARDED_BASELINE_REQUIRED")
  }))
  await existing(join(candidate, "packages/orchestra/src/index.ts"), false)
  const runtime = await mkdtemp(join(pilot, "maestro-pilot-"))
  const isolated = Object.fromEntries(["HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME", "TMPDIR"].map((key) => [key, join(runtime, key.toLowerCase())]))
  await Promise.all(Object.values(isolated).map((path) => mkdir(path, { mode: 0o700 })))
  const path = process.env.PATH
  Object.assign(process.env, isolated, { TMP: isolated.TMPDIR, TEMP: isolated.TMPDIR, ORCHESTRA_INHERIT_CREDENTIALS: "0" })
  delete process.env.ORCHESTRA_AUTH_CONTENT
  // No Auth/Global import: Schema and Siwc's pure metadata functions only, after isolation.
  const { Option, Schema } = await import("effect")
  const { Siwc }: typeof import("../../core/src/auth/siwc") = await import(join(candidate, "packages/core/src/auth/siwc.ts"))
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  const raw = await (async () => {
    try {
      const info = await input.stat()
      if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077)) fail("PILOT_AUTH_SOURCE_NOT_PRIVATE")
      if (info.size > 1024 * 1024) fail("PILOT_AUTH_SOURCE_TOO_LARGE")
      return await input.readFile("utf8")
    } finally { await input.close() }
  })()
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(raw)
  if (Option.isNone(json)) fail("PILOT_AUTH_JSON_INVALID")
  const store = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(json.value)
  if (Option.isNone(store)) fail("PILOT_AUTH_LEGACY_STORE_MISMATCH")
  if (store.value.openai === undefined) fail("PILOT_AUTH_OPENAI_MISSING")
  const kind = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.String }))(store.value.openai)
  if (Option.isNone(kind) || kind.value.type !== "oauth") fail("PILOT_AUTH_OAUTH_REQUIRED")
  const decoded = Schema.decodeUnknownOption(Schema.Struct({
    type: Schema.Literal("oauth"), access: Schema.NonEmptyString, refresh: Schema.NonEmptyString,
    expires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    accountId: Schema.optional(Schema.String), metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }))(store.value.openai)
  if (Option.isNone(decoded)) fail("PILOT_AUTH_OAUTH_INVALID")
  const auth = decoded.value
  if (!auth.metadata) fail("PILOT_AUTH_METADATA_MISSING")
  const registration = checked(() => Siwc.registration(auth.metadata), "PILOT_AUTH_UNSUPPORTED_LEGACY_REGISTRATION")
  checked(() => Siwc.requirePlanUsage(auth), "PILOT_AUTH_PLAN_USAGE_MISSING")
  if (auth.expires <= Date.now() + deadline + 5 * 60 * 1000) fail("PILOT_AUTH_EXPIRED_OR_TOO_SOON")
  console.log(JSON.stringify({ provider: "openai", type: auth.type, expires: auth.expires, registration: true }))
  if (!args.run) return
  const events = await open(join(runtime, "events.jsonl"), "wx", 0o600)
  const stderr = await open(join(runtime, "stderr.txt"), "wx", 0o600)
  if (auth.expires <= Date.now() + deadline + 5 * 60 * 1000) fail("PILOT_AUTH_EXPIRED_OR_TOO_SOON")
  const child = Bun.spawn([process.execPath, "./src/index.ts", "run", "--dir", project, "--agent", "maestro",
    "--model", model, "--title", "upstream-authoring-candidate", "--format", "json", "--log-level", "WARN"], {
    cwd: join(candidate, "packages/orchestra"), stdin: Bun.file(demand).stream(), stdout: "pipe", stderr: "pipe",
    env: { ...isolated, TMP: isolated.TMPDIR, TEMP: isolated.TMPDIR, PATH: path,
      ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DB: join(runtime, "session.db"),
      ORCHESTRA_AUTH_CONTENT: JSON.stringify({ openai: auth }) },
  })
  // Buffer stdout so secrets spanning chunks are redacted; bounded, no raw stderr persistence.
  const chunks: Uint8Array[] = []
  const size = { value: 0, overflow: false, timedOut: false }
  const readers = [child.stdout.getReader(), child.stderr.getReader()]
  const stop = () => {
    if (child.exitCode === null) child.kill("SIGKILL")
    readers.forEach((reader) => { void reader.cancel().catch(() => undefined) })
  }
  const timer = setTimeout(() => { size.timedOut = true; stop() }, deadline)
  try {
    const drains = readers.map(async (reader, index) => {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return
        if (index !== 0) continue
        size.value += chunk.value.length
        if (size.value > 32 * 1024 * 1024) { size.overflow = true; stop(); return }
        chunks.push(chunk.value)
      }
    })
    const [status] = await Promise.all([child.exited, ...drains])
    const secrets = [auth.access, auth.refresh, registration.idToken].flatMap((value) =>
      [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)]).sort((a, b) => b.length - a.length)
    const text = secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"),
      size.overflow || size.timedOut ? "" : Buffer.concat(chunks).toString("utf8"))
    await events.writeFile(text)
    await stderr.writeFile("PILOT_CHILD_STDERR_WITHHELD\n")
    if (size.overflow) fail("PILOT_OUTPUT_LIMIT")
    if (size.timedOut) fail("PILOT_DEADLINE")
    if (status !== 0) fail("PILOT_CHILD_FAILED")
  } finally {
    clearTimeout(timer)
    stop()
    await Promise.all([events.close(), stderr.close()])
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof PilotError ? error.message : "PILOT_IO_OR_RUNTIME_FAILED")
  process.exitCode = 1
})

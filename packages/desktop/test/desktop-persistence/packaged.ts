// Hosted, unsigned current-source Electron persistence. No provider or owner profile execution.
import assert from "node:assert/strict"
import { Database } from "bun:sqlite"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { machine, tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import { provenance } from "../omni-smoke/build"
import { DesktopProof } from "./transport"
import { isolateWindowsShell } from "./windows-shell"

type Host = Parameters<Parameters<typeof DesktopProof.child>[1]>[0]
type Debugger = Awaited<ReturnType<typeof DesktopProof.connect>>
type Report = { pid: number; packaged: boolean; home: string; db: string; userData: string; resources: string;
  nonce: string; quit: string; token: string; versions: Record<string, string> }
type Event = { name: string; pid: number; actionID?: string; code?: number; windows?: { visible: boolean }[]; displays?: unknown[] }
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const documents = [
  { key: "desktop-persistence-original", text: "Draft café 日本語 🥁\nSecond line", bytes: [0, 1, 127, 128, 255] },
  { key: "desktop-persistence-added", text: "Added after reopen: ação 🌍\nStill here", bytes: [255, 0, 42, 200, 17] },
].map((item) => {
  const id = hash(Uint8Array.from(item.bytes))
  const value = JSON.stringify({ text: item.text, attachment: { blob: { id } } })
  return { ...item, id, value, documentSha256: hash(value) }
})

export async function run(control?: "delete-blob") {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "HOSTED_PROOF_REQUIRED")
  assert.ok(process.env.CI && process.env.GITHUB_RUN_ID, "HOSTED_RUN_REQUIRED")
  assert.ok(["linux", "win32"].includes(process.platform) && process.arch === "x64" &&
    ["x86_64", "amd64", "x64"].includes(machine().toLowerCase()), "LINUX_OR_WINDOWS_X64_REQUIRED")
  assert.ok(control === undefined || control === "delete-blob", "UNKNOWN_CONTROL")
  const manifest = provenance()
  assert.equal(manifest.os, process.platform, "ARTIFACT_PLATFORM_MISMATCH")
  assert.equal(manifest.arch, process.arch, "ARTIFACT_ARCH_MISMATCH")
  assert.equal(String(manifest.run), process.env.GITHUB_RUN_ID, "ARTIFACT_RUN_MISMATCH")
  const runID = process.env.GITHUB_RUN_ID
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined &&
    ["path", "systemroot", "windir", "comspec", "pathext"].includes(key.toLowerCase())))
  const destination = path.resolve(import.meta.dirname, "../../.desktop-persistence-evidence/result.json")
  if (!control) assert.equal(existsSync(destination), false, "SUCCESS_RECEIPT_ALREADY_EXISTS")
  const root = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "desktop-persistence-")))
  const owned = Object.fromEntries(["home", "appdata", "local", "data", "state", "config", "cache", "tmp", "empty", "managed"]
    .map((name) => [name, path.join(root, name)]))
  Object.values(owned).forEach((directory) => mkdirSync(directory))
  writeFileSync(path.join(root, "gitconfig"), "", { mode: 0o600 })
  const nonce = randomUUID()
  const env = { ...inherited, HOME: owned.home, USERPROFILE: owned.home, ORCHESTRA_TEST_HOME: owned.home,
    APPDATA: owned.appdata, LOCALAPPDATA: owned.local, XDG_DATA_HOME: owned.data, XDG_STATE_HOME: owned.state,
    XDG_CONFIG_HOME: owned.config, XDG_CACHE_HOME: owned.cache, TMPDIR: owned.tmp, TMP: owned.tmp, TEMP: owned.tmp,
    ORCHESTRA_DB: path.join(owned.data, "orchestra.sqlite"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_DISABLE_MODELS_FETCH: "true", ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "1", ORCHESTRA_CONFIG_CONTENT: "{}",
    ORCHESTRA_TEST_MANAGED_CONFIG_DIR: owned.managed, ORCHESTRA_DISABLE_PROJECT_CONFIG: "true",
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1", ORCHESTRA_TEST_ONBOARDING: "0", ORCHESTRA_SIDECAR_V2: "0",
    ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV: "[]", ORCHESTRA_DESKTOP_OMNI_SMOKE_NONCE: nonce,
    ORCHESTRA_DESKTOP_OMNI_SMOKE: path.join(root, "report.json"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_SYSTEM: path.join(root, "gitconfig"),
    GIT_CONFIG_COUNT: "0", GIT_TEMPLATE_DIR: owned.empty, LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
    ...(process.platform === "linux" ? { SHELL: "/bin/false" } : {}),
  }
  const lifecycle = { exited: true, closed: true }
  const failure = { failed: false, cause: undefined as unknown }
  const shell = { lease: undefined as Awaited<ReturnType<typeof isolateWindowsShell>>, ready: false, restored: false }
  const phases: Record<string, unknown>[] = []
  const placement = { userData: "", draftDB: "" }
  const mutation = { seeded: false, deleted: false, detected: false }
  const child = async <T>(spec: Parameters<typeof DesktopProof.child>[0], body: (host: Host) => Promise<T>) => {
    lifecycle.exited = false
    lifecycle.closed = false
    return DesktopProof.child({ ...spec, onClosed: () => { lifecycle.exited = true; lifecycle.closed = true } }, async (host) => {
      void host.exited.then(() => { lifecycle.exited = true }, () => {})
      return body(host)
    })
  }
  try {
    shell.lease = await isolateWindowsShell({ appdata: owned.appdata, local: owned.local })
    shell.ready = true
    Object.keys(process.env).forEach((key) => delete process.env[key])
    Object.assign(process.env, env)
    await child({ command: "git", args: ["--version"], cwd: owned.home, env, timeoutMS: 20_000 }, async () => {
      throw new Error("PROOF_BODY_FAILURE_CONTROL")
    }).then(() => assert.fail("PROOF_BODY_FAILURE_NOT_PROPAGATED"), (error: unknown) => {
      assert.ok(error instanceof Error && error.message === "PROOF_BODY_FAILURE_CONTROL", "PROOF_BODY_FAILURE_CHANGED")
      assert.ok(lifecycle.exited && lifecycle.closed, "FAILED_CHILD_TEARDOWN_UNCONFIRMED")
    })
    const git = (args: string[]) => child({ command: "git", args, cwd: owned.home, env, timeoutMS: 20_000 }, async (host) => {
      assert.equal(await deadline(host.exited, 20_000, "GIT_EXIT_TIMEOUT"), 0, "GIT_FAILED")
      return host.output().trim()
    })
    await git(["init", "--quiet", "--initial-branch=proof", `--template=${owned.empty}`, owned.home])
    const gitRoot = statSync(await git(["rev-parse", "--show-toplevel"]), { bigint: true })
    const home = statSync(owned.home, { bigint: true })
    assert.ok(gitRoot.isDirectory() && home.isDirectory() && home.ino !== 0n &&
      gitRoot.dev === home.dev && gitRoot.ino === home.ino, "GIT_ROOT_NOT_ISOLATED")
    await ["seed", "reopen-add", "third-reopen"].reduce(async (previous, phase, index) => {
      await previous
      if (control && index === 2) return
      if (control && index === 1) {
        assert.ok(mutation.seeded && placement.draftDB, "CONTROL_SEED_INCOMPLETE")
        assertOwned(placement.draftDB, root)
        // SQLite requires an explicit read mode when creation is disabled.
        const db = new Database(placement.draftDB, { readwrite: true, create: false })
        const remove = db.prepare("DELETE FROM blob WHERE id = ?")
        const find = db.prepare("SELECT id FROM blob WHERE id = ?")
        try {
          assert.equal(remove.run(documents[0].id).changes, 1, "CONTROL_MUTATION_NOT_APPLIED")
          assert.equal(find.get(documents[0].id), null, "CONTROL_BLOB_STILL_PRESENT")
          mutation.deleted = true
        } finally { remove.finalize(); find.finalize(); db.close(true) }
      }
      const reportFile = env.ORCHESTRA_DESKTOP_OMNI_SMOKE
      ;[reportFile, `${reportFile}.events`, `${reportFile}.quit`].forEach((file) => rmSync(file, { force: true }))
      const port = await reservePort()
      const args = ["--no-sandbox", `--remote-debugging-port=${port}`]
      const launch = process.platform === "linux"
        ? { command: "xvfb-run", args: ["-a", manifest.executable, ...args] }
        : { command: manifest.executable, args }
      await child({ ...launch, cwd: owned.home, env, timeoutMS: 150_000 }, async (host) => {
        const exited = { done: false, code: undefined as number | undefined }
        void host.exited.then((code) => { exited.code = code; exited.done = true }, () => { exited.done = true })
        const report = await until(90_000, host.signal, "APP_REPORT_TIMEOUT", () =>
          existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) as Report
            : exited.done ? (() => { throw new Error("APP_EXITED_BEFORE_REPORT") })() : undefined).catch((error: unknown) => {
            try {
              mkdirSync(path.dirname(destination), { recursive: true })
              writeFileSync(path.join(path.dirname(destination), "startup-failure.json"), JSON.stringify({
                sourceSHA: manifest.sourceSHA, platform: process.platform, phase, error: String(error), exitCode: exited.code ?? null,
                output: startupDiagnostic(host.output(), path.join(process.platform === "win32" ? owned.appdata : owned.config, "ai.hugr.orchestra.beta", "logs")),
              }))
            } catch {
              console.error("STARTUP_DIAGNOSTIC_UNAVAILABLE")
            }
            throw error
          })
        assert.ok(report.packaged && report.versions?.electron && Number.isSafeInteger(report.pid), "ACTUAL_ELECTRON_REQUIRED")
        assert.equal(report.nonce, nonce, "REPORT_NONCE_MISMATCH")
        assert.equal(report.home, owned.home, "HOME_ISOLATION_LOST")
        assert.equal(report.db, env.ORCHESTRA_DB, "PERSISTENT_DB_ISOLATION_LOST")
        assert.equal(realpathSync(report.resources), realpathSync(manifest.resources), "RESOURCES_MANIFEST_MISMATCH")
        assertOwned(report.home, root)
        assertOwned(report.db, root)
        assertOwned(report.userData, root)
        const expected = path.join(process.platform === "win32" ? owned.appdata : owned.config, "ai.hugr.orchestra.beta")
        assert.equal(realpathSync(report.userData), realpathSync(expected), "USERDATA_ISOLATION_LOST")
        assert.equal(report.quit, `${reportFile}.quit`, "QUIT_PATH_NOT_OWNED")
        assert.ok(typeof report.token === "string" && report.token.length > 0, "QUIT_TOKEN_MISSING")
        if (placement.userData) assert.equal(report.userData, placement.userData, "REOPEN_CHANGED_USERDATA")
        placement.userData = report.userData
        placement.draftDB = path.join(report.userData, "drafts.sqlite")
        assertOwned(placement.draftDB, root)
        await until(30_000, host.signal, "VISIBLE_GUI_REQUIRED", () => events(reportFile).find((event) =>
          event.pid === report.pid && event.name === "gui-visible" && event.windows?.some((window) => window.visible) && event.displays?.length))
        const debuggerClient = await DesktopProof.connect(port, host.signal)
        try {
          await until(20_000, host.signal, "REAL_DRAFT_API_REQUIRED", async () => await debuggerClient.evaluate(
            `["draftGet","draftSet","draftBlobPut","draftBlobGet"].every(key => typeof window.api?.[key] === "function")`) === true || undefined)
          if (index > 0) await oracle(debuggerClient, documents.slice(0, index))
          if (control && index === 1) throw new Error("CONTROL_NOT_DETECTED")
          if (index < 2) {
            const item = documents[index]
            assert.equal(await debuggerClient.evaluate(`window.api.draftGet(${JSON.stringify(item.key)})`), null, "NEW_KEY_ALREADY_EXISTS")
            assert.equal(await debuggerClient.evaluate(`window.api.draftBlobPut(new Uint8Array(${JSON.stringify(item.bytes)}).buffer)`), item.id, "BLOB_SHA256_MISMATCH")
            await debuggerClient.evaluate(`window.api.draftSet(${JSON.stringify(item.key)}, ${JSON.stringify(item.value)})`)
          }
          await oracle(debuggerClient, documents.slice(0, index === 0 ? 1 : 2))
        } catch (error) {
          if (!control || index !== 1 || !mutation.seeded || !mutation.deleted ||
            !(error instanceof Error) || error.message !== "DRAFT_BLOB_LOST") throw error
          mutation.detected = true
        } finally {
          debuggerClient.close()
          const actionID = randomUUID()
          const started = Date.now()
          writeFileSync(`${report.quit}.tmp`, JSON.stringify({ token: report.token, actionID }), { mode: 0o600 })
          renameSync(`${report.quit}.tmp`, report.quit)
          assert.equal(await deadline(host.exited, 20_000, "ORDERLY_QUIT_TIMEOUT"), 0, "APP_EXIT_NOT_ZERO")
          const matching = events(reportFile).filter((event) => event.pid === report.pid && event.actionID === actionID)
          assert.ok(["quit-requested", "before-quit", "will-quit", "quit"].every((name) => matching.some((event) => event.name === name)) &&
            matching.some((event) => event.name === "quit" && event.code === 0) && Date.now() - started < 20_000, "ORDERLY_QUIT_WITNESS_MISSING")
          phases.push({ phase: control && index === 1 ? "reopen-mutant" : phase, pid: report.pid, launcherPID: host.pid, versions: report.versions,
            paths: { home: report.home, db: report.db, userData: report.userData, resources: report.resources },
            quit: { actionID, code: 0 }, preservation: mutation.detected ? "DRAFT_BLOB_LOST" : "exact" })
        }
      })
      if (!mutation.detected) inspect(placement.draftDB, documents.slice(0, index === 0 ? 1 : 2))
      if (index === 0) mutation.seeded = true
    }, Promise.resolve())
    assert.equal(phases.length, control ? 2 : 3, "INCOMPLETE_PHASES")
    if (control) assert.ok(mutation.seeded && mutation.deleted && mutation.detected, "CONTROL_NOT_DETECTED")
  } catch (error) {
    failure.failed = true
    failure.cause = error
    throw error
  } finally {
    try {
      if (lifecycle.exited && lifecycle.closed && shell.ready) {
        shell.lease?.restore()
        shell.restored = true
        rmSync(root, { recursive: true })
      }
    } catch (error) {
      if (failure.failed) throw new AggregateError([failure.cause, error], "PROOF_AND_CLEANUP_FAILED", { cause: failure.cause })
      throw error
    }
  }
  assert.ok(lifecycle.exited && lifecycle.closed && shell.restored && !existsSync(root), "CLEANUP_UNCONFIRMED")
  if (control) {
    console.log(JSON.stringify({ control, ...mutation, phases, cleanup: true, shellRestored: shell.restored, failedChildControl: true, reason: "DRAFT_BLOB_LOST" }))
    throw new Error("DRAFT_BLOB_LOST")
  }
  const evidence = { sourceSHA: manifest.sourceSHA, run: runID, platform: process.platform, arch: process.arch,
    executableSha256: manifest.executableSha256, archiveSha256: manifest.archiveSha256,
    addonSha256: manifest.addonSha256, supervisorSha256: manifest.supervisorSha256, bundleHashes: manifest.bundleHashes,
    scope: "unsigned actual current-source Desktop; Linux x64 / Windows x64 only", environment: env,
    root, placement, documents: documents.map((item) => ({ key: item.key, documentSha256: item.documentSha256, blobSha256: item.id })),
    phases, cleanup: true, shellRestored: shell.restored, failedChildControl: true }
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(`${destination}.tmp`, JSON.stringify(evidence, null, 2), { mode: 0o600 })
  renameSync(`${destination}.tmp`, destination)
  return evidence
}

function startupDiagnostic(captured: string, logs: string) {
  const directories = existsSync(logs) ? [logs, ...readdirSync(logs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).slice(0, 8).map((entry) => path.join(logs, entry.name))] : []
  return [captured, ...directories.flatMap((directory) => readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log")).slice(0, 8)
    .map((entry) => readFileSync(path.join(directory, entry.name), "utf8").slice(-100000)))]
    .join("\n").slice(-200000).replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, "[fixture-id]")
    .replace(/[A-Za-z0-9_-]{43}/g, "[fixture-secret]")
}

async function oracle(client: Debugger, expected: typeof documents) {
  await expected.reduce(async (previous, item) => {
    await previous
    const observed = await client.evaluate(`(async () => {
      const value = await window.api.draftGet(${JSON.stringify(item.key)});
      const blob = await window.api.draftBlobGet(${JSON.stringify(item.id)});
      return { value, bytes: blob === null ? null : Array.from(new Uint8Array(blob)) };
    })()`) as { value: unknown; bytes: unknown }
    assert.equal(observed.value, item.value, "DRAFT_DOCUMENT_LOST")
    if (observed.bytes === null) throw new Error("DRAFT_BLOB_LOST")
    assert.deepEqual(observed.bytes, item.bytes, "DRAFT_BLOB_CHANGED")
  }, Promise.resolve())
}

function inspect(filename: string, expected: typeof documents) {
  const db = new Database(filename, { readonly: true, create: false })
  const document = db.prepare<{ value: string }, [string]>("SELECT value FROM document WHERE key = ?")
  const blob = db.prepare<{ data: Uint8Array }, [string]>("SELECT data FROM blob WHERE id = ?")
  try {
    expected.forEach((item) => {
      assert.equal(document.get(item.key)?.value,
        item.value, "DISK_DOCUMENT_NOT_COMMITTED")
      const row = blob.get(item.id)
      assert.ok(row, "DISK_BLOB_NOT_COMMITTED")
      assert.deepEqual(Array.from(row.data), item.bytes, "DISK_BLOB_CHANGED")
    })
  } finally { document.finalize(); blob.finalize(); db.close(true) }
}

function assertOwned(filename: string, root: string) {
  const relative = path.relative(root, realpathSync(filename))
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative), "REPORTED_PATH_NOT_OWNED")
}

function events(filename: string) {
  return existsSync(`${filename}.events`) ? readFileSync(`${filename}.events`, "utf8").trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as Event) : []
}

async function reservePort() {
  const server = createServer()
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
    const address = server.address()
    assert.ok(address && typeof address === "object", "OWNED_TCP_PORT_UNAVAILABLE")
    return address.port
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

async function until<T>(ms: number, signal: AbortSignal, reason: string, read: () => T | undefined | Promise<T | undefined>) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    signal.throwIfAborted()
    const value = await deadline(Promise.resolve().then(read), Math.max(1, end - Date.now()), reason)
    if (value !== undefined) return value
    await Bun.sleep(100)
  }
  throw new Error(reason)
}

async function deadline<T>(operation: Promise<T>, ms: number, reason: string) {
  const timer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer.value = setTimeout(() => reject(new Error(reason)), ms)
    })])
  } finally { clearTimeout(timer.value) }
}

if (import.meta.main) {
  const args = parseArgs({ options: { control: { type: "string" } }, allowPositionals: false }).values
  assert.ok(args.control === undefined || args.control === "delete-blob", "UNKNOWN_CONTROL")
  await run(args.control).catch((error: unknown) => {
    console.error(error instanceof Error ? (error.message === "DRAFT_BLOB_LOST" ? error.message : error) : "DESKTOP_PERSISTENCE_FAILED")
    process.exitCode = 1
  })
}

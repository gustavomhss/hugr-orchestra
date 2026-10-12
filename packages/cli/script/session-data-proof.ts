#!/usr/bin/env bun

// Two preserved development builds, one isolated DB. Admit-only compatibility; no provider execution.
import assert from "node:assert/strict"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { machine, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { Deferred, Effect, Layer, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import type { Scope } from "effect"
import type { SessionInput } from "@orchestra/core/session/input"

const args = parseArgs({
  options: {
    predecessor: { type: "string" }, candidate: { type: "string" }, provenance: { type: "string" },
    report: { type: "string" }, control: { type: "string" }, "control-report": { type: "string" },
  }, strict: true, allowPositionals: false,
}).values
const sessionID = "ses_product_compatibility"
const runSchema = Schema.Struct({ id: Schema.Number, head_sha: Schema.String, conclusion: Schema.Literal("success") })
const receiptSchema = Schema.Struct({
  target: Schema.Literal("windows-arm64"), version: Schema.String, sha256: Schema.String,
  healthy: Schema.Literal(true), wrongPasswordRejected: Schema.Literal(true), unauthenticatedRejected: Schema.Literal(true),
})

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SESSION_DATA_PROOF_FAILED")
  process.exitCode = 1
})

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "HOSTED_PROOF_REQUIRED")
  assert.ok(process.platform === "win32" && process.arch === "arm64" && ["aarch64", "arm64"].includes(machine().toLowerCase()), "NATIVE_WINDOWS_ARM64_REQUIRED")
  assert.equal(process.versions.bun, "1.3.14", "BUN_VERSION_MISMATCH")
  assert.ok(args.predecessor && args.candidate && args.provenance && args.report, "PROOF_INPUTS_REQUIRED")
  assert.ok(args.control === undefined || args.control === "stale-snapshot", "UNKNOWN_CONTROL")
  assert.ok(args.control === undefined || args["control-report"], "CONTROL_REPORT_REQUIRED")
  const report = resolve(args.report)
  assert.equal(await Bun.file(report).exists(), false, "REPORT_ALREADY_EXISTS")
  const provenance = Schema.decodeUnknownSync(Schema.Struct({ predecessor: runSchema, candidate: runSchema }))(
    await Bun.file(args.provenance).json(),
  )
  assert.notEqual(provenance.predecessor.id, provenance.candidate.id, "DISTINCT_RUNS_REQUIRED")
  assert.notEqual(provenance.predecessor.head_sha, provenance.candidate.head_sha, "DISTINCT_SOURCES_REQUIRED")
  assert.ok([provenance.predecessor, provenance.candidate].every((run) => /^[a-f0-9]{40}$/.test(run.head_sha)), "INVALID_SOURCE_SHA")
  const proofSourceSHA = process.env.GITHUB_SHA
  assert.ok(proofSourceSHA && /^[a-f0-9]{40}$/.test(proofSourceSHA), "PROOF_SOURCE_SHA_REQUIRED")
  const sandbox = await mkdtemp(join(await realpath(tmpdir()), "orchestra-session-data-"))
  const database = join(sandbox, "proof.sqlite")
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["path", "systemroot", "windir", "comspec", "pathext", "lang", "lc_all"].includes(key.toLowerCase()),
    )),
    HOME: sandbox, USERPROFILE: sandbox, ORCHESTRA_TEST_HOME: sandbox,
    APPDATA: join(sandbox, "config"), LOCALAPPDATA: join(sandbox, "data"),
    XDG_DATA_HOME: join(sandbox, "data"), XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CONFIG_HOME: join(sandbox, "config"), XDG_CACHE_HOME: join(sandbox, "cache"),
    TMPDIR: join(sandbox, "tmp"), TMP: join(sandbox, "tmp"), TEMP: join(sandbox, "tmp"),
    ORCHESTRA_DB: database, ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_DISABLE_MODELS_FETCH: "true",
    ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "off",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(sandbox, "gitconfig"),
    GIT_CONFIG_SYSTEM: join(sandbox, "gitconfig"), GIT_CONFIG_COUNT: "0", GIT_TEMPLATE_DIR: join(sandbox, "empty"),
  }
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error("SESSION_DATA_PROOF_INTERRUPTED"))
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const deadline = setTimeout(interrupt, 180000)
  const lifecycle = { exitConfirmed: true, scopeClosed: true }
  try {
    await Promise.all(["data", "state", "config", "cache", "tmp", "empty"].map((name) => mkdir(join(sandbox, name))))
    // Global creates directories at import time. Isolate this harness as well as each native child.
    Object.keys(process.env).forEach((key) => delete process.env[key])
    Object.assign(process.env, env)
    const predecessor = await loadBuild(resolve(args.predecessor))
    const candidate = await loadBuild(resolve(args.candidate))
    assert.notEqual(predecessor.sha256, candidate.sha256, "DISTINCT_BINARIES_REQUIRED")
    const { AppProcess } = await import("@orchestra/core/process")
    const { SessionInput } = await import("@orchestra/core/session/input")
    const { NodeServices } = await import("@effect/platform-node")
    const admissionSchema = Schema.Struct({ data: SessionInput.Admitted })
    const processLayer = AppProcess.layerWith("off").pipe(Layer.provide(NodeServices.layer))
    const withChild = <A, E>(command: ChildProcess.Command, body: (handle: ChildProcessHandle) => Effect.Effect<A, E, Scope.Scope>) => {
      lifecycle.exitConfirmed = false
      lifecycle.scopeClosed = false
      return boundedServer(Effect.runPromise(Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const handle = yield* processes.spawn(command)
        yield* Effect.addFinalizer(() => Effect.gen(function* () {
          if (yield* handle.isRunning) yield* handle.kill({ killSignal: "SIGTERM" }).pipe(
            Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => handle.kill({ killSignal: "SIGKILL" }).pipe(Effect.timeout("5 seconds")) }), Effect.orDie)
          assert.equal(yield* handle.isRunning, false, "CHILD_EXIT_NOT_CONFIRMED")
          lifecycle.exitConfirmed = true
        }).pipe(Effect.orDie))
        // Own bounded termination here; avoid an unbounded release wait for a still-running referenced child.
        yield* handle.unref
        return yield* body(handle)
      }).pipe(Effect.scoped, Effect.provide(processLayer),
        Effect.onExit(() => Effect.sync(() => { lifecycle.scopeClosed = true }))), { signal: controller.signal }), controller)
    }
    const run = (binary: string, command: string[]) => withChild(
      ChildProcess.make(binary, command, { cwd: sandbox, env, extendEnv: false }),
      (handle) => Effect.gen(function* () {
        yield* handle.stderr.pipe(Stream.runDrain, Effect.forkScoped)
        const result = yield* Effect.all([AppProcess.collectStream(handle.stdout, 65536), handle.exitCode], { concurrency: "unbounded" })
        assert.equal(result[1], 0, `CHILD_COMMAND_FAILED:${command.join(" ")}`)
        assert.equal(result[0].truncated, false, "CHILD_OUTPUT_TRUNCATED")
        return result[0].buffer.toString("utf8").trim()
      }).pipe(Effect.timeout("20 seconds")),
    )
    // An actual Git root bounds ancestor config/plugin discovery to this empty sandbox.
    await run("git", ["init", "--quiet", "--initial-branch=proof", sandbox])
    assert.equal(await realpath(await run("git", ["rev-parse", "--show-toplevel"])), sandbox, "ISOLATED_GIT_ROOT_MISMATCH")
    const records: SessionInput.Admitted[] = []
    const prompts = [
      { id: "msg_predecessor_steer", delivery: "steer", prompt: { text: "Original steer" }, resume: false },
      { id: "msg_predecessor_queue", delivery: "queue", prompt: { text: "Original queue" }, resume: false },
      { id: "msg_candidate_write", delivery: "queue", prompt: { text: "Written after upgrade" }, resume: false },
      { id: "msg_return_write", delivery: "steer", prompt: { text: "Written after return" }, resume: false },
    ]
    const phases = [
      { name: "predecessor-seed", build: predecessor, add: prompts.slice(0, 2) },
      { name: "candidate-upgrade", build: candidate, add: prompts.slice(2, 3) },
      { name: "candidate-relaunch", build: candidate, add: [] },
      { name: "predecessor-return", build: predecessor, add: prompts.slice(3) },
      { name: "candidate-reopen", build: candidate, add: [] },
    ]
    const observations: { phase: string; inputs: number; events: number; datasetHash: string }[] = []
    await phases.reduce<Promise<ReturnType<typeof inspect> | undefined>>(async (previousPromise, phase) => {
      const previous = await previousPromise
      // Deliberately restoring the pre-upgrade snapshot must lose candidate writes and fail the same oracle.
      if (phase.name === "predecessor-return" && args.control === "stale-snapshot") {
        await Promise.all([`${database}-wal`, `${database}-shm`].map((file) => rm(file, { force: true })))
        await copyFile(join(sandbox, "pre-upgrade.sqlite"), database)
      }
      assert.equal(await run(phase.build.path, ["--version"]), phase.build.version, "BINARY_VERSION_MISMATCH")
      const password = await run(phase.build.path, ["service", "password"])
      assert.match(password, /^[A-Za-z0-9_-]{43}$/, "SERVER_PASSWORD_INVALID")
      // Foreground serve gives this scope a real process handle for bounded teardown.
      await withChild(ChildProcess.make(phase.build.path,
        ["serve", "--hostname", "127.0.0.1", "--port", "0"], { cwd: sandbox, env, extendEnv: false }), (handle) => Effect.gen(function* () {
        const ready = yield* Deferred.make<URL, Error>()
        yield* handle.stdout.pipe(Stream.decodeText, Stream.splitLines, Stream.runForEach((line) =>
          line.startsWith("server listening on ")
            ? Effect.sync(() => new URL(line.slice("server listening on ".length))).pipe(Effect.flatMap((url) => Deferred.succeed(ready, url)))
            : Effect.void),
          Effect.andThen(Deferred.fail(ready, new Error("SERVER_EXITED_BEFORE_READY"))),
          Effect.catch(() => Deferred.fail(ready, new Error("SERVER_STDOUT_FAILED"))), Effect.forkScoped)
        yield* handle.stderr.pipe(Stream.runDrain, Effect.forkScoped)
        const endpoint = yield* Deferred.await(ready).pipe(Effect.timeout("20 seconds"))
        yield* Effect.promise(async () => {
        assert.ok(endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1" && endpoint.port &&
          !endpoint.username && !endpoint.password && endpoint.pathname === "/" && !endpoint.search && !endpoint.hash,
          "DAEMON_NOT_ISOLATED_LOOPBACK")
        const request = async (route: string, payload?: unknown, status = 200): Promise<unknown> => {
          const response = await fetch(new URL(route, endpoint), {
            method: payload === undefined ? "GET" : "POST",
            headers: { Authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`, "Content-Type": "application/json" },
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), redirect: "error",
          })
          assert.equal(response.status, status, `HTTP_STATUS_MISMATCH:${route}`)
          return response.json()
        }
        if (!previous) {
          const created = await request("/api/session", { id: sessionID, location: { directory: sandbox } })
          assert.equal(Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Struct({ id: Schema.String }) }))(created).data.id, sessionID)
        }
        if (previous) {
          // Check before retry: retry may legally re-admit missing records, masking a destructive migration.
          const observed = inspect(database)
          try {
            assert.deepEqual(observed, previous, "CANDIDATE_WRITES_LOST_OR_DATA_CHANGED")
          } catch (error) {
            if (!(error instanceof assert.AssertionError) || args.control !== "stale-snapshot" || phase.name !== "predecessor-return") throw error
            assert.deepEqual(observations.map((item) => item.phase), ["predecessor-seed", "candidate-upgrade", "candidate-relaunch"], "CONTROL_PRECEDING_PHASES_MISSING")
            assert.deepEqual(observed, inspect(join(sandbox, "pre-upgrade.sqlite")), "CONTROL_NOT_PRE_UPGRADE_DATASET")
            assert.ok(args["control-report"], "CONTROL_REPORT_REQUIRED")
            await Bun.write(args["control-report"], JSON.stringify({ control: "stale-snapshot", phase: phase.name,
              precedingPhases: observations.map((item) => item.phase), snapshotRestored: true, reason: "CANDIDATE_WRITES_LOST_OR_DATA_CHANGED" }))
            throw new Error("STALE_SNAPSHOT_CONTROL_DETECTED")
          }
          const session = await request(`/api/session/${sessionID}`)
          assert.equal(Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Struct({ id: Schema.String }) }))(session).data.id, sessionID)
        }
        const context = await request(`/api/session/${sessionID}/context`)
        assert.deepEqual(context, { data: [] }, "ADMIT_ONLY_BECAME_VISIBLE")
        await records.reduce(async (pending, recorded, index) => {
          await pending
          const retried = Schema.decodeUnknownSync(admissionSchema)(await request(`/api/session/${sessionID}/prompt`, prompts[index])).data
          assert.deepEqual(retried, recorded, "RETRY_IDENTITY_CHANGED")
        }, Promise.resolve())
        if (previous) assert.deepEqual(inspect(database), previous, "RETRY_ADDED_DURABLE_ROWS")
        await phase.add.reduce(async (pending, prompt) => {
          await pending
          const admitted = Schema.decodeUnknownSync(admissionSchema)(await request(`/api/session/${sessionID}/prompt`, prompt)).data
          assert.equal(admitted.id, prompt.id)
          assert.equal(admitted.delivery, prompt.delivery)
          assert.deepEqual(admitted.prompt, prompt.prompt)
          assert.equal(admitted.promotedSeq, undefined)
          assert.equal(admitted.admittedSeq, records.length + 1)
          records.push(admitted)
        }, Promise.resolve())
        await request(`/api/session/${sessionID}/prompt`, { ...prompts[0], delivery: "queue" }, 409)
        })
      }))
      const current = inspect(database)
      assert.equal(current.inputs.length, records.length, "INBOX_COUNT_MISMATCH")
      assert.equal(current.events.length, records.length + 1, "EVENT_COUNT_MISMATCH")
      assert.deepEqual(current.inputs.map((row) => row.id), records.map((record) => record.id), "INBOX_IDS_CHANGED")
      assert.deepEqual(current.events.map((row) => row.seq), Array.from({ length: records.length + 1 }, (_, index) => index), "EVENT_SEQUENCE_CHANGED")
      assert.deepEqual(current.messages, [], "ADMIT_ONLY_BECAME_VISIBLE")
      assert.equal(current.sessions.length, 1, "SESSION_ROW_MISSING")
      assert.deepEqual(current.sequences.map((row) => [row.aggregate_id, row.seq]), [[sessionID, records.length]], "EVENT_CURSOR_CHANGED")
      if (previous) {
        assert.deepEqual(current.sessions, previous.sessions, "SESSION_FIELDS_CHANGED")
        assert.deepEqual(current.inputs.slice(0, previous.inputs.length), previous.inputs, "PRIOR_INPUTS_CHANGED")
        assert.deepEqual(current.events.slice(0, previous.events.length), previous.events, "PRIOR_EVENTS_CHANGED")
      }
      if (phase.name === "predecessor-seed") {
        const snapshot = new Database(database, { readonly: true, create: false })
        try {
          await Bun.write(join(sandbox, "pre-upgrade.sqlite"), snapshot.serialize())
        } finally {
          snapshot.close(true)
        }
      }
      observations.push({ phase: phase.name, inputs: current.inputs.length, events: current.events.length,
        datasetHash: createHash("sha256").update(JSON.stringify(current)).digest("hex") })
      return current
    }, Promise.resolve(undefined))
    assert.equal(observations.length, phases.length, "INCOMPLETE_PHASES")
    await Bun.write(report, JSON.stringify({ platform: process.platform, arch: process.arch,
      proofSourceSHA, provenance, predecessor, candidate, observations }) + "\n")
    console.log(`SESSION_DATA_PROOF_OK:${observations.length} phases`)
  } finally {
    clearTimeout(deadline)
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    assert.ok(lifecycle.exitConfirmed && lifecycle.scopeClosed, `SERVER_CLEANUP_UNCONFIRMED_SANDBOX_RETAINED:${sandbox}`)
    await rm(sandbox, { recursive: true, force: true })
  }
}

async function boundedServer<A>(operation: Promise<A>, controller: AbortController) {
  // Effect finalizers are uninterruptible. Bound the caller's wait too; an unfinished scope retains its sandbox.
  const interrupted = Promise.withResolvers<never>()
  const abort = () => interrupted.reject(controller.signal.reason)
  controller.signal.addEventListener("abort", abort)
  if (controller.signal.aborted) abort()
  const deadline = setTimeout(() => controller.abort(new Error("SERVER_SCOPE_TIMEOUT")), 45000)
  try {
    return await Promise.race([operation, interrupted.promise])
  } finally {
    clearTimeout(deadline)
    controller.signal.removeEventListener("abort", abort)
  }
}

async function loadBuild(directory: string) {
  const { readCliManifest, verifyCliArtifact } = await import("../../desktop/src/main/cli-artifacts")
  const manifest = await readCliManifest(directory)
  assert.equal(manifest.artifacts.length, 1, "ONE_TARGET_REQUIRED")
  const artifact = await verifyCliArtifact(directory, "windows-arm64")
  const receipt = Schema.decodeUnknownSync(receiptSchema)(await Bun.file(join(directory, "runtime-proof.json")).json())
  assert.equal(receipt.version, artifact.version, "RECEIPT_VERSION_MISMATCH")
  assert.equal(receipt.sha256, manifest.artifacts[0].sha256, "RECEIPT_DIGEST_MISMATCH")
  const header = Buffer.from(await Bun.file(artifact.path).slice(0, 64).arrayBuffer())
  assert.equal(header.subarray(0, 2).toString(), "MZ", "PE_HEADER_MISSING")
  const offset = header.readUInt32LE(60)
  const pe = Buffer.from(await Bun.file(artifact.path).slice(offset, offset + 6).arrayBuffer())
  assert.ok(pe.subarray(0, 4).equals(Buffer.from([80, 69, 0, 0])) && pe.readUInt16LE(4) === 0xaa64, "PE_ARM64_REQUIRED")
  return { ...artifact, sha256: receipt.sha256 }
}

function inspect(filename: string) {
  const db = new Database(filename, { readonly: true, create: false })
  try {
    const rows = (query: string) => db.query<Record<string, string | number | null>, [string]>(query).all(sessionID)
    return {
      inputs: rows("SELECT * FROM session_input WHERE session_id = ? ORDER BY admitted_seq"),
      events: rows("SELECT * FROM event WHERE aggregate_id = ? ORDER BY seq"),
      messages: rows("SELECT * FROM session_message WHERE session_id = ? ORDER BY seq"),
      sessions: rows("SELECT * FROM session WHERE id = ?"),
      sequences: rows("SELECT * FROM event_sequence WHERE aggregate_id = ?"),
    }
  } finally {
    db.close(true)
  }
}

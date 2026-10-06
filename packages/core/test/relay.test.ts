import { describe, expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "fs"
import { Effect, Fiber, Layer, Redacted, Result, Schema } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { ArmState } from "@opencode-ai/relay/arm/state"
import { LedgerVerify } from "@opencode-ai/relay/ledger/verify"
import { Config } from "../src/config"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { Project } from "../src/project"
import { Relay } from "../src/relay"
import { AbsolutePath } from "../src/schema"
import { ConfigV1 } from "../src/v1/config/config"
import { ConfigMigrateV1 } from "../src/v1/config/migrate"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// WP10: the Relay engine bound as a Location node, against a real bash, the real AppProcess and real files. Linux-only
// like every check test (R11).
const it = testEffect(Layer.empty)
const projectID = "relay-project"

interface Dirs {
  readonly data: string
  readonly home: string
  readonly work: string
}

const fixture = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(
  Effect.map((tmp) => {
    const dirs = {
      data: path.join(tmp.path, "data"),
      home: path.join(tmp.path, "home"),
      work: path.join(tmp.path, "work"),
    }
    Object.values(dirs).forEach((dir) => mkdirSync(dir))
    return dirs
  }),
)

// A fresh service over the same data directory, as a reopened Location would build it. Config documents are decoded
// with the real schema, lowest priority first.
function use<A, E>(
  dirs: Dirs,
  body: (relay: Relay.Interface) => Effect.Effect<A, E>,
  configs: ReadonlyArray<unknown> = [],
) {
  const directory = AbsolutePath.make(dirs.work)
  const documents = configs.map(
    (info) => new Config.Document({ type: "document", info: Schema.decodeUnknownSync(Config.Info)(info) }),
  )
  const layer = AppNodeBuilder.build(LayerNode.group([Relay.node]), [
    [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
    [
      Location.node,
      Layer.succeed(
        Location.Service,
        Location.Service.of({ directory, project: { id: Project.ID.make(projectID), directory } }),
      ),
    ],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed(documents) }))],
  ])
  return Relay.Service.pipe(Effect.flatMap(body), Effect.provide(layer))
}

// Sets process variables for the effect and restores them after: the only way to show what a check does not inherit.
function withEnv<A, E, R>(values: Readonly<Record<string, string>>, effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]))
      Object.assign(process.env, values)
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() =>
        Object.entries(previous).forEach(([name, value]) => {
          if (value === undefined) delete process.env[name]
          if (value !== undefined) process.env[name] = value
        }),
      ),
  )
}

// Real-time polling: checks run in real time even when the Effect clock is a TestClock.
async function poll<A>(read: () => A | undefined, tries = 500): Promise<A> {
  const value = read()
  if (value !== undefined) return value
  if (tries === 0) throw new Error("polling timed out")
  await Bun.sleep(20)
  return poll(read, tries - 1)
}

const pid = (file: string) =>
  Effect.promise(() =>
    poll(() => (existsSync(file) ? Number(readFileSync(file, "utf8").trim()) || undefined : undefined)),
  )

// A killed process whose parent died can stay a zombie until init reaps it; a zombie runs nothing.
function alive(process_: number) {
  if (Result.isFailure(Result.try(() => process.kill(process_, 0)))) return false
  const state = Bun.spawnSync(["ps", "-o", "stat=", "-p", String(process_)])
    .stdout.toString()
    .trim()
  return state !== "" && !state.startsWith("Z")
}

const gone = (process_: number) => Effect.promise(() => poll(() => (alive(process_) ? undefined : true)))

function lines(file: string) {
  return readFileSync(file, "utf8").trimEnd().split("\n")
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

const installed = {
  event: "hook-installed",
  install: "h-0123",
  document: "doc-generated",
  version: "v1",
  sha256: "0".repeat(64),
  principal: "user:ana",
}

describe("Relay.Service", () => {
  it.live("keeps arms, hook ledgers and an owner-only ledger.key under <Global.data>/relay/<projectID>", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const root = path.join(dirs.data, "relay", projectID)
      const ledger = path.join(root, "hooks", "h-0123", "ledger.jsonl")
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          expect(relay.paths).toEqual({
            root,
            authoring: path.join(root, "authoring.sqlite3"),
            arms: path.join(root, "arms"),
            hooks: path.join(root, "hooks"),
            key: path.join(root, "ledger.key"),
          })
          // Opening the Location touches nothing; the first operation that needs the data creates it.
          expect(existsSync(root)).toBe(false)
          expect((yield* relay.record("h-0123", installed)).seq).toBe(0)
          expect(
            yield* relay.create({
              token: "run-1",
              sprint: { work_packages: [{ id: "wp-1" }] },
              meta: { workdir: dirs.work },
            }),
          ).toBe("created")
          // An install ID names a directory.
          expect((yield* relay.record("../escape", installed).pipe(Effect.flip)).reason).toBe("install-invalid")
        }),
      )
      expect(statSync(root).mode & 0o777).toBe(0o700)
      expect(statSync(path.join(root, "ledger.key")).mode & 0o777).toBe(0o600)
      const key = readFileSync(path.join(root, "ledger.key"), "utf8")
      expect(key).toMatch(/^[0-9a-f]{64}$/)
      expect(existsSync(path.join(root, "arms", "run-1", "sprint.json"))).toBe(true)
      expect(existsSync(path.join(dirs.data, "relay", "escape"))).toBe(false)
      // `ts` is stamped first, the chain suffix last, and the chain is keyed with ledger.key.
      expect(Object.keys(JSON.parse(lines(ledger)[0]!))).toEqual([
        "ts",
        ...Object.keys(installed),
        "gen",
        "prev",
        "seq",
        "mac",
        "h",
      ])
      expect((yield* LedgerVerify.verify(ledger, Redacted.make(key))).exit).toBe(0)
      expect((yield* LedgerVerify.verify(ledger)).stdout).toStartWith("REFUSED line 1: this is a KEYED chain")

      // A reopened Location reuses the key and extends the same chain.
      yield* use(dirs, (relay) => relay.record("h-0123", { ...installed, event: "hook-disabled" }))
      expect(readFileSync(path.join(root, "ledger.key"), "utf8")).toBe(key)
      expect(lines(ledger)).toHaveLength(2)
      expect((yield* LedgerVerify.verify(ledger, Redacted.make(key))).exit).toBe(0)
    }),
  )

  it.live("refuses a ledger.key it did not write instead of replacing it, and keeps the key owner-only", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const root = path.join(dirs.data, "relay", projectID)
      const file = path.join(root, "ledger.key")
      const record = use(dirs, (relay) => relay.record("h-0123", installed))
      mkdirSync(root, { recursive: true })

      writeFileSync(file, "not a key")
      expect((yield* record.pipe(Effect.flip)).reason).toBe("key-acquisition")
      expect(readFileSync(file, "utf8")).toBe("not a key")

      // A symlink is refused even when it points at a well-formed key.
      rmSync(file)
      writeFileSync(path.join(dirs.home, "elsewhere"), "a".repeat(64), { mode: 0o600 })
      symlinkSync(path.join(dirs.home, "elsewhere"), file)
      expect((yield* record.pipe(Effect.flip)).reason).toBe("key-acquisition")

      rmSync(file)
      const key = "b".repeat(64)
      writeFileSync(file, key)
      chmodSync(file, 0o644)
      yield* record
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(readFileSync(file, "utf8")).toBe(key)
      expect(
        (yield* LedgerVerify.verify(path.join(root, "hooks", "h-0123", "ledger.jsonl"), Redacted.make(key))).exit,
      ).toBe(0)
    }),
  )

  it.live("runs a check with PATH, HOME and the run's params only", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const startup = path.join(dirs.home, "startup.sh")
      writeFileSync(startup, `touch "${path.join(dirs.work, "startup-ran")}"\n`)
      const check = 'env > "$PWD/env.txt"'
      const verified = yield* withEnv(
        {
          ANTHROPIC_API_KEY: "sk-ant-provider-key",
          OPENAI_API_KEY: "sk-provider-key",
          GITHUB_TOKEN: "ghp_provider_token",
          RELAY_LEDGER_KEY: "c".repeat(64),
          RELAY_JUDGE_API_KEY: "judge-from-env",
          BASH_ENV: startup,
        },
        use(dirs, (relay) =>
          relay.verify({
            installID: "h-env",
            nodeID: "env",
            message: "Environment",
            check,
            workdir: dirs.work,
            params: { test_cmd: "bun test", BASH_ENV: startup },
          }),
        ),
      )
      expect(verified).toEqual({ verdict: "pass", oracle: sha256(check), ledgerSeq: 0 })
      const dump = readFileSync(path.join(dirs.work, "env.txt"), "utf8")
      const names = dump
        .split("\n")
        .flatMap((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1] ?? [])
        // Bash sets these itself.
        .filter((name) => !["PWD", "OLDPWD", "SHLVL", "_"].includes(name))
      expect(names.toSorted()).toEqual(["HOME", "PATH", "test_cmd"])
      expect(dump).toContain(`HOME=${dirs.home}\n`)
      expect(dump).toContain("test_cmd=bun test\n")
      // BASH_ENV never reached the fresh bash, from the process or from the params.
      expect(existsSync(path.join(dirs.work, "startup-ran"))).toBe(false)
      const root = path.join(dirs.data, "relay", projectID)
      expect(dump).not.toContain(readFileSync(path.join(root, "ledger.key"), "utf8"))
      // The verdict is the gate core's checklist-item, recorded in the install's keyed ledger.
      const item = JSON.parse(lines(path.join(root, "hooks", "h-env", "ledger.jsonl"))[0]!)
      expect(item).toMatchObject({
        wp: "env",
        i: 0,
        event: "checklist-item",
        item: "env",
        assert: "Environment",
        verdict: "pass",
        graded_by: "deterministic",
        oracle: sha256(check),
        origin: "hook",
        mac: "hmac-sha256",
      })
    }),
  )

  it.live("grades a failing check as a fail and a check that cannot run as unavailable", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          const verify = (check: string) =>
            relay.verify({ installID: "h-grade", nodeID: "types", message: "Types", check, workdir: dirs.work })
          // Only the final status decides, as in the gate core.
          expect(yield* verify("false; true")).toMatchObject({ verdict: "pass", ledgerSeq: 0 })
          expect(yield* verify("true; false")).toMatchObject({ verdict: "fail", ledgerSeq: 1 })
          expect(yield* verify("")).toEqual({ verdict: "unavailable", reason: "invalid-command", oracle: "" })
          // A workdir that is not there cannot run the check.
          expect(
            yield* relay.verify({
              installID: "h-grade",
              nodeID: "types",
              message: "Types",
              check: "true",
              workdir: path.join(dirs.work, "missing"),
            }),
          ).toMatchObject({ verdict: "unavailable", reason: "spawn", ledgerSeq: 2 })
          // Neither can a host without bash.
          const empty = path.join(dirs.home, "no-bash")
          mkdirSync(empty)
          expect(yield* withEnv({ PATH: empty }, verify("true"))).toMatchObject({
            verdict: "unavailable",
            reason: "missing",
            ledgerSeq: 3,
          })
        }),
      )
    }),
  )

  it.effect("kills a verify's process group at 60 seconds", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          const fiber = yield* relay
            .verify({
              installID: "h-slow",
              nodeID: "slow",
              message: "Slow",
              check: 'echo $$ > "$PWD/shell.pid"; sleep 1000 & echo $! > "$PWD/child.pid"; wait',
              workdir: dirs.work,
            })
            .pipe(Effect.forkChild)
          const shell = yield* pid(path.join(dirs.work, "shell.pid"))
          const child = yield* pid(path.join(dirs.work, "child.pid"))
          yield* TestClock.adjust("59 seconds")
          expect(fiber.pollUnsafe()).toBeUndefined()
          expect(alive(child)).toBe(true)
          yield* TestClock.adjust("1 second")
          expect(yield* Fiber.join(fiber)).toMatchObject({ verdict: "unavailable", reason: "timeout", ledgerSeq: 0 })
          yield* gone(shell)
          yield* gone(child)
        }),
      )
    }),
  )

  it.effect("kills a gate check's process group at 15 minutes", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          const fiber = yield* relay
            .check({
              sprint: {
                work_packages: [
                  {
                    id: "build",
                    checklist: [
                      { id: "quick", cmd: "true" },
                      { id: "slow", cmd: 'echo $$ > "$PWD/shell.pid"; sleep 3600 & echo $! > "$PWD/child.pid"; wait' },
                    ],
                  },
                ],
              },
              workdir: dirs.work,
              params: {},
            })
            .pipe(Effect.forkChild)
          const shell = yield* pid(path.join(dirs.work, "shell.pid"))
          const child = yield* pid(path.join(dirs.work, "child.pid"))
          yield* TestClock.adjust("14 minutes")
          yield* TestClock.adjust("59 seconds")
          expect(fiber.pollUnsafe()).toBeUndefined()
          expect(alive(child)).toBe(true)
          yield* TestClock.adjust("1 second")
          expect(yield* Fiber.join(fiber)).toEqual({ outcome: "check", i: 0, wp: "build", failing: ["slow"] })
          yield* gone(shell)
          yield* gone(child)
        }),
      )
    }),
  )

  it.live("runs one verify at a time", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const marker = (name: string) => path.join(dirs.work, name)
      const blocking = (name: string, release: string) =>
        `touch "$PWD/${name}"; while [ ! -e "$PWD/${release}" ]; do sleep 0.05; done`
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          // The instrument: dry checks are not serialized, so a second one starts while the first still blocks.
          const plan = (id: string, cmd: string) => ({
            sprint: { work_packages: [{ id, checklist: [{ id, cmd }] }] },
            workdir: dirs.work,
            params: {},
          })
          const held = yield* relay.check(plan("held", blocking("held.started", "held.release"))).pipe(Effect.forkChild)
          yield* Effect.promise(() => poll(() => existsSync(marker("held.started")) || undefined))
          const free = yield* relay.check(plan("free", 'touch "$PWD/free.started"')).pipe(Effect.forkChild)
          yield* Effect.promise(() => poll(() => existsSync(marker("free.started")) || undefined))
          writeFileSync(marker("held.release"), "")
          yield* Fiber.join(held)
          yield* Fiber.join(free)

          const verify = (nodeID: string, check: string) =>
            relay.verify({ installID: "h-serial", nodeID, message: nodeID, check, workdir: dirs.work })
          const first = yield* verify("first", blocking("first.started", "first.release")).pipe(Effect.forkChild)
          yield* Effect.promise(() => poll(() => existsSync(marker("first.started")) || undefined))
          const second = yield* verify("second", 'touch "$PWD/second.started"').pipe(Effect.forkChild)
          // Far longer than the dry check above needed to start.
          yield* Effect.promise(() => Bun.sleep(1000))
          expect(existsSync(marker("second.started"))).toBe(false)
          writeFileSync(marker("first.release"), "")
          expect(yield* Fiber.join(first)).toMatchObject({ verdict: "pass", ledgerSeq: 0 })
          expect(yield* Fiber.join(second)).toMatchObject({ verdict: "pass", ledgerSeq: 1 })
          expect(existsSync(marker("second.started"))).toBe(true)
        }),
      )
    }),
  )

  it.live("takes the judge from relay.judge config, never from a provider key or the environment", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      writeFileSync(path.join(dirs.work, "a.txt"), "hello\n")
      const seen: Array<{ readonly key: string | null; readonly model: unknown }> = []
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            port: 0,
            fetch: async (request) => {
              const body = (await request.json()) as { readonly model: unknown }
              seen.push({ key: request.headers.get("x-api-key"), model: body.model })
              return Response.json({
                content: [
                  { type: "tool_use", name: "submit_verdict", input: { verdict: "pass", reason: "Says hello." } },
                ],
              })
            },
          }),
        ),
        (server) => Effect.sync(() => server.stop(true)),
      )
      const url = server.url.href.replace(/\/$/, "")
      const run = (configs: ReadonlyArray<unknown>) =>
        use(
          dirs,
          (relay) =>
            relay
              .check({
                sprint: {
                  work_packages: [
                    {
                      id: "review",
                      checklist: [{ id: "says-hello", judge: "a.txt says hello", context: "a.txt", blocking: true }],
                    },
                  ],
                },
                workdir: dirs.work,
                params: {},
              })
              .pipe(Effect.map((outcome) => ({ outcome, judge: relay.judge }))),
          configs,
        )
      yield* withEnv(
        {
          ANTHROPIC_API_KEY: "sk-ant-provider-key",
          RELAY_JUDGE_BACKEND: "api",
          RELAY_JUDGE_API_KEY: "judge-from-env",
          RELAY_JUDGE_BASE_URL: url,
        },
        Effect.gen(function* () {
          // Later documents override earlier ones key by key.
          const configured = yield* run([
            { relay: { judge: { backend: "api", baseURL: url, apiKey: "relay-judge-key" } } },
            { relay: { judge: { model: "relay-model" } } },
          ])
          expect(configured.outcome).toEqual({ outcome: "check", i: 0, wp: "review", failing: [] })
          expect(configured.judge).toMatchObject({ backend: "api", model: "relay-model", baseURL: url })
          // An endpoint without a configured key gets none, never the provider's.
          expect((yield* run([{ relay: { judge: { backend: "api", baseURL: url } } }])).outcome).toEqual(
            configured.outcome,
          )
          // Without relay.judge the stub grades: no request, and the file lacks its marker.
          const unconfigured = yield* run([])
          expect(unconfigured.judge).toMatchObject({ backend: "stub", apiKey: undefined, baseURL: undefined })
          expect(unconfigured.outcome).toEqual({ outcome: "check", i: 0, wp: "review", failing: ["says-hello"] })
        }),
      )
      expect(seen).toEqual([
        { key: "relay-judge-key", model: "relay-model" },
        { key: "", model: "claude-sonnet-4-6" },
      ])
    }),
  )

  it.effect("reads relay.judge from V2 and V1 config files", () =>
    Effect.sync(() => {
      const relay = {
        judge: { backend: "api", model: "judge-model", apiKey: "k", votes: 3, maxContext: 1000, maxTokens: 10 },
      }
      expect(Schema.decodeUnknownSync(Config.Info)({ relay }).relay).toMatchObject(relay)
      // A file with any V1 key is migrated, and the relay section survives it.
      const migrated = ConfigMigrateV1.migrate(Schema.decodeUnknownSync(ConfigV1.Info)({ provider: {}, relay }))
      expect(Schema.decodeUnknownSync(Config.Info)(migrated).relay).toMatchObject(relay)
      expect(() => Schema.decodeUnknownSync(Config.Info)({ relay: { judge: { backend: "cli" } } })).toThrow()
    }),
  )

  it.live("recovers only a stale run lock, noting it in the arm's ledger", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* use(dirs, (relay) =>
        Effect.gen(function* () {
          yield* relay.create({
            token: "run-stale",
            sprint: { gen: 2, work_packages: [{ id: "build", macro: "m" }, { id: "test" }] },
            meta: { workdir: dirs.work },
          })
          const arm = path.join(relay.paths.arms, "run-stale")
          const lock = path.join(arm, ".run.lock")
          const past = new Date(performance.timeOrigin - 60_000)
          writeFileSync(path.join(arm, "position"), "m.build")

          // Taken since this process started: it may belong to a live evaluation this process cannot see.
          mkdirSync(lock)
          expect(yield* relay.recover("run-stale")).toBe(false)
          rmdirSync(lock)
          // Held by an evaluation in this process, however old it looks.
          yield* ArmState.withRunLock(
            arm,
            Effect.gen(function* () {
              utimesSync(lock, past, past)
              expect(yield* relay.recover("run-stale")).toBe(false)
            }),
          )
          expect(existsSync(path.join(arm, "ledger.jsonl"))).toBe(false)

          mkdirSync(lock)
          utimesSync(lock, past, past)
          expect(yield* relay.recover("run-stale")).toBe(true)
          expect(existsSync(lock)).toBe(false)
          const note = JSON.parse(lines(path.join(arm, "ledger.jsonl"))[0]!)
          expect(Object.keys(note)).toEqual(["ts", "arm", "wp", "event", "gen", "prev", "seq", "mac", "h"])
          expect(note).toMatchObject({ arm: "run-stale", wp: "build", event: "gate-recovered", gen: 2, seq: 0 })
          const key = Redacted.make(readFileSync(relay.paths.key, "utf8"))
          expect((yield* LedgerVerify.verify(path.join(arm, "ledger.jsonl"), key)).exit).toBe(0)
          expect(yield* relay.recover("run-stale")).toBe(false)
        }),
      )
    }),
  )
})

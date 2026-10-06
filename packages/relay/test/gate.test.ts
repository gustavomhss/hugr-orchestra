import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Option } from "effect"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import { GateCheck } from "../src/gate/check"
import { GateControl } from "../src/gate/control"
import { GateDiff } from "../src/gate/diff"
import { GateShell } from "../src/gate/shell"
import type { JudgeBallot } from "../src/judge/ballot"
import { JudgeConfig } from "../src/judge/config"
import { JudgeStub } from "../src/judge/stub"
import { RelayJson } from "../src/json"

// WP3: the gate core against a real bash and git, bound the way core binds the ports (WP10): GateShell.argv with a
// scrubbed environment, and git without optional locks or fsmonitor. Expected digests were computed with
// `printf … | shasum -a 256`, never by the code under test. Linux-only like every check test (R11).
const root = path.join(import.meta.dir, "..")
const PATH = process.env.PATH ?? "/usr/bin:/bin"
// The generator's pinned identity (test/golden/check/GENERATOR.json), so fixture commits have the oracle's SHAs.
const PINNED = Object.fromEntries(
  ["AUTHOR", "COMMITTER"].flatMap((role) => [
    [`GIT_${role}_NAME`, "Relay Golden"],
    [`GIT_${role}_EMAIL`, "golden@relay.invalid"],
    [`GIT_${role}_DATE`, "1700000000 +0000"],
  ]),
)
const SHA = {
  artifact: "76049f7c660db89b54e6e743a35e75ea43784f6edbaeef05bec32d992603a5ba", // "a.txt:<sha>\nmissing.txt:absent\n"
  reversed: "c6516fe57dbd0f73ddab3d900f39cc2f830c61c964782b27c761162a24afa76d", // the same two lines swapped
  empty: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  scoped: "566e179aeb8775851cc3b5bbb9ad0583e02a273066752b290aa87ac02d0c6474", // "Inspect :: a.txt missing.txt"
  inspect: "e0723a86a5b9408aee9113031785d3d15d9702892f31a46e5fe927c0c8552675", // "Inspect"
  octal: "9c46ead7efbae803d09497a7215e58c2aa46d960be62f9603b7bde7170840b54", // "x\101:absent\n" through %b
  directory: "197960e79fdb4ac8db892f1c428f9cfb4b3a489835d07fd69421527e0cf660a5", // "sub:absent\n"
  emptyFile: "113e28c6015af49cc6abf591e4c0cb22072083dd07e51f099e59e9167a408f80", // "sub/b.txt:<sha of empty>\n"
  glob: "bb825a31103d93cb31e446602d7ad0b2d9e193e69c313a7c3086d980a2f40729", // "*.md:absent\n"
  surrogate: "1feca42b606b81c4e11f13652df81c1af8432af0f865b9ed776aa623e94d76b6", // ed a0 80 ":absent\n"
}

type Files = Record<string, string | Uint8Array | null>
interface Env {
  readonly dir: string
  readonly work: string
  readonly home: string
}

const made: string[] = []
afterAll(() => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true }))))

async function scratch(files: Files = {}): Promise<Env> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-wp3-"))
  made.push(dir)
  await Promise.all([mkdir(path.join(dir, "work")), mkdir(path.join(dir, "home"))])
  await write(path.join(dir, "work"), files)
  return { dir, work: path.join(dir, "work"), home: path.join(dir, "home") }
}

// null deletes; a name ending in "/" is a directory.
async function write(dir: string, files: Files) {
  await Promise.all(
    Object.entries(files).map(async ([name, value]) => {
      const file = path.join(dir, name)
      if (value === null) return rm(file, { recursive: true, force: true })
      await mkdir(path.dirname(file), { recursive: true })
      if (name.endsWith("/")) return mkdir(file, { recursive: true })
      await Bun.write(file, value)
    }),
  )
}

async function git(cwd: string, home: string, ...args: string[]) {
  const proc = Bun.spawn(["git", "-c", "core.fsmonitor=false", ...args], {
    cwd,
    env: { PATH, HOME: home, GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", ...PINNED },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  })
  const [stdout, exitCode] = await Promise.all([proc.stdout.bytes(), proc.exited])
  return { exitCode, stdout }
}

const gitText = async (env: Env, ...args: string[]) =>
  new TextDecoder().decode((await git(env.work, env.home, ...args)).stdout)

// Commits like the generator; the message is part of the SHA a golden records.
async function repo(env: Env, commits: ReadonlyArray<Files>, messages: ReadonlyArray<string> = []) {
  await git(env.work, env.home, "-c", "init.defaultBranch=main", "init", "-q")
  const shas: string[] = []
  for (const [k, files] of commits.entries()) {
    await write(env.work, files)
    await git(env.work, env.home, "add", "-A")
    await git(env.work, env.home, "commit", "-q", "--allow-empty", "-m", messages[k] ?? "fixture")
    shas.push((await gitText(env, "rev-parse", "HEAD")).trim())
  }
  return shas
}

// The stub backend as Orchestra config selects it (WP4's JudgeConfig.layer); RELAY_JUDGE_STUB only forces pass or fail.
const stub = (forced?: string) =>
  JudgeConfig.layer({ ...JudgeConfig.defaults, stub: forced === "pass" || forced === "fail" ? forced : undefined })

function ports(home: string, judge: Layer.Layer<JudgeConfig.Service> = stub()) {
  const shell = GateShell.Service.of({
    run: (input) =>
      Effect.tryPromise({
        try: () =>
          Bun.spawn([...GateShell.argv(input.program)], {
            cwd: input.cwd,
            env: { PATH, HOME: home, ...input.env },
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }).exited,
        catch: () => new GateShell.Unavailable({ reason: "spawn" }),
      }).pipe(Effect.map((exitCode) => ({ exitCode }))),
  })
  const sandboxed = GateShell.Git.of({ run: (cwd, args) => Effect.promise(() => git(cwd, home, ...args)) })
  return Layer.mergeAll(Layer.succeed(GateShell.Service, shell), Layer.succeed(GateShell.Git, sandboxed), judge)
}

// A judge whose response the gate must validate: any field may be out of contract.
function fakeJudge(response: Record<string, unknown>, seen: JudgeConfig.Input[] = []) {
  const answer = { verdict: "pass", reason: "fake", backend: "api", available: true, ...response }
  const judge = (input: JudgeConfig.Input) =>
    Effect.sync(() => (seen.push(input), answer as unknown as JudgeBallot.Response))
  return Layer.succeed(JudgeConfig.Service, JudgeConfig.Service.of({ judge }))
}

// Sprints are passed undecoded on purpose: the gate itself names every malformed control.
const plan = (wps: ReadonlyArray<Record<string, unknown>>) => ({ work_packages: wps }) as unknown as RelaySprint.Sprint

interface Options {
  readonly params?: Record<string, string>
  readonly baseRef?: string
  readonly judge?: Layer.Layer<JudgeConfig.Service>
  readonly hostCheck?: "skip" | "fail"
}

function checklist(env: Env, controls: unknown, options: Options = {}) {
  const recorded: GateControl.Verdict[] = []
  const input = { sprint: plan([{ id: "wp1", checklist: controls }]), index: 0, workdir: env.work }
  const effect = GateControl.run(
    { ...input, baseRef: options.baseRef, params: options.params ?? {}, hostCheck: options.hostCheck },
    (verdict) => Effect.sync(() => void recorded.push(verdict)),
  ).pipe(Effect.provide(ports(env.home, options.judge)))
  return { effect, recorded }
}

async function graded(env: Env, controls: unknown, options: Options = {}) {
  const run = checklist(env, controls, options)
  const result = await Effect.runPromise(run.effect)
  expect(result.verdicts).toEqual(run.recorded)
  return result
}

const verdictOf = async (env: Env, control: Record<string, unknown>, options?: Options) =>
  (await graded(env, [{ id: "C", ...control }], options)).verdicts[0]!

const brief = (verdict: GateControl.Verdict) => [verdict.verdict, verdict.graded_by]

// Every golden the TS engine departs from on purpose, with the PARITY-EXCEPTIONS row that declares it.
const DEPARTURES: Record<string, string> = {
  "check/check-hook-variables-visible": "WP3-1",
  "arm/parity-hook-variables-visible": "WP3-1",
  "arm/parity-judge-paths-glob-from-cwd": "WP3-2",
  "arm/e4-judge-responses": "WP3-4",
  "arm/e5-host-check": "WP3-8",
}

test("every golden departure names its PARITY-EXCEPTIONS row", async () => {
  const rows = (await Bun.file(path.join(root, "test/golden/PARITY-EXCEPTIONS.md")).text()).split("\n")
  Object.entries(DEPARTURES).forEach(([golden, row]) =>
    expect(rows.find((line) => line.startsWith(`| ${row} |`))).toContain(`\`${golden}\``),
  )
})
const cmd = (id: string, program: string) => ({ id, cmd: program })

describe("check goldens", () => {
  const dir = path.join(root, "test/golden/check")
  const names = existsSync(dir)
    ? readdirSync(dir).filter((name) => existsSync(path.join(dir, name, "scenario.json")))
    : []

  // G2 covers K1–K8 with at least one scenario each; without the goldens this fails rather than passing empty.
  test("the check goldens are present", () => expect(names.length).toBeGreaterThanOrEqual(8))

  // The TS result per fire of a check golden it departs from on purpose (see DEPARTURES).
  const hidden = { outcome: "check", i: 0, wp: "alpha", failing: ["SEES-WP-ID", "SEES-SPRINT", "SEES-MODE"] }
  const declared: Record<string, ReadonlyArray<unknown>> = {
    "check-hook-variables-visible": [{ exit: 1, stdout: hidden }],
  }

  names.sort().forEach((name) =>
    test(name, async () => {
      const scenario: Scenario = await Bun.file(path.join(dir, name, "scenario.json")).json()
      expect(scenario.env?.RELAY_JUDGE_BACKEND ?? "stub").toBe("stub")
      const { env, shas } = await setup(scenario)
      const state = path.join(env.dir, "arm")
      await write(state, bytes(scenario.prestate ?? {}, shas))
      const judge = stub(scenario.env?.RELAY_JUDGE_STUB)
      for (const [n, fire] of scenario.fires.entries()) {
        const check = fire.check ?? {}
        await write(env.work, bytes(fire.tree ?? {}, shas))
        // Like the generator: a counter goes through the state file, a number as `<N>\n`, a string as its bytes.
        const counter = check.counter
        if (counter !== undefined)
          await write(state, { counter: typeof counter === "number" ? `${counter}\n` : counter })
        const baseRef = check.baseRef === undefined ? undefined : String(value(check.baseRef, shas))
        const input = { sprint: scenario.sprint, workdir: env.work, params: scenario.env ?? {}, stateDir: state }
        // The CLI's exit codes: 0 pass or complete, 1 failing or a plan error, 2 unknown position, 3 busy.
        const actual = await Effect.runPromise(
          GateCheck.check({ ...input, position: check.position, baseRef }).pipe(
            Effect.map((outcome) => ({
              exit: outcome.outcome === "error" ? 2 : outcome.outcome === "check" && outcome.failing.length ? 1 : 0,
              stdout: outcome as unknown,
            })),
            Effect.catchTags({
              "GateCheck.Busy": () => Effect.succeed({ exit: 3, stdout: null }),
              "GateControl.PlanError": () => Effect.succeed({ exit: 1, stdout: null }),
            }),
            Effect.provide(ports(env.home, judge)),
          ),
        )
        const expected = path.join(dir, name, "expected", String(n))
        const outcome = await Bun.file(path.join(expected, "outcome.json")).json()
        const oracle = JSON.stringify({ exit: outcome.exit, stdout: outcome.stdout })
        if (declared[name]) expect(JSON.stringify(declared[name][n])).not.toBe(oracle)
        expect(JSON.stringify(actual)).toBe(declared[name] ? JSON.stringify(declared[name][n]) : oracle)
        expect(existsSync(path.join(state, ".run.lock"))).toBe(
          Object.hasOwn(scenario.prestate ?? {}, ".run.lock/owner"),
        )
        expect(await armFiles(state)).toEqual(await armFiles(path.join(expected, "arm")))
      }
    }),
  )
})

async function setup(scenario: Scenario) {
  const env = await scratch()
  const commits = (scenario.commits ?? []).map((commit) => bytes(commit.files, []))
  const messages = (scenario.commits ?? []).map((commit) => commit.message)
  const shas = commits.length ? await repo(env, commits, messages) : []
  await write(env.work, bytes(scenario.tree ?? {}, shas))
  return { env, shas }
}

const read = (file: string) =>
  Bun.file(file)
    .text()
    .catch(() => "")
const compact = (value: unknown) => Effect.runPromise(RelayJson.compact(value))

interface Scenario {
  readonly sprint: RelaySprint.Sprint
  readonly meta?: { readonly base_ref?: unknown }
  readonly env?: Record<string, string>
  readonly prestate?: Record<string, unknown>
  readonly commits?: ReadonlyArray<{ readonly message: string; readonly files: Record<string, unknown> }>
  readonly tree?: Record<string, unknown>
  readonly fires: ReadonlyArray<{
    readonly tree?: Record<string, unknown>
    readonly check?: { readonly position?: string; readonly counter?: number | string; readonly baseRef?: unknown }
  }>
}

// A golden byte value: a string, `{"base64"}`, `{"commit": N}` or null.
function value(input: unknown, shas: ReadonlyArray<string>): string | Uint8Array | null {
  if (input === null || typeof input === "string") return input
  const object = input as { base64?: string; commit?: number }
  if (object.base64 !== undefined) return Buffer.from(object.base64, "base64")
  return shas[object.commit!]!
}

function bytes(files: Record<string, unknown>, shas: ReadonlyArray<string>): Files {
  return Object.fromEntries(Object.entries(files).map(([name, input]) => [name, value(input, shas)]))
}

// Every state file a check could touch; inputs, diagnostics and locks are not compared.
async function armFiles(dir: string) {
  if (!existsSync(dir)) return {}
  const names = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .filter((name) => !["relay.log", "ledger.jsonl", "sprint.json", "meta.json"].includes(name))
    .filter((name) => !name.startsWith(".run.lock") && !name.startsWith(".chain.lock"))
  const read = (name: string) => Bun.file(path.join(dir, name)).text()
  return Object.fromEntries(await Promise.all(names.sort().map(async (name) => [name, await read(name)])))
}

describe("checklist-item bodies", () => {
  // Each arm golden fire that records a round is regraded with the oracle's tree, base ref, params and judge, and its
  // checklist-item lines are rebuilt from the TS verdicts plus the golden's ts and chain suffix.
  const dir = path.join(root, "test/golden/arm")
  const names = existsSync(dir)
    ? readdirSync(dir).filter((name) => existsSync(path.join(dir, name, "scenario.json")))
    : []
  const exitSeven = { verdict: "pass", graded_by: "judge:stub(non-independent)" }
  // Per departing item: the TS fields, or null when TS records no item.
  const departing: Record<string, Record<string, Record<string, unknown> | null>> = {
    "parity-hook-variables-visible": {
      "sees-token": { verdict: "fail" },
      "sees-arm-dir": { verdict: "fail" },
      "sees-index": { verdict: "fail" },
    },
    "parity-judge-paths-glob-from-cwd": { GLOB: { artifact: SHA.glob } },
    "e4-judge-responses": { "EXIT-BLOCKING": exitSeven, "EXIT-ADVISORY": exitSeven },
    "e5-host-check": { permissions: null },
  }
  test("the arm goldens record checklist rounds", async () => {
    const ledgers = [...new Bun.Glob("*/expected/*/ledger.jsonl").scanSync(dir)]
    const text = (await Promise.all(ledgers.map((file) => Bun.file(path.join(dir, file)).text()))).join("")
    expect(text.split(`"event":"checklist-item"`).length).toBeGreaterThan(100)
  })

  names.sort().forEach((name) =>
    test(`arm/${name}`, async () => {
      const scenario: Scenario = await Bun.file(path.join(dir, name, "scenario.json")).json()
      const { env, shas } = await setup(scenario)
      const params = scenario.env ?? {}
      const judge = params.RELAY_JUDGE ? scripted : stub(params.RELAY_JUDGE_STUB)
      const prestate = bytes(scenario.prestate ?? {}, shas)
      const meta = value(scenario.meta?.base_ref ?? "", shas)
      for (const [n, fire] of scenario.fires.entries()) {
        await write(env.work, bytes(fire.tree ?? {}, shas))
        const expected = (k: number) => path.join(dir, name, "expected", String(k))
        const before = n
          ? await read(path.join(expected(n - 1), "ledger.jsonl"))
          : String(prestate["ledger.jsonl"] ?? "")
        const lines = (await read(path.join(expected(n), "ledger.jsonl")))
          .slice(before.length)
          .split("\n")
          .filter((line) => line.includes(`"event":"checklist-item"`))
        if (lines.length === 0) continue
        const entries = lines.map((line) => JSON.parse(line))
        const index = entries[0].i
        const state: Record<string, unknown> = n ? await armFiles(expected(n - 1)) : prestate
        const base = state[`base_${safe(scenario.sprint.work_packages[index]!.id)}`] ?? meta
        const baseRef = String(base).replace(/\n+$/, "")
        const input = { sprint: scenario.sprint, index, workdir: env.work, baseRef, params }
        const result = await Effect.runPromise(
          GateControl.run(input, () => Effect.void).pipe(Effect.provide(ports(env.home, judge))),
        )
        const kept = entries.flatMap((entry, k) => {
          const departure = departing[name]?.[entry.item]
          if (departure === null) return []
          return [{ entry: { ...entry, ...departure }, line: departure ? undefined : lines[k] }]
        })
        const want = await Promise.all(kept.map((item) => item.line ?? compact(item.entry)))
        const got = await Promise.all(
          result.verdicts.map((verdict, k) => {
            const entry = kept[k]?.entry ?? entries[0]
            const envelope = { arm: entry.arm, wp: entry.wp, i: entry.i, macro: entry.macro, kind: entry.kind }
            const chain = { gen: entry.gen, prev: entry.prev, seq: entry.seq, mac: entry.mac, h: entry.h }
            return compact({ ts: entry.ts, ...GateControl.body(envelope, verdict), ...chain })
          }),
        )
        expect(got).toEqual(want)
      }
    }),
  )
})

// e4-judge-responses runs a judge program from its tree; the TS judge is a service, so its replies are scripted here.
// Malformed stdout ("{broken", two objects) has no service equivalent and becomes a reply without a verdict.
const scripted = Layer.succeed(
  JudgeConfig.Service,
  JudgeConfig.Service.of({
    judge: (input) =>
      Effect.succeed(
        ({
          "exit-7": { verdict: "pass", backend: "stub" },
          "advisory-verdict": { verdict: "advisory", backend: "stub" },
          "numeric-backend": { verdict: "pass", backend: 17 },
          "api-pass": { verdict: "pass", reason: "ok", backend: "api" },
          "api-fail": { verdict: "fail", reason: "no", backend: "api" },
          "empty-backend": { verdict: "pass", backend: "" },
        }[input.criterion] ?? {}) as unknown as JudgeBallot.Response,
      ),
  }),
)

// The arm's per-WP file suffix: every UTF-8 byte outside [A-Za-z0-9._-] becomes "_".
const safe = (id: string) =>
  Array.from(new TextEncoder().encode(id), (byte) => String.fromCharCode(byte).replace(/[^A-Za-z0-9._-]/, "_")).join("")

describe("command transport", () => {
  test.each([
    ["\ttest -f alpha.txt\n\n", "pass"],
    ["test -f beta.txt\ntest -f alpha.txt", "pass"],
    ["test -f alpha.txt\n\ttest -f beta.txt\n\n", "fail"],
    ["false; true", "pass"],
    ["true; false", "fail"],
    ["if test -f alpha.txt; then\n\ttest -f beta.txt\nelse\n\tfalse\nfi\n\n", "fail"],
    ["verify_both() {\n\ttest -f alpha.txt\n}\nverify_both\n\n", "pass"],
    ["cat >/dev/null", "pass"],
  ])("%j runs as one program and grades on its final status", async (cmd, expected) => {
    const env = await scratch({ "alpha.txt": "" })
    expect(brief(await verdictOf(env, { cmd }))).toEqual([expected, "deterministic"])
  })

  test("controls run in declared order without short-circuiting", async () => {
    const env = await scratch()
    const result = await graded(env, [
      { id: "FIRST", cmd: "printf first > order.txt\nfalse\n\n" },
      { id: "LATER", cmd: "test -s order.txt && printf later >> order.txt" },
    ])
    expect(result.failing).toEqual(["FIRST"])
    expect(await Bun.file(path.join(env.work, "order.txt")).text()).toBe("firstlater")
  })
})

describe("nounset and pipefail (R2)", () => {
  test.each([
    [': "$RELAY_WP3_UNSET"', {}, "fail"],
    [': "$RELAY_WP3_EMPTY"', { RELAY_WP3_EMPTY: "" }, "pass"],
    ["false | true", {}, "fail"],
    ["true | true", {}, "pass"],
    ["false; true", {}, "pass"],
    ['test "$wp_dir" = /x', { wp_dir: "/x" }, "pass"],
  ])("%j with %j", async (cmd, params, expected) => {
    const env = await scratch()
    expect((await verdictOf(env, { cmd }, { params })).verdict).toBe(expected as "pass" | "fail")
  })

  test("argv is the hook's eval semantics: nounset and pipefail on, errexit off, no startup files", () => {
    expect(GateShell.argv("x")).toEqual(["bash", "--noprofile", "--norc", "-o", "nounset", "-o", "pipefail", "-c", "x"])
  })
})

describe("untracked files in the diff", () => {
  test("tracked, committed and untracked changes reach the diff without touching the index", async () => {
    const env = await scratch()
    const [base] = await repo(env, [{ "seed.txt": "seed\n", ".gitignore": "ignored.txt\n" }, { "done.txt": "done\n" }])
    await write(env.work, { "seed.txt": "changed\n", "new.txt": "brand new\n", "ignored.txt": "secret\n" })
    const before = await gitText(env, "status", "--porcelain")
    const compute = (baseRef: string | undefined, pathspec = "") =>
      Effect.runPromise(
        GateDiff.compute({ workdir: env.work, baseRef, pathspec }).pipe(Effect.provide(ports(env.home))),
      )
    const all = Option.getOrThrow(await compute(base))
    for (const part of ["diff --git a/done.txt b/done.txt", "+changed", "diff --git a/new.txt b/new.txt", "+brand new"])
      expect(all).toContain(part)
    expect(all).not.toContain("secret")
    expect(Option.getOrThrow(await compute(base, " new.txt\n"))).not.toContain("seed.txt")
    for (const ref of [undefined, "", "0000000000000000000000000000000000000000"])
      expect(await compute(ref)).toEqual(Option.none())
    expect(await gitText(env, "status", "--porcelain")).toBe(before)
    const [head] = await repo(env, [{}])
    expect(await compute(head)).toEqual(Option.some(""))
  })

  test("a judge sees a brand-new file only through the computed diff, and a non-repository fails closed", async () => {
    const env = await scratch()
    const [base] = await repo(env, [{ "seed.txt": "seed\n" }])
    await write(env.work, { "impl.py": "# RELAY_JUDGE_OK\n" })
    const control = { judge: "Does the diff match?", diff: true, blocking: true }
    expect((await verdictOf(env, control, { baseRef: base })).verdict).toBe("pass")
    const plain = await scratch({ "impl.py": "# RELAY_JUDGE_OK\n" })
    const result = await graded(plain, [{ id: "J", ...control }], { baseRef: base })
    const oracle = GateControl.oracleSha("Does the diff match?")
    expect(result.verdicts).toEqual([
      { item: "J", assert: "J", verdict: "fail", graded_by: "judge:unavailable(no-diff)", oracle, origin: "sprint" },
    ])
    expect(result.failing).toEqual(["J"])
    const advisory = await graded(plain, [{ id: "J", ...control, blocking: false }], { baseRef: base })
    expect([advisory.verdicts[0]!.verdict, advisory.failing]).toEqual(["fail", []])
  })
})

describe("${name} expansion", () => {
  test.each([
    ["${a}/x", { a: "dir" }, "dir/x"],
    ["${unset}/x", {}, "${unset}/x"],
    ["${a}${b}", { a: "1", b: "" }, "1"],
    ["${a}", { a: "${b}", b: "no" }, "${b}"],
    ["${${a}}", { a: "x" }, "${x}"],
    ["${1a} ${a-b} $a {a}", { a: "x" }, "${1a} ${a-b} $a {a}"],
    ["a\n${a}\tb", { a: "é" }, "a\né\tb"],
  ])("%j", (text, params, expected) => expect(GateControl.expandParams(text, params)).toBe(expected))
})

describe("artifact sha", () => {
  test("digests names and bytes in declared order, absent files included", async () => {
    const env = await scratch({ "a.txt": "RELAY_JUDGE_OK\n", "sub/b.txt": "" })
    const sha = async (paths: string) =>
      Option.getOrUndefined(await Effect.runPromise(GateControl.artifactSha(paths, env.work)))
    expect(await sha("a.txt missing.txt")).toBe(SHA.artifact)
    expect(await sha("  a.txt\tmissing.txt\n")).toBe(SHA.artifact)
    expect(await sha("missing.txt a.txt")).toBe(SHA.reversed)
    expect(await sha("")).toBeUndefined()
    expect(await sha(" ")).toBe(SHA.empty)
    expect(await sha("x\\101")).toBe(SHA.octal)
    expect(await sha("sub")).toBe(SHA.directory)
    expect(await sha("sub/b.txt")).toBe(SHA.emptyFile)
  })
})

describe("named failures and judge rules", () => {
  test.each([
    [{ cmd: "true\u0000" }, "unavailable(invalid-command)"],
    [{ cmd: 7 }, "unavailable(invalid-command)"],
    [{ cmd: ["true"] }, "unavailable(invalid-command)"],
    [{}, "judge:unavailable(invalid-criterion)"],
    [{ judge: "" }, "judge:unavailable(invalid-criterion)"],
    [{ judge: true }, "judge:unavailable(invalid-criterion)"],
    [{ judge: "Inspect\u0000" }, "judge:unavailable(invalid-criterion)"],
    [{ judge: "Inspect", paths: ["bad\u0000path"] }, "judge:unavailable(invalid-scope)"],
    [{ judge: "Inspect", paths: [7] }, "judge:unavailable(invalid-scope)"],
    [{ judge: "Inspect", paths: "a.txt" }, "judge:unavailable(invalid-scope)"],
  ])("%j is a named failure that blocks even when advisory", async (control, gradedBy) => {
    const env = await scratch()
    const result = await graded(env, [{ id: "BAD", ...control }], { judge: stub("pass") })
    expect(result.failing).toEqual(["BAD"])
    expect(result.verdicts).toEqual([
      { item: "BAD", assert: "BAD", verdict: "fail", graded_by: gradedBy, oracle: "", origin: "sprint" },
    ])
  })

  test("a nonempty command wins over any judge; an empty one falls back to it", async () => {
    const env = await scratch()
    expect(brief(await verdictOf(env, { cmd: "false; true", judge: { x: 1 } }))).toEqual(["pass", "deterministic"])
    const judged = await verdictOf(env, { cmd: "", judge: "Inspect" }, { judge: stub("pass") })
    expect([...brief(judged), judged.oracle]).toEqual(["pass", "judge:stub(non-independent)", SHA.inspect])
  })

  test("a judge verdict blocks only when the control is blocking", async () => {
    const env = await scratch({ "e.txt": "unsupported\n", "ok.txt": "RELAY_JUDGE_OK\n" })
    const result = await graded(env, [
      { id: "ADVISE", judge: "Inspect", context: "e.txt" },
      { id: "BLOCK", judge: "Inspect", context: "e.txt", blocking: true },
      { id: "PASS", judge: "Inspect", context: "ok.txt", blocking: true },
    ])
    expect(result.failing).toEqual(["BLOCK"])
    expect(result.verdicts.map((verdict) => verdict.verdict)).toEqual(["fail", "fail", "pass"])
  })

  test.each([
    [{ verdict: "advisory" }, "fail", "judge:unavailable(invalid-response)(non-independent)"],
    [{ verdict: true }, "fail", "judge:unavailable(invalid-response)(non-independent)"],
    [{ backend: 7 }, "fail", "judge:unavailable(invalid-response)(non-independent)"],
    [{ backend: "llm\u0000" }, "fail", "judge:unavailable(invalid-response)(non-independent)"],
    [{ backend: "" }, "pass", "judge:judge(non-independent)"],
    [{ backend: null }, "pass", "judge:judge(non-independent)"],
    [{ backend: "llm:m(votes:2/3)" }, "pass", "judge:llm:m(votes:2/3)(non-independent)"],
    [{ verdict: "fail", available: false, backend: "api-error:m" }, "fail", "judge:api-error:m(non-independent)"],
  ])("judge response %j", async (response, verdict, gradedBy) => {
    const env = await scratch()
    const result = await graded(env, [{ id: "J", judge: "Inspect", blocking: true }], { judge: fakeJudge(response) })
    expect(brief(result.verdicts[0]!)).toEqual([verdict, gradedBy])
    expect(result.failing).toEqual(verdict === "fail" ? ["J"] : [])
  })

  test("the judge gets the criterion verbatim, context files by basename in order, then the diff", async () => {
    const env = await scratch()
    const [base] = await repo(env, [{ "seed.txt": "seed\n" }])
    await write(env.work, { "ctx/one.md": "a\r\nb\rc", "two.md": "two" })
    const seen: JudgeConfig.Input[] = []
    const criterion = "Read café\tcarefully.\n\n"
    const control = { judge: criterion, context: ["ctx/one.md", "missing.md\ntwo.md", null], diff: true }
    await verdictOf(env, control, { judge: fakeJudge({}, seen), baseRef: base })
    expect(seen[0]!.criterion).toBe(criterion)
    expect(seen[0]!.files.map((file) => [file.name, file.text])).toEqual([
      ["one.md", "a\nb\nc"],
      ["missing.md", undefined],
      ["two.md", "two"],
      ["null", undefined],
      [GateDiff.NAME, expect.stringContaining("+two")],
    ])
  })

  test("ids and assertions are whole strings; origin is explicit, then policy, then sprint", async () => {
    const env = await scratch()
    const id = "\tkept\ncafé-id\t\n\n"
    const result = await graded(env, [
      { id, cmd: "true", assert: "Evidence\tcafé\n\n" },
      { id: "N", cmd: "true", assert: null, origin: "", policy: "pol\n" },
      { id: "F", cmd: "true", assert: false, origin: "injected:x\n\n" },
      { id: "S", cmd: "true", origin: null, policy: null },
    ])
    expect(result.verdicts.map((verdict) => [verdict.item, verdict.assert, verdict.origin])).toEqual([
      [id, "Evidence\tcafé\n\n", "sprint"],
      ["N", "N", "policy:pol"],
      ["F", "F", "injected:x"],
      ["S", "S", "sprint"],
    ])
  })
})

describe("judge stub", () => {
  const marked = { name: "a", text: "x RELAY_JUDGE_OK" }
  test.each([
    [[], undefined, "fail", "stub: no context to inspect"],
    [[marked, { name: "b", text: "x" }], undefined, "fail", "stub: RELAY_JUDGE_OK marker absent in b"],
    [[{ name: "a" }], undefined, "fail", "stub: RELAY_JUDGE_OK marker absent in a"],
    [[marked], undefined, "pass", "stub: marker present in all context files"],
    [[], "pass", "pass", "stub forced pass"],
    [[marked], "fail", "fail", "stub forced fail"],
  ] as const)("%j forced %s", async (files, forced, verdict, reason) => {
    const response = await Effect.runPromise(JudgeStub.judge({ criterion: "never read", files }, forced))
    expect(response).toEqual({ verdict, reason, backend: "stub", available: true })
  })

  // G1's stub goldens, through the stub backend as JudgeConfig.layer binds it.
  const dir = path.join(root, "test/golden/judge")
  const names = existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith("stub-")) : []
  test("the G1 stub goldens are present", () => expect(names.length).toBe(7))
  names.sort().forEach((name) =>
    test(`judge/${name}`, async () => {
      const golden: {
        criterion: string
        files: Array<{ name: string; text: string | null }>
        env: Record<string, string>
      } = await Bun.file(path.join(dir, name, "case.json")).json()
      const files = golden.files.map((file) =>
        file.text === null ? { name: file.name } : { name: file.name, text: file.text },
      )
      const response = await Effect.runPromise(
        Effect.gen(function* () {
          const judge = yield* JudgeConfig.Service
          return yield* judge.judge({ criterion: golden.criterion, files })
        }).pipe(Effect.provide(stub(golden.env.RELAY_JUDGE_STUB))),
      )
      const expected = JSON.parse(await Bun.file(path.join(dir, name, "response.jsonl")).text())
      expect(JSON.stringify(response)).toBe(JSON.stringify(expected))
    }),
  )
})

describe("plan errors", () => {
  const fails = (env: Env, controls: unknown) => Effect.runPromise(Effect.flip(checklist(env, controls).effect))

  test.each([7, {}, "", true, 0.5])("checklist %j stops before any control", async (value) => {
    const error = await fails(await scratch(), value)
    expect(error.message).toBe("relay: work_packages[0].checklist must be an array or null")
  })

  test.each([{}, { id: null }, { id: "" }, { id: 0 }, { id: [] }, { id: "bad\u0000id" }])(
    "control %j stops at its id; earlier verdicts stay recorded",
    async (fields) => {
      const env = await scratch()
      const run = checklist(env, [cmd("A", "true"), { ...fields, cmd: "touch ran" }, cmd("L", "touch l")])
      const error = await Effect.runPromise(Effect.flip(run.effect))
      expect(error.message).toBe(
        "relay: work_packages[0].checklist[1] has invalid id (expected a nonempty NUL-free string)",
      )
      expect(run.recorded.map((verdict) => verdict.item)).toEqual(["A"])
      expect(["ran", "l"].map((file) => existsSync(path.join(env.work, file)))).toEqual([false, false])
    },
  )

  // Rows are wrapped: a bare [] row would be spread into no arguments.
  test.each([[true], [17], [[]], [{}], ["report\u0000text"]])(
    "assertion %j stops before the command runs",
    async (assert) => {
      const env = await scratch()
      const error = await fails(env, [{ id: "D", assert, cmd: "touch ran" }])
      expect(error.message).toBe("relay: checklist D has invalid assertion (expected a NUL-free string)")
      expect(existsSync(path.join(env.work, "ran"))).toBe(false)
    },
  )

  test("a failed record stops the checklist before the next control", async () => {
    const env = await scratch()
    const controls = [cmd("A", "true"), cmd("B", "touch ran")]
    const input = { sprint: plan([{ id: "wp1", checklist: controls }]), index: 0, workdir: env.work, params: {} }
    const effect = GateControl.run(input, () => Effect.fail("record-failed" as const))
    expect(await Effect.runPromise(Effect.flip(effect).pipe(Effect.provide(ports(env.home))))).toBe("record-failed")
    expect(existsSync(path.join(env.work, "ran"))).toBe(false)
  })

  test("host_check controls are left to the arm, or failed unrecorded by a dry check", async () => {
    const env = await scratch()
    const controls = [{ ...cmd("H", "touch ran"), host_check: "permissions" }, cmd("D", "false")]
    expect(await graded(env, controls)).toEqual({ failing: ["D"], verdicts: [expect.objectContaining({ item: "D" })] })
    expect((await graded(env, controls, { hostCheck: "fail" })).failing).toEqual(["H", "D"])
    expect(existsSync(path.join(env.work, "ran"))).toBe(false)
  })
})

// Positions, counters, the lock, base refs and plan errors are pinned by the K1–K8 goldens above; these are the rest.
describe("check", () => {
  const check = (env: Env, sprint: RelaySprint.Sprint) =>
    GateCheck.check({ sprint, workdir: env.work, params: {}, counter: 0 }).pipe(Effect.provide(ports(env.home)))
  const checked = (wp: string, failing: string[]) => ({ outcome: "check" as const, i: 0, wp, failing })

  test("only the selected WP's identity matters, and failing IDs travel as the CLI's '; '-joined string", async () => {
    const env = await scratch()
    const joined = plan([{ id: "current", checklist: [cmd("a; b", "false"), cmd("tail\n", "false")] }, { id: 7 }])
    expect(await Effect.runPromise(check(env, joined))).toEqual(checked("current", ["a", "b", "tail"]))
  })

  test("a dry check fails host checks closed and needs an existing workdir", async () => {
    const env = await scratch()
    const host = plan([{ id: "h", checklist: [{ id: "H", host_check: "permissions" }, cmd("D", "true")] }])
    expect(await Effect.runPromise(check(env, host))).toEqual(checked("h", ["H"]))
    const absent = path.join(env.dir, "absent")
    const missing = await Effect.runPromise(Effect.flip(check({ ...env, work: absent }, host)))
    expect(missing.message).toBe(`relay-gate: workdir not found: ${absent}`)
  })
})

describe("parity exceptions", () => {
  test("WP3-1: a check sees PATH, HOME and params, never the hook's variables", async () => {
    const env = await scratch()
    const hook = ["RUN_DIR", "SPRINT", "LEDGER", "i", "wp_id"]
    expect(
      (
        await graded(
          env,
          hook.map((name) => ({ id: name, cmd: `: "$${name}"` })),
        )
      ).failing,
    ).toEqual(hook)
    expect((await verdictOf(env, { cmd: 'test "$0" = bash && test -n "$HOME"' })).verdict).toBe("pass")
    expect(GateControl.expandParams("${HOME}/x", {})).toBe("${HOME}/x")
  })

  test("WP3-2: scope words are split, never globbed", async () => {
    const env = await scratch({ "a.md": "RELAY_JUDGE_OK\n" })
    expect(await Effect.runPromise(GateControl.artifactSha("*.md", env.work))).toEqual(Option.some(SHA.glob))
  })

  test("WP3-3: a command the shell port cannot run is unavailable, never deterministic", async () => {
    const env = await scratch()
    const timeout = GateShell.Service.of({ run: () => Effect.fail(new GateShell.Unavailable({ reason: "timeout" })) })
    const input = { sprint: plan([{ id: "wp1", checklist: [{ id: "SLOW", cmd: "sleep 600" }] }]), index: 0 }
    const effect = GateControl.run({ ...input, workdir: env.work, params: {} }, () => Effect.void).pipe(
      Effect.provide(Layer.succeed(GateShell.Service, timeout)),
      Effect.provide(ports(env.home)),
    )
    const result = await Effect.runPromise(effect)
    expect([result.failing, brief(result.verdicts[0]!), result.verdicts[0]!.oracle]).toEqual([
      ["SLOW"],
      ["fail", "unavailable(timeout)"],
      GateControl.oracleSha("sleep 600"),
    ])
    const gone = await verdictOf({ ...env, work: path.join(env.dir, "gone") }, { cmd: "true" })
    expect(brief(gone)).toEqual(["fail", "unavailable(spawn)"])
  })

  test("WP3-4: no CLI transport, so a criterion argparse refused reaches the judge", async () => {
    const env = await scratch()
    const verdict = await verdictOf(env, { judge: "-strict", blocking: true }, { judge: stub("pass") })
    expect(brief(verdict)).toEqual(["pass", "judge:stub(non-independent)"])
  })

  test("WP3-5: judge context that is not UTF-8 has no text and fails closed", async () => {
    const binary = Uint8Array.from([0xff, ...new TextEncoder().encode("RELAY_JUDGE_OK")])
    const env = await scratch({ "bin.txt": binary })
    const seen: JudgeConfig.Input[] = []
    await verdictOf(env, { judge: "Inspect", context: "bin.txt" }, { judge: fakeJudge({}, seen) })
    expect(seen[0]!.files).toEqual([{ name: "bin.txt" }])
    expect((await verdictOf(env, { judge: "Inspect", context: "bin.txt" })).verdict).toBe("fail")
    const tracked = await scratch()
    const [base] = await repo(tracked, [{ "seed.txt": "seed\n" }])
    await write(tracked.work, { "bin.txt": binary })
    const diff = await verdictOf(tracked, { judge: "Inspect", diff: true }, { baseRef: base, judge: stub("pass") })
    expect(brief(diff)).toEqual(["fail", "judge:unavailable(no-diff)"])
  })

  test("WP3-6: a negative or malformed counter is a plan error", async () => {
    const env = await scratch()
    const state = path.join(env.dir, "state")
    const sprint = plan([{ id: "only", checklist: [] }])
    const counter = (input: Partial<GateCheck.Input>) =>
      Effect.runPromise(
        Effect.flip(GateCheck.check({ sprint, workdir: env.work, params: {}, ...input })).pipe(
          Effect.provide(ports(env.home)),
        ),
      )
    expect(await counter({ counter: -1 })).toBeInstanceOf(GateControl.PlanError)
    await write(state, { counter: "stale" })
    expect(await counter({ stateDir: state })).toBeInstanceOf(GateControl.PlanError)
    await write(state, { counter: "" })
    expect(await counter({ stateDir: state })).toBeInstanceOf(GateControl.PlanError)
  })

  test("WP3-7: printf %b encodes \\u and \\U as UTF-8, surrogates included", async () => {
    const sha = await Effect.runPromise(GateControl.artifactSha("\\uD800", "/nonexistent-relay-wp3"))
    expect(sha).toEqual(Option.some(SHA.surrogate))
  })
})

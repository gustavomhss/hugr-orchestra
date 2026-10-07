import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, Schema } from "effect"
import { RelayArm } from "@opencode-ai/schema/relay-arm"
import { ArmEvaluate } from "../src/arm/evaluate"
import type { JudgeBallot } from "../src/judge/ballot"
import { JudgeConfig } from "../src/judge/config"
import { LedgerVerify } from "../src/ledger/verify"
import {
  type Entry,
  type Files,
  EPOCH,
  TOKEN,
  armFiles,
  cleanup,
  entries,
  parse,
  read,
  repo,
  run,
  scratch,
  stub,
  write,
} from "./arm-harness"

// WP6: the arm evaluator replays every arm golden fire by fire: the ledger, every arm file and the block reason byte
// for byte, and the outcome the oracle's exit calls for (FORMAT.md, TS column). Goldens the TS arm departs from on
// purpose are checked against their declared TS behaviour instead. Expected digests were computed with
// `printf … | shasum -a 256`, never by the code under test. Linux-only like every arm test (R11).
const root = path.join(import.meta.dir, "..")
const goldens = path.join(root, "test/golden/arm")
const SHA = {
  permissions: "8090f7f7795f1e4be8d1e120e2e36e32b586cb7fc96f0f075aa895cb346de188", // "host_check:permissions"
  glob: "bb825a31103d93cb31e446602d7ad0b2d9e193e69c313a7c3086d980a2f40729", // "*.md:absent\n"
}

afterAll(cleanup)

interface Fire {
  readonly at?: number
  readonly transcript?: ReadonlyArray<unknown>
  readonly agentID?: string
  readonly release?: unknown
  readonly tree?: Record<string, unknown>
}
interface Scenario {
  readonly prestate?: Record<string, unknown>
  readonly commits?: ReadonlyArray<{ readonly message: string; readonly files: Record<string, unknown> }>
  readonly tree?: Record<string, unknown>
  readonly env?: Record<string, string>
  readonly fires: ReadonlyArray<Fire>
}

// A golden byte value: a string, `{"base64"}`, `{"commit": N}` or null.
function value(input: unknown, shas: ReadonlyArray<string>): string | Uint8Array | null {
  if (input === null || typeof input === "string") return input
  const object = input as { base64?: string; commit?: number }
  if (object.base64 !== undefined) return Buffer.from(object.base64, "base64")
  return shas[object.commit!]!
}

const bytes = (files: Record<string, unknown>, shas: ReadonlyArray<string>): Files =>
  Object.fromEntries(Object.entries(files).map(([name, input]) => [name, value(input, shas)]))

const split = (text: unknown) => (typeof text === "string" && text ? text.replace(/^; /, "").split("; ") : [])

// The marker scan is gone (PARITY-EXCEPTIONS WP6-1): where the oracle found the token in the transcript, the caller
// passes it explicitly; where it found none or several, the empty token is refused.
const EXPLICIT: Record<string, string> = { "a2-one-marker-repeated": TOKEN }

// The disposition record each oracle exit leaves, and the TS outcome it means.
const DISPOSITIONS: Record<string, readonly [RelayArm.Outcome, RelayArm.Defect?]> = {
  "sprint-complete": ["complete"],
  "advance-reveal": ["advance"],
  "compaction-hint": ["advance"],
  escalate: ["escalate"],
  "gate-fail": ["gate-fail"],
  "gate-fail-repeat": ["gate-fail"],
  "position-lost": ["defect", "position-lost"],
  "unknown-kind": ["defect", "unknown-kind"],
  "inject-missing": ["defect", "inject-missing"],
}

interface Golden {
  readonly exit: number
  readonly stderr: string
  readonly token: string
  readonly appended: ReadonlyArray<Entry>
  readonly state: string | undefined
  readonly armed: boolean
}

// The TS outcome the oracle's exit, records and state call for.
function expectedOutcome(golden: Golden): readonly [RelayArm.Outcome, RelayArm.Defect?] {
  if (golden.exit === 3) return ["busy"]
  if (golden.exit === 1) return ["defect"]
  if (!Schema.is(RelayArm.Token)(golden.token)) return ["refused"]
  if (!golden.armed) return ["defect", "arm-missing"]
  const last = golden.appended.findLast((entry) => DISPOSITIONS[String(entry.event)])
  const mapped = last && DISPOSITIONS[String(last.event)]!
  if (mapped) return mapped[0] === "gate-fail" && last!.fails === "" ? ["regression-fail"] : mapped
  if (golden.stderr.includes("opened by agent")) return ["defect", "agent-mismatch"]
  if (golden.state === "complete") return ["noop"]
  if (golden.state === "awaiting-human" || golden.state === "escalated") return ["parked"]
  throw new Error("the golden fire maps to no TS outcome")
}

interface Departure {
  readonly row: string
  readonly outcome: RelayArm.Outcome
  readonly reason?: string
  // The TS records of the fire, in order, each matched on the fields given.
  readonly entries: ReadonlyArray<Entry>
  // Arm files equal the golden's apart from the round sha, which covers the departing lines.
  readonly sameArm: boolean
}

const judged = (item: string, verdict: string, graded_by: string) => ({
  event: "checklist-item",
  item,
  verdict,
  graded_by,
})
const invalid = "judge:unavailable(invalid-response)(non-independent)"
const failing = (ids: string) =>
  `Relay gate 'A' is NOT satisfied. Still failing:${ids}. Address these, then finish. Instructions: do A`

// Every arm golden the TS engine departs from on purpose, with the PARITY-EXCEPTIONS row that declares it.
const DEPARTURES: Record<string, Departure> = {
  "e5-host-check": {
    row: "WP6-3",
    outcome: "gate-fail",
    reason: failing("; permissions"),
    entries: [
      { ...judged("permissions", "fail", "unavailable(missing)"), oracle: SHA.permissions, host_check: "permissions" },
      { event: "gate-fail", fails: "; permissions", retry: 1 },
    ],
    sameArm: true,
  },
  "e4-judge-responses": {
    row: "WP3-4",
    outcome: "gate-fail",
    reason: failing("; BROKEN; ADVISORY-VERDICT; TWO-OBJECTS; NUMERIC-BACKEND"),
    entries: [
      judged("EXIT-BLOCKING", "pass", "judge:stub(non-independent)"),
      judged("EXIT-ADVISORY", "pass", "judge:stub(non-independent)"),
      ...["BROKEN", "ADVISORY-VERDICT", "TWO-OBJECTS", "NUMERIC-BACKEND"].map((item) => judged(item, "fail", invalid)),
      judged("API-PASS", "pass", "judge:api(non-independent)"),
      judged("API-FAIL-ADVISORY", "fail", "judge:api(non-independent)"),
      judged("EMPTY-BACKEND", "pass", "judge:judge(non-independent)"),
      { event: "gate-fail", fails: "; BROKEN; ADVISORY-VERDICT; TWO-OBJECTS; NUMERIC-BACKEND" },
    ],
    sameArm: true,
  },
  "parity-hook-variables-visible": {
    row: "WP3-1",
    outcome: "gate-fail",
    reason: failing("; sees-token; sees-arm-dir; sees-index"),
    entries: [
      ...["sees-token", "sees-arm-dir", "sees-index"].map((item) => judged(item, "fail", "deterministic")),
      { event: "gate-fail", fails: "; sees-token; sees-arm-dir; sees-index" },
    ],
    sameArm: false,
  },
  "parity-judge-paths-glob-from-cwd": {
    row: "WP3-2",
    outcome: "complete",
    entries: [
      { event: "checklist-item", item: "GLOB", scope: "*.md", artifact: SHA.glob },
      { event: "checklist-item", item: "PARAM", scope: "${wp_dir}/x.md", verdict: "pass" },
      { event: "sprint-complete" },
    ],
    sameArm: true,
  },
}

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

test("every arm golden departure names its PARITY-EXCEPTIONS row", async () => {
  const rows = (await read(path.join(root, "test/golden/PARITY-EXCEPTIONS.md"))).split("\n")
  Object.entries(DEPARTURES).forEach(([name, departure]) =>
    expect(rows.find((line) => line.startsWith(`| ${departure.row} |`))).toContain(`\`arm/${name}\``),
  )
  const scan = rows.find((line) => line.startsWith("| WP6-1 |"))
  ;["a1-no-token-no-marker", "a2-several-markers", ...Object.keys(EXPLICIT)].forEach((name) =>
    expect(scan).toContain(`\`arm/${name}\``),
  )
})

// The goldens are POSIX (R11): workdirs and `<root>` paths are written into JSON unescaped, and the checks are bash
// programs, so the plan keeps arm replay off Windows; Windows runs the ledger, authoring and hook-evaluation suites.
describe.skipIf(process.platform === "win32")("arm goldens", () => {
  const names = existsSync(goldens)
    ? readdirSync(goldens).filter((name) => existsSync(path.join(goldens, name, "scenario.json")))
    : []
  let fired = 0

  // G2 covers every FORMAT.md exit path; without the goldens this fails rather than passing empty.
  test("the arm goldens are present", () => expect(names.length).toBeGreaterThanOrEqual(84))

  names.sort().forEach((name) =>
    test(name, async () => {
      const scenario: Scenario = await Bun.file(path.join(goldens, name, "scenario.json")).json()
      const env = await scratch()
      const commits = (scenario.commits ?? []).map((commit) => bytes(commit.files, []))
      const messages = (scenario.commits ?? []).map((commit) => commit.message)
      const shas = commits.length ? await repo(env, commits, messages) : []
      await write(env.work, bytes(scenario.tree ?? {}, shas))
      // sprint.json and meta.json exactly as the generator wrote them; the hook never rewrites either.
      const first = path.join(goldens, name, "expected", "0", "arm")
      for (const file of ["sprint.json", "meta.json"].filter((file) => existsSync(path.join(first, file))))
        await write(env.arm, { [file]: (await read(path.join(first, file))).replaceAll("<root>", env.dir) })
      const prestate = bytes(scenario.prestate ?? {}, shas)
      await write(env.arm, prestate)
      const vars: Record<string, string> = {
        RELAY_ARM_TOKEN: TOKEN,
        CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: "0",
        ...scenario.env,
      }
      const judge = vars.RELAY_JUDGE ? scripted : stub(vars.RELAY_JUDGE_STUB)
      const token = EXPLICIT[name] ?? vars.RELAY_ARM_TOKEN!
      const cap = vars.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP!
      // The ledger key seals the chain; it is never a check parameter (R7).
      const params = Object.fromEntries(
        Object.entries(scenario.env ?? {}).filter(([key]) => key !== "RELAY_LEDGER_KEY"),
      )
      for (const [n, fire] of scenario.fires.entries()) {
        await write(env.work, bytes(fire.tree ?? {}, shas))
        if (fire.release !== undefined) await write(env.arm, { release: value(fire.release, shas) })
        const rows = fire.transcript?.map((row) => `${typeof row === "string" ? row : JSON.stringify(row)}\n`)
        if (rows) await Bun.write(env.transcript, rows.join(""))
        const evaluation = await run(
          env,
          ArmEvaluate.evaluate({
            token,
            ...(fire.agentID === undefined ? {} : { agentID: fire.agentID }),
            ...(rows ? { transcript: env.transcript } : {}),
            // The hook read a junk cap as its default; a NaN option is junk.
            blockCap: /^[0-9]+$/.test(cap) ? Number(cap) : Number.NaN,
            ...(vars.RELAY_COMPACT_AFTER === undefined ? {} : { compactAfter: Number(vars.RELAY_COMPACT_AFTER) }),
            params,
          }),
          { at: fire.at ?? EPOCH + 60 * n, judge, key: vars.RELAY_LEDGER_KEY },
        )
        fired++
        const expected = path.join(goldens, name, "expected", String(n))
        const ledger = await read(path.join(expected, "ledger.jsonl"))
        // No scenario seeds a ledger, so fire 0 appends to an empty one.
        const before = n ? await read(path.join(goldens, name, "expected", String(n - 1), "ledger.jsonl")) : ""
        const appended = parse(ledger.slice(before.length))
        const golden = await armFiles(path.join(expected, "arm"))
        const actual = await armFiles(env.arm, env.dir)
        expect(existsSync(path.join(env.arm, ".chain.lock"))).toBe(false)
        expect(existsSync(path.join(env.arm, ".run.lock"))).toBe(Object.hasOwn(prestate, ".run.lock/owner"))

        const departure = DEPARTURES[name]
        if (departure) {
          const recorded = await entries(env)
          expect(recorded.length).toBe(departure.entries.length)
          departure.entries.forEach((entry, k) => expect(recorded[k]).toMatchObject(entry))
          expect([evaluation.outcome, evaluation.reason]).toEqual([departure.outcome, departure.reason])
          expect((await Effect.runPromise(LedgerVerify.verify(path.join(env.arm, "ledger.jsonl")))).exit).toBe(0)
          const rounds = (files: Record<string, string>) =>
            Object.fromEntries(Object.entries(files).filter(([file]) => !file.startsWith("round_")))
          if (departure.sameArm) expect(rounds(actual)).toEqual(rounds(golden))
          const failed = recorded.findLast((entry) => entry.event === "gate-fail")
          if (failed) expect(actual["round_A"]).toBe(String(failed.round))
          continue
        }
        expect(await read(path.join(env.arm, "ledger.jsonl"))).toBe(ledger)
        expect(actual).toEqual(golden)
        const reason = path.join(expected, "reason.txt")
        expect(evaluation.reason).toBe(existsSync(reason) ? await read(reason) : undefined)
        const outcome = await Bun.file(path.join(expected, "outcome.json")).json()
        const armed = existsSync(path.join(env.arms, token, "sprint.json"))
        const want = expectedOutcome({ ...outcome, token, appended, state: golden.state, armed })
        expect([evaluation.outcome, evaluation.defect]).toEqual([want[0], want[1]])
        const disposition = appended.findLast((entry) => DISPOSITIONS[String(entry.event)])
        if (disposition) expect(evaluation.wp).toBe(String(disposition.wp))
        if (disposition) expect(evaluation.failing).toEqual([...split(disposition.fails), ...split(disposition.reg)])
        const last = parse(ledger).at(-1)
        expect(evaluation.ledgerSeq).toBe(last === undefined ? -1 : Number(last.seq))
        const injected = appended.find((entry) => entry.event === "inject")
        expect(evaluation.inject).toEqual(injected && { file: String(injected.file), sha: String(injected.sha) })
      }
      // No corpus copy (WP6-2) and no other arm: the evaluation writes under its own arm and the work tree only.
      const layout = ["arms", "home", "transcript.jsonl", "work"]
      expect(readdirSync(env.dir).filter((entry) => !layout.includes(entry))).toEqual([])
      expect(readdirSync(env.arms)).toEqual([TOKEN])
    }),
  )

  test("every fire of every golden was replayed", async () => {
    const counts = await Promise.all(
      names.map(async (name) => (await Bun.file(path.join(goldens, name, "scenario.json")).json()).fires.length),
    )
    expect(fired).toBe(counts.reduce((sum: number, count: number) => sum + count, 0))
  })
})

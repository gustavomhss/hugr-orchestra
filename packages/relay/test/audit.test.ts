import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Redacted, Result } from "effect"
import { RelayAudit } from "../src/audit"
import { LedgerRead } from "../src/ledger/read"

// WP2 parity. The G1 goldens (test/golden/{audit,ledger}) hold `bin/relay verify|problems|cost --json` for every
// fixture, mutant and synthetic case; their paths are relative to packages/relay, where the oracle ran, so the tests
// run there too. Tables marked "recorded" below were printed by the pinned `bin/relay` under Python 3.14.5 for paths
// no golden reaches.
const root = path.join(import.meta.dir, "..")
const golden = path.join(root, "test", "golden")
const origin = process.cwd()
const scratch: string[] = []
const windows = process.platform === "win32"
// chmod 000 keeps neither Windows nor root from reading a file.
const permissionsBite = !windows && process.getuid?.() !== 0
const BARE = "test/golden/audit/pass-bare-ledger/input/ledger.jsonl"

beforeAll(() => process.chdir(root))
afterAll(async () => {
  process.chdir(origin)
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })))
})

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-audit-"))
  scratch.push(dir)
  return dir
}

// The goldens are POSIX; os.path.join on Windows would print the same paths with backslashes.
function posix(text: string) {
  return windows ? text.replaceAll("\\", "/") : text
}

// Reports as `json.dumps(..., indent=2)` prints them: member order is compared too.
function print(report: unknown) {
  return JSON.stringify(
    report,
    (key, value) => ((key === "ledger" || key === "sprint") && typeof value === "string" ? posix(value) : value),
    2,
  )
}

interface Outcome {
  readonly exit: number
  readonly json: string
  readonly stderr: string | undefined
}

// One command as the CLI would have ended: Missing is `no ledger at` with exit 2, and ReadError stands for Python's
// traceback (exit 1, no JSON), whose last line is `Type: message`.
async function outcome<A>(
  effect: Effect.Effect<A, LedgerRead.Missing | LedgerRead.ReadError>,
  exit: (report: A) => number,
): Promise<Outcome> {
  const result = await run(Effect.result(effect))
  if (Result.isSuccess(result)) return { exit: exit(result.success), json: print(result.success), stderr: undefined }
  if (result.failure._tag === "LedgerRead.Missing")
    return { exit: 2, json: "null", stderr: `no ledger at ${posix(result.failure.ledger)}\n` }
  return { exit: 1, json: "null", stderr: result.failure.reason }
}

async function recorded(dir: string, stem: string): Promise<Outcome> {
  const exits: Record<string, number> = await Bun.file(path.join(dir, "exits.json")).json()
  const errors = Bun.file(path.join(dir, "stderr.json"))
  const stderr: string | undefined = (await errors.exists()) ? (await errors.json())[stem] : undefined
  return {
    exit: exits[stem],
    json: print(await Bun.file(path.join(dir, `${stem}.json`)).json()),
    stderr:
      stderr === undefined || stderr.startsWith("no ledger at ") ? stderr : stderr.slice(stderr.indexOf(": ") + 2),
  }
}

const problemsExit = (report: RelayAudit.ProblemsReport) => (report.problems.length > 0 ? 1 : 0)

async function goldenCases(area: string, keep: (name: string) => boolean) {
  return (await readdir(path.join(golden, area), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && keep(entry.name))
    .map((entry) => entry.name)
    .sort()
}

describe("RelayAudit goldens", () => {
  test("every synthetic case: verify, problems and cost as bin/relay printed them", async () => {
    const cases = await goldenCases("audit", () => true)
    expect(cases.length).toBe(106)
    const skipped: string[] = []
    const compared = { count: 0 }
    for (const name of cases) {
      const dir = path.join(golden, "audit", name)
      const spec: { target: string; verify: string[]; key: string | null; chmod: Record<string, string> } =
        await Bun.file(path.join(dir, "case.json")).json()
      // The only verify arguments the generator used: none, `--sprint <path>`, or a bare `--sprint`.
      expect({ name, verify: spec.verify.length === 0 || spec.verify[0] === "--sprint" }).toEqual({
        name,
        verify: true,
      })
      if (Object.keys(spec.chmod).length > 0 && !permissionsBite) {
        skipped.push(name)
        continue
      }
      const sprint = spec.verify.length === 0 ? undefined : (spec.verify[1] ?? "")
      const key = spec.key === null ? undefined : Redacted.make(spec.key)
      await Promise.all(Object.entries(spec.chmod).map((entry) => chmod(entry[0], Number.parseInt(entry[1], 8))))
      const actual = await Promise.all([
        outcome(RelayAudit.verify(spec.target, { sprint, key }), (report) => report.exit),
        outcome(RelayAudit.problems(spec.target), problemsExit),
        outcome(RelayAudit.cost(spec.target), () => 0),
      ]).finally(() => Promise.all(Object.keys(spec.chmod).map((file) => chmod(file, 0o644))))
      for (const [index, stem] of ["verify", "problems", "cost"].entries()) {
        expect({ name, stem, ...actual[index] }).toEqual({ name, stem, ...(await recorded(dir, stem)) })
        compared.count++
      }
    }
    expect(skipped).toEqual(permissionsBite ? [] : ["sprint-invalid-unreadable"])
    expect(compared.count).toBe(3 * (106 - skipped.length))
  })

  test("every fixture and mutant ledger: verify in each recorded key mode, problems and cost", async () => {
    const cases = await goldenCases("ledger", (name) => !name.startsWith("writer-"))
    // 15 fixtures and 49 mutants.
    expect(cases.length).toBe(64)
    const compared = { count: 0 }
    for (const name of cases) {
      const dir = path.join(golden, "ledger", name)
      const spec: { ledger: string; keys: Record<string, string> } = await Bun.file(path.join(dir, "case.json")).json()
      const runs: Array<readonly [string, Promise<Outcome>]> = [
        ["verify", outcome(RelayAudit.verify(spec.ledger), (report) => report.exit)],
        ...Object.entries(spec.keys).map(
          (entry) =>
            [
              `verify.${entry[0]}`,
              outcome(RelayAudit.verify(spec.ledger, { key: Redacted.make(entry[1]) }), (report) => report.exit),
            ] as const,
        ),
        ["problems", outcome(RelayAudit.problems(spec.ledger), problemsExit)],
        ["cost", outcome(RelayAudit.cost(spec.ledger), () => 0)],
      ]
      for (const [stem, pending] of runs) {
        expect({ name, stem, ...(await pending) }).toEqual({ name, stem, ...(await recorded(dir, stem)) })
        compared.count++
      }
    }
    // 75 verify runs (64 plain plus 11 keyed modes), then problems and cost for each ledger.
    expect(compared.count).toBe(75 + 64 + 64)
  })
})

// Lines need no chain here: problems and cost never check integrity.
async function ledgerOf(lines: ReadonlyArray<string>) {
  const ledger = path.join(await directory(), "ledger.jsonl")
  await writeFile(ledger, lines.map((line) => `${line}\n`).join(""))
  return ledger
}

// The report without its ledger member, or the message a ReadError carries.
async function settle<A extends object>(effect: Effect.Effect<A, LedgerRead.Missing | LedgerRead.ReadError>) {
  const result = await run(Effect.result(effect))
  if (Result.isSuccess(result)) return JSON.parse(print({ ...result.success, ledger: undefined }))
  return { raised: result.failure._tag === "LedgerRead.ReadError" ? result.failure.reason : result.failure._tag }
}

const UNMEASURED = {
  total: null,
  states: [],
  macros: [],
  note: "this run recorded no cost data — not zero cost, unmeasured",
}

describe("RelayAudit problems and cost", () => {
  // Recorded: `relay problems|cost <ledger> --json`, the JSON without its ledger member, or the raised message.
  const cases: ReadonlyArray<{
    readonly name: string
    readonly lines: ReadonlyArray<string>
    readonly problems: unknown
    readonly cost: unknown
  }> = [
    {
      name: "a truthy fails that is not text",
      lines: ['{"wp":"wp1","event":"gate-fail","retry":1,"fails":3,"reg":""}'],
      problems: { raised: "'int' object has no attribute 'lstrip'" },
      cost: UNMEASURED,
    },
    {
      name: "a truthy reg that is not text",
      lines: ['{"wp":"wp1","event":"gate-fail","retry":1,"fails":"; C1","reg":["C0"]}'],
      problems: { raised: "'list' object has no attribute 'lstrip'" },
      cost: UNMEASURED,
    },
    {
      name: "falsy fails and reg, a list wp and a float retry",
      lines: [
        '{"wp":["a"],"event":"escalate","retry":2.5,"fails":[],"reg":""}',
        '{"wp":"w","event":"gate-fail","retry":2.5,"fails":"; ;C1","reg":{}}',
      ],
      problems: {
        problems: [
          { category: "awaiting-human", wp: ["a"], cause: "retry budget spent at ['a']; still failing: (unrecorded)" },
          { category: "gate-failing", wp: "w", cause: "retry 2.5: C1" },
        ],
      },
      cost: { ...UNMEASURED, states: [{ wp: ["a"], macro: null, elapsed_s: null }] },
    },
    {
      name: "drifting controls whose ids are not text",
      lines: [
        '{"event":"checklist-item","item":1,"verdict":"fail","oracle":"a"}',
        '{"event":"regression-item","item":true,"verdict":"pass","oracle":"b"}',
      ],
      problems: { raised: "sequence item 0: expected str instance, int found" },
      cost: UNMEASURED,
    },
    {
      name: "drifting oracles that cannot be sliced",
      lines: [
        '{"event":"checklist-item","item":"C1","verdict":"fail","oracle":5}',
        '{"event":"checklist-item","item":"C1","verdict":"pass","oracle":6}',
      ],
      problems: { raised: "'int' object is not subscriptable" },
      cost: UNMEASURED,
    },
    {
      name: "an oracle that cannot be hashed",
      lines: ['{"event":"checklist-item","item":"C1","verdict":"fail","oracle":[1]}'],
      problems: { raised: "cannot use 'list' as a set element (unhashable type: 'list')" },
      cost: UNMEASURED,
    },
    {
      name: "1 and true are one oracle",
      lines: [
        '{"event":"checklist-item","item":"C1","verdict":"fail","oracle":1}',
        '{"event":"checklist-item","item":"C1","verdict":"pass","oracle":true}',
      ],
      problems: { problems: [] },
      cost: UNMEASURED,
    },
    {
      name: "astral oracles drift without raising",
      lines: [
        '{"event":"checklist-item","item":"C1","verdict":"fail","oracle":"😀😀😀😀😀😀😀😀😀😀😀😀😀"}',
        '{"event":"checklist-item","item":"C1","verdict":"pass","oracle":"x"}',
      ],
      problems: {
        problems: [{ category: "oracle-drift", wp: null, cause: "graded under more than one oracle: C1" }],
      },
      cost: UNMEASURED,
    },
    {
      name: "a cost member that is text",
      lines: ['{"wp":"a","event":"advance-reveal","cost":{"in":"x"}}'],
      problems: { problems: [] },
      cost: { raised: "unsupported operand type(s) for +: 'int' and 'str'" },
    },
    {
      name: "an elapsed_s that is text",
      lines: ['{"wp":"a","event":"advance-reveal","cost":{"in":1},"elapsed_s":"9"}'],
      problems: { problems: [] },
      cost: { raised: "unsupported operand type(s) for +: 'int' and 'str'" },
    },
    {
      name: "a macro that cannot be hashed",
      lines: ['{"wp":"a","event":"advance-reveal","macro":["m"],"cost":{"in":1}}'],
      problems: { problems: [] },
      cost: { raised: "cannot use 'list' as a dict key (unhashable type: 'list')" },
    },
    {
      name: "falsy members count as 0, true as 1, and 1 and true are one macro",
      lines: [
        '{"wp":"a","event":"advance-reveal","macro":"","cost":{"in":true,"out":[],"cache_read":{},"cache_write":"","turns":false},"elapsed_s":0.5}',
        '{"wp":"b","event":"sprint-complete","macro":1,"cost":{"in":1.5},"elapsed_s":true}',
        '{"wp":"c","event":"escalate","macro":true,"elapsed_s":2}',
      ],
      problems: {
        problems: [
          { category: "awaiting-human", wp: "c", cause: "retry budget spent at c; still failing: (unrecorded)" },
        ],
      },
      cost: {
        total: { in: 2.5, out: 0, cache_read: 0, cache_write: 0, turns: 0, elapsed_s: 3.5 },
        states: [
          {
            wp: "a",
            macro: "",
            elapsed_s: 0.5,
            in: true,
            out: [],
            cache_read: {},
            cache_write: "",
            turns: false,
          },
          { wp: "b", macro: 1, elapsed_s: true, in: 1.5, out: 0, cache_read: 0, cache_write: 0, turns: 0 },
          { wp: "c", macro: true, elapsed_s: 2 },
        ],
        macros: [
          { macro: "_", elapsed_s: 0.5, in: 1, out: 0, cache_read: 0, cache_write: 0, turns: 0 },
          { macro: 1, elapsed_s: 3, in: 1.5, out: 0, cache_read: 0, cache_write: 0, turns: 0 },
        ],
      },
    },
    {
      name: "a priced gate event counts in the total but is no state",
      lines: ['{"wp":"a","event":"gate-fail","cost":{"in":4,"turns":2},"elapsed_s":3}'],
      problems: { problems: [] },
      cost: { total: { in: 4, out: 0, cache_read: 0, cache_write: 0, turns: 2, elapsed_s: 0 }, states: [], macros: [] },
    },
  ]

  test("they raise where bin/relay raised and pass recorded values through as Python reads them", async () => {
    for (const row of cases) {
      const ledger = await ledgerOf(row.lines)
      const actual = {
        problems: await settle(RelayAudit.problems(ledger)),
        cost: await settle(RelayAudit.cost(ledger)),
      }
      expect({ name: row.name, ...actual }).toEqual({
        name: row.name,
        problems: JSON.parse(print(row.problems)),
        cost: JSON.parse(print(row.cost)),
      })
    }
  })

  test("a raised record is a ReadError naming the ledger, never a report", async () => {
    const ledger = await ledgerOf(['{"event":"checklist-item","verdict":"fail","oracle":"a"}'])
    const failure = await run(Effect.flip(RelayAudit.problems(ledger)))
    expect(failure).toBeInstanceOf(LedgerRead.ReadError)
    expect({ ledger: failure.ledger, reason: failure._tag === "LedgerRead.ReadError" ? failure.reason : "" }).toEqual({
      ledger,
      reason: "'item'",
    })
  })

  test("WP2-2: a float with an integral value reads as an int (PARITY-EXCEPTIONS)", async () => {
    // bin/relay prints `retry 2.0: C1`; the plain JS number the reader yields cannot keep the `.0`.
    const ledger = await ledgerOf(['{"wp":"wp1","event":"gate-fail","retry":2.0,"fails":"; C1","reg":""}'])
    expect((await run(RelayAudit.problems(ledger))).problems).toEqual([
      { category: "gate-failing", wp: "wp1", cause: "retry 2: C1" },
    ])
  })
})

async function sprintFile(bytes: string | Uint8Array) {
  const sprint = path.join(await directory(), "sprint.json")
  await Bun.write(sprint, bytes)
  return sprint
}

describe("RelayAudit verify", () => {
  test("the sprint is read as open().read() reads it: one-pass UTF-8, universal newlines, encodable oracles", async () => {
    // Recorded: `relay verify <BARE> --sprint <file> --json`, oracle_recheck.reason.
    const cases: ReadonlyArray<readonly [string | Uint8Array, string]> = [
      ["{\r\n  broken", "Expecting property name enclosed in double quotes: line 2 column 3 (char 4)"],
      [
        Uint8Array.from([...Buffer.from('{"work_packages": ['), 0xff, 0x5d, 0x7d]),
        "'utf-8' codec can't decode byte 0xff in position 19: invalid start byte",
      ],
      [
        Uint8Array.from([...Buffer.from('{"a": "'), 0xe2, 0x82]),
        "'utf-8' codec can't decode bytes in position 7-8: unexpected end of data",
      ],
      [
        '{"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"x\\ud800y"}]}]}',
        "'utf-8' codec can't encode character '\\ud800' in position 1: surrogates not allowed",
      ],
      ['﻿{"work_packages":[]}', "Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)"],
    ]
    for (const [bytes, reason] of cases) {
      const sprint = await sprintFile(bytes)
      const report = await run(RelayAudit.verify(BARE, { sprint }))
      expect({ result: report.result, exit: report.exit, recheck: report.oracle_recheck }).toEqual({
        result: "SPRINT-INVALID",
        exit: 2,
        recheck: { status: "invalid", items: [], sprint, reason },
      })
    }
  })

  test("WP2-1: duplicate keys, NaN and deep nesting make the sprint invalid (PARITY-EXCEPTIONS)", async () => {
    // json.load accepted the first two (the last duplicate wins, NaN is a float) and certified this run as PASS; it
    // raised RecursionError on the third.
    const cases = [
      [
        '{"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"false","cmd":"true"}]}]}',
        "duplicate JSON key 'cmd'",
      ],
      ['{"gen":NaN,"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"true"}]}]}', "non-JSON constant 'NaN'"],
      [
        `{"brief":${"[".repeat(2000)}${"]".repeat(2000)},"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"true"}]}]}`,
        "maximum nesting depth exceeded",
      ],
    ] as const
    for (const [text, reason] of cases) {
      const sprint = await sprintFile(text)
      const report = await run(RelayAudit.verify(BARE, { sprint }))
      expect({ result: report.result, recheck: report.oracle_recheck }).toEqual({
        result: "SPRINT-INVALID",
        recheck: { status: "invalid", items: [], sprint, reason },
      })
    }
    // The same plan without the ambiguity is the oracle the ledger recorded.
    const clean = await sprintFile('{"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"true"}]}]}')
    expect((await run(RelayAudit.verify(BARE, { sprint: clean }))).result).toBe("PASS")
  })

  test("sprint discovery: a directory's sprint.json before .relay-state/sprint.json; never beside a bare ledger", async () => {
    const dir = await directory()
    await mkdir(path.join(dir, ".relay-state"))
    await copyFile(BARE, path.join(dir, ".relay-state", "ledger.jsonl"))
    await writeFile(
      path.join(dir, ".relay-state", "sprint.json"),
      '{"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"true"}]}]}',
    )
    await writeFile(
      path.join(dir, "sprint.json"),
      '{"work_packages":[{"id":"wp1","checklist":[{"id":"C1","cmd":"test -f artifact.txt"}]}]}',
    )
    expect((await run(RelayAudit.verify(dir))).result).toBe("SPRINT-DIVERGED")
    await rm(path.join(dir, "sprint.json"))
    expect((await run(RelayAudit.verify(dir))).result).toBe("PASS")
    const bare = await run(RelayAudit.verify(path.join(dir, ".relay-state", "ledger.jsonl")))
    expect({ result: bare.result, status: bare.oracle_recheck.status }).toEqual({ result: "PASS", status: "not-run" })
  })

  test("the key selects the verifier's mode and is never read from the environment", async () => {
    const keyed = "test/golden/audit/mode-keyed/input/ledger.jsonl"
    const previous = process.env.RELAY_LEDGER_KEY
    process.env.RELAY_LEDGER_KEY = "relay-golden-ledger-key"
    const without = await run(RelayAudit.verify(keyed)).finally(() => {
      delete process.env.RELAY_LEDGER_KEY
      if (previous !== undefined) process.env.RELAY_LEDGER_KEY = previous
    })
    expect({ result: without.result, exit: without.exit }).toEqual({ result: "TAMPERED", exit: 1 })
    const keyedReport = await run(RelayAudit.verify(keyed, { key: Redacted.make("relay-golden-ledger-key") }))
    expect({ result: keyedReport.result, exit: keyedReport.exit }).toEqual({ result: "PASS", exit: 0 })
  })
})

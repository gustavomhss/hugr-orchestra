/**
 * External-run goldens (Relay for LangGraph WP0): the frozen ledger contract of `@orchestra/schema/relay-external`.
 *
 * Dev-only, like the other generators: it writes committed goldens once, and regenerating them is its own reviewed
 * change. Run `bun test/golden/generate/external.ts` from modules/relay; two runs are byte-identical.
 *
 * Every chain line comes from `LedgerChain.append` (plain SHA-256, gen 0), so the bytes are the TS writer's. The
 * expectations are written here by hand, never computed by the code under test.
 *
 * Layout: test/golden/external/{valid,mutant}/<name>/ holds `ledger.jsonl` and `expected.json`
 * `{verify: {exit, line}, run?}`, where `line` is the 1-based line the verifier reports broken (null when intact) and
 * `run` is the `runFromLedger` snapshot.
 */
import path from "node:path"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { Effect } from "effect"
import { RelayExternal } from "@orchestra/schema/relay-external"
import { LedgerChain } from "../../../src/ledger/chain"

const ROOT = path.join(import.meta.dir, "..", "external")
const AT = 1_700_000_000_000

const files = new Map<string, string>()
const scratch = await mkdtemp(path.join(tmpdir(), "relay-external-golden-"))

async function chain(bodies: ReadonlyArray<RelayExternal.Body>) {
  const ledger = path.join(scratch, `${files.size}.jsonl`)
  await writeFile(ledger, "")
  await Effect.runPromise(
    Effect.forEach(bodies, (body) => LedgerChain.append({ ledger, body: JSON.stringify(body), gen: 0 }), {
      discard: true,
    }),
  )
  return readFile(ledger, "utf8")
}

function golden(name: string, ledger: string, expected: object) {
  files.set(`${name}/ledger.jsonl`, ledger)
  files.set(`${name}/expected.json`, `${JSON.stringify(expected, null, 2)}\n`)
}

function stamper(thread_id: string) {
  return (n: number, node: string, attempt: number, kind: string) => ({
    key: RelayExternal.key({ thread_id, node, attempt, kind }),
    at: AT + n * 1000,
  })
}

function runStart(thread_id: string, graph: string) {
  return {
    event: "run.start",
    ...stamper(thread_id)(0, RelayExternal.RUN_NODE, 0, "run.start"),
    thread_id,
    graph,
    library_version: "0.1.0",
  } as const
}

const INTACT = { exit: 0, line: null }

// valid/pass: the gate fails once, the node retries, the gate passes and the run completes.
const pass = stamper("thread-pass")
const passLedger = await chain([
  runStart("thread-pass", "coder"),
  { event: "step.start", ...pass(1, "write_code", 1, "step.start"), node: "write_code", attempt: 1 },
  {
    event: "check.result",
    ...pass(2, "write_code", 1, "check.result:tests"),
    node: "write_code",
    attempt: 1,
    id: "tests",
    kind: "cmd",
    verdict: "fail",
    output: "FAILED test_add - assert 3 == 4\n1 failed",
  },
  { event: "step.end", ...pass(3, "write_code", 1, "step.end"), node: "write_code", attempt: 1, outcome: "fail" },
  { event: "step.start", ...pass(4, "write_code", 2, "step.start"), node: "write_code", attempt: 2 },
  {
    event: "check.result",
    ...pass(5, "write_code", 2, "check.result:tests"),
    node: "write_code",
    attempt: 2,
    id: "tests",
    kind: "cmd",
    verdict: "pass",
    output: "2 passed",
  },
  { event: "step.end", ...pass(6, "write_code", 2, "step.end"), node: "write_code", attempt: 2, outcome: "pass" },
  { event: "sprint-complete", ...pass(7, RelayExternal.END_NODE, 0, "sprint-complete") },
])
golden("valid/pass", passLedger, {
  verify: INTACT,
  run: {
    runID: "thread-pass",
    documentID: "external:coder",
    status: "completed",
    position: "write_code",
    failing: [],
    label: "coder",
    agent: "langgraph",
    startedAt: AT,
    endedAt: AT + 7000,
    steps: [
      {
        wp: "write_code",
        status: "passed",
        attempts: 2,
        startedAt: AT + 1000,
        endedAt: AT + 6000,
        checks: [{ id: "tests", verdict: "pass", output: "2 passed" }],
      },
    ],
  },
})

// mutant/byte-flip: one byte of line 3's signed body changes and its `h` stays, so its MAC no longer matches.
golden("mutant/byte-flip", passLedger.replace("1 failed", "0 failed"), { verify: { exit: 1, line: 3 } })

// valid/approval: an exported project; checks pass, a human approves at the terminal, the run completes.
const approval = stamper("thread-approval")
golden(
  "valid/approval",
  await chain([
    {
      ...runStart("thread-approval", "release"),
      document_id: "doc_release",
      document_version: "ver_3",
    },
    { event: "step.start", ...approval(1, "deploy", 1, "step.start"), node: "deploy", attempt: 1 },
    {
      event: "check.result",
      ...approval(2, "deploy", 1, "check.result:smoke"),
      node: "deploy",
      attempt: 1,
      id: "smoke",
      kind: "cmd",
      verdict: "pass",
      output: "smoke ok",
    },
    {
      event: "check.result",
      ...approval(3, "deploy", 1, "check.result:changelog"),
      node: "deploy",
      attempt: 1,
      id: "changelog",
      kind: "judge",
      verdict: "advisory",
      output: "advisory: no model configured",
    },
    { event: "approval.request", ...approval(4, "deploy", 1, "approval.request"), node: "deploy", attempt: 1 },
    {
      event: "approval.decision",
      ...approval(5, "deploy", 1, "approval.decision"),
      node: "deploy",
      attempt: 1,
      request_seq: 4,
      decision: "approve",
      note: "ship it",
      source: "terminal",
    },
    { event: "step.end", ...approval(6, "deploy", 1, "step.end"), node: "deploy", attempt: 1, outcome: "pass" },
    { event: "sprint-complete", ...approval(7, RelayExternal.END_NODE, 0, "sprint-complete") },
  ]),
  {
    verify: INTACT,
    run: {
      runID: "thread-approval",
      documentID: "doc_release",
      version: "ver_3",
      status: "completed",
      position: "deploy",
      failing: [],
      label: "release",
      agent: "langgraph",
      startedAt: AT,
      endedAt: AT + 7000,
      steps: [
        {
          wp: "deploy",
          status: "passed",
          attempts: 1,
          startedAt: AT + 1000,
          endedAt: AT + 6000,
          checks: [
            { id: "smoke", verdict: "pass", output: "smoke ok" },
            { id: "changelog", verdict: "advisory", output: "advisory: no model configured" },
          ],
          note: "ship it",
        },
      ],
    },
  },
)

// valid/escalate: the gate fails on both attempts of a retry budget of 2 and the run escalates.
const escalate = stamper("thread:escalate/1")
const lint = (n: number, attempt: number, output: string) =>
  ({
    event: "check.result",
    ...escalate(n, "fix", attempt, "check.result:lint"),
    node: "fix",
    attempt,
    id: "lint",
    kind: "cmd",
    verdict: "fail",
    output,
  }) as const
golden(
  "valid/escalate",
  await chain([
    runStart("thread:escalate/1", "fixer"),
    { event: "step.start", ...escalate(1, "fix", 1, "step.start"), node: "fix", attempt: 1 },
    lint(2, 1, "lint: 2 errors"),
    { event: "step.end", ...escalate(3, "fix", 1, "step.end"), node: "fix", attempt: 1, outcome: "fail" },
    { event: "step.start", ...escalate(4, "fix", 2, "step.start"), node: "fix", attempt: 2 },
    lint(5, 2, "lint: 1 error"),
    { event: "step.end", ...escalate(6, "fix", 2, "step.end"), node: "fix", attempt: 2, outcome: "fail" },
    {
      event: "escalate",
      ...escalate(7, RelayExternal.END_NODE, 0, "escalate"),
      reason: "retry budget exhausted (2/2)",
      node: "fix",
    },
  ]),
  {
    verify: INTACT,
    run: {
      // The thread ID has characters outside the run ID rule, so it is hashed.
      runID: "t_e3ad9145f8ade9db315e04568587949f",
      documentID: "external:fixer",
      status: "failed",
      position: "fix",
      failing: ["lint"],
      reason: "retry budget exhausted (2/2)",
      label: "fixer",
      agent: "langgraph",
      startedAt: AT,
      endedAt: AT + 7000,
      steps: [
        {
          wp: "fix",
          status: "escalated",
          attempts: 2,
          startedAt: AT + 1000,
          endedAt: AT + 6000,
          checks: [{ id: "lint", verdict: "fail", output: "lint: 1 error" }],
        },
      ],
    },
  },
)

await rm(scratch, { recursive: true, force: true })
await Promise.all(
  [...files].map(async ([name, text]) => {
    await mkdir(path.dirname(path.join(ROOT, name)), { recursive: true })
    await writeFile(path.join(ROOT, name), text)
  }),
)

import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import type { ToolPart } from "@orchestra/sdk/v2"
import { normalizeSessionMessages } from "@/utils/session-message"
import {
  createEvidenceCache,
  EVIDENCE_CACHE_LIMIT,
  EVIDENCE_CACHE_ENTRY_LIMIT,
  readExecutionEvidence,
  withoutShellProjections,
} from "./orchestra-evidence-data"
import { SUMMARY_WINDOW } from "./orchestra-evidence-parse"

const scope = { scope: "server-a", directory: "/repo" }
const fixture = (name: string) => Bun.file(new URL(`./orchestra-evidence-fixtures/${name}.txt`, import.meta.url)).text()

test("raw shells project once even when the live bridge also indexes a synthetic assistant", () => {
  const assistant = {
    id: "msg_real",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    time: { created: 1 },
    content: [],
  } satisfies SessionMessageInfo
  const shell = {
    id: "msg_shell",
    type: "shell",
    shellID: "shl_1",
    command: "bun test",
    status: "running",
    time: { created: 2 },
  } satisfies SessionMessageInfo
  const source = [assistant, shell, { ...assistant, id: `${shell.id}:assistant` }]
  expect(withoutShellProjections(source)).toEqual([assistant, shell])
  const untouched = [assistant]
  expect(withoutShellProjections(untouched)).toBe(untouched)
})

function bash(input: {
  id?: string
  command?: string
  workdir?: string
  status?: "completed" | "running"
  output?: string
  metadata?: Record<string, unknown>
}): ToolPart {
  const state =
    input.status === "running"
      ? { status: "running" as const, input: { command: input.command ?? "bun test" }, time: { start: 1 } }
      : {
          status: "completed" as const,
          input: { command: input.command ?? "bun test", ...(input.workdir ? { workdir: input.workdir } : {}) },
          output: input.output ?? "",
          title: "bun test",
          metadata: { truncated: false, ...input.metadata },
          time: { start: 1, end: 2 },
        }
  return {
    id: input.id ?? "prt_bash",
    sessionID: "ses_a",
    messageID: "msg_a",
    type: "tool",
    callID: "call_a",
    tool: "bash",
    state,
  }
}

describe("readExecutionEvidence", () => {
  test("agent shell runs report the parsed outcome with their source identity", async () => {
    const failed = readExecutionEvidence(
      bash({ output: await fixture("bun-fail"), metadata: { exit: 1, truncated: false }, workdir: "/repo" }),
      scope,
    )
    expect(failed?.state).toBe("failed")
    expect(failed?.exit).toBe(1)
    expect(failed?.summary?.tests.counts).toEqual({ passed: 5, failed: 2, skipped: 1, todo: 1 })
    expect(failed?.source).toEqual({
      scope: "server-a",
      directory: "/repo",
      sessionID: "ses_a",
      messageID: "msg_a",
      partID: "prt_bash",
      callID: "call_a",
      command: "bun test",
      workdir: "/repo",
    })
    const passed = readExecutionEvidence(bash({ output: await fixture("bun-pass"), metadata: { exit: 0 } }), scope)
    expect(passed?.state).toBe("passed")
  })

  test("unknown exit codes stay unconfirmed and zero tests is never a pass", async () => {
    for (const exit of [null, undefined, "0", 1.5]) {
      const value = readExecutionEvidence(bash({ output: await fixture("bun-pass"), metadata: { exit } }), scope)
      expect(value?.state).toBe("unconfirmed")
      expect(value?.exit).toBeUndefined()
    }
    const empty = readExecutionEvidence(
      bash({ command: "pytest", output: await fixture("pytest-zero"), metadata: { exit: 5 } }),
      scope,
    )
    expect(empty?.state).toBe("empty")
  })

  test("a clean exit beside reported failures falls back to the plain output", async () => {
    expect(
      readExecutionEvidence(bash({ output: await fixture("bun-fail"), metadata: { exit: 0 } }), scope),
    ).toBeUndefined()
  })

  test("cards never combine passing status with invented failure names", async () => {
    const console = readExecutionEvidence(
      bash({ command: "jest --ci", output: await fixture("jest-console"), metadata: { exit: 0 } }),
      scope,
    )
    expect(console?.state).toBe("passed")
    expect(console?.summary?.failures).toEqual([])
    expect(
      readExecutionEvidence(bash({ output: await fixture("bun-ghost"), metadata: { exit: 0 } }), scope),
    ).toBeUndefined()
    expect(
      readExecutionEvidence(
        bash({
          command: "playwright test",
          output: await fixture("pw-extra-failure-row.invalid"),
          metadata: { exit: 1 },
        }),
        scope,
      ),
    ).toBeUndefined()
    const pytest = readExecutionEvidence(
      bash({ command: "pytest", output: await fixture("pytest-nodeid-spaces"), metadata: { exit: 1 } }),
      scope,
    )
    expect(pytest?.state).toBe("failed")
    expect(pytest?.summary?.failures).toEqual(["pytest_nodeid_case.py::test_label[hello world]"])
    expect(
      readExecutionEvidence(
        bash({ command: "pytest", output: await fixture("pytest-nodeid-ambiguous"), metadata: { exit: 1 } }),
        scope,
      ),
    ).toBeUndefined()
  })

  test("truncated output is partial: no counts even when a footer survives", async () => {
    const output = await fixture("bun-pass")
    const flagged = readExecutionEvidence(
      bash({ output, metadata: { exit: 0, truncated: true, outputPath: "/tmp/tool-output/abc" } }),
      scope,
    )
    expect(flagged).toMatchObject({ state: "partial", outputPath: "/tmp/tool-output/abc" })
    expect(flagged?.summary).toBeUndefined()
    const prefixed = readExecutionEvidence(
      bash({ output: `...output truncated...\n\nFull output saved to: /tmp/x\n\n${output}`, metadata: { exit: 0 } }),
      scope,
    )
    expect(prefixed?.state).toBe("partial")
  })

  test("parses retained output, never the metadata preview", async () => {
    const preview = await fixture("bun-pass")
    expect(
      readExecutionEvidence(bash({ output: "(no output)", metadata: { exit: 0, output: preview } }), scope),
    ).toBeUndefined()
  })

  test("non-test, running and non-shell parts keep the existing renderer", async () => {
    const output = await fixture("bun-pass")
    expect(
      readExecutionEvidence(bash({ command: "bun run test", output, metadata: { exit: 0 } }), scope),
    ).toBeUndefined()
    expect(readExecutionEvidence(bash({ status: "running" }), scope)).toBeUndefined()
    expect(readExecutionEvidence({ ...bash({ output, metadata: { exit: 0 } }), tool: "read" }, scope)).toBeUndefined()
  })

  test("direct shell runs use the real process status, not the normalized completion", async () => {
    const output = await fixture("bun-pass")
    const run = (status: "exited" | "killed" | "timeout", exit?: number) => {
      const message = {
        id: "msg_shell",
        type: "shell",
        shellID: "shl_1",
        command: "bun test",
        status,
        exit,
        output: { output, cursor: 0, size: output.length, truncated: false },
        time: { created: 10 },
      } satisfies SessionMessageInfo
      const part = normalizeSessionMessages("ses_a", [message]).parts.get("msg_shell:assistant")![0] as ToolPart
      expect(part.state.status).toBe("completed")
      return readExecutionEvidence(part, scope, message)
    }
    expect(run("exited", 0)?.state).toBe("passed")
    expect(run("exited", 0)?.source.messageID).toBe("msg_shell")
    expect(run("exited", 0)?.durationMs).toBeUndefined()
    expect(run("killed")).toBeUndefined()
    expect(run("killed", 0)).toBeUndefined()
    expect(run("timeout")).toBeUndefined()
  })

  test("unknown completeness and nonzero exits beside passing totals keep raw fallback", async () => {
    const output = await fixture("bun-pass")
    expect(readExecutionEvidence(bash({ output, metadata: { exit: 0, truncated: undefined } }), scope)).toBeUndefined()
    expect(readExecutionEvidence(bash({ output, metadata: { exit: 1 } }), scope)).toBeUndefined()
    expect(readExecutionEvidence(bash({ output, metadata: { exit: 0, status: "killed" } }), scope)).toBeUndefined()
    expect(readExecutionEvidence(bash({ output, metadata: { exit: 0, status: "exited" } }), scope)).toBeUndefined()
  })
})

describe("createEvidenceCache", () => {
  test("retains only the bounded parse footprint and invalidates same-length tail or prefix-marker changes", async () => {
    const cache = createEvidenceCache(1)
    const output = "x".repeat(EVIDENCE_CACHE_ENTRY_LIMIT * 2) + "\n" + (await fixture("bun-pass"))
    const first = cache.read(bash({ output, metadata: { exit: 0 } }), scope)
    expect(first?.state).toBe("passed")
    expect(cache.size).toBe(1)
    expect(cache.retainedCharacters).toBeLessThan(SUMMARY_WINDOW * 2)
    // Same parsed footprint: a changed discarded prefix cannot change the summary.
    expect(cache.read(bash({ output: "y" + output.slice(1), metadata: { exit: 0 } }), scope)).toBe(first!)
    const changed = output.replace(" 2 pass", " 3 pass").replace("Ran 2 tests", "Ran 3 tests")
    expect(changed.length).toBe(output.length)
    const next = cache.read(bash({ output: changed, metadata: { exit: 0 } }), scope)
    expect(next).not.toBe(first!)
    expect(next?.summary?.tests.counts.passed).toBe(3)
    const prefix = "...output truncated..."
    expect(
      cache.read(bash({ output: prefix + changed.slice(prefix.length), metadata: { exit: 0 } }), scope)?.state,
    ).toBe("partial")
    cache.read(bash({ id: "prt_other", output: await fixture("bun-pass"), metadata: { exit: 0 } }), scope)
    expect(cache.size).toBe(1)
    expect(cache.retainedCharacters).toBeLessThan(SUMMARY_WINDOW)
    expect(cache.read(bash({ output, metadata: { exit: 0 } }), scope)).not.toBe(first!)
    cache.clear()
    expect(cache.retainedCharacters).toBe(0)
  })

  test("raw-shell authority controls cache invalidation without retaining normalized output", async () => {
    const cache = createEvidenceCache()
    const output = "x".repeat(EVIDENCE_CACHE_ENTRY_LIMIT * 2) + "\n" + (await fixture("bun-pass"))
    const message = {
      id: "msg_shell",
      type: "shell",
      shellID: "shl_1",
      command: "bun test",
      status: "exited",
      exit: 0,
      output: { output, cursor: 0, size: output.length, truncated: false },
      time: { created: 10, completed: 20 },
    } satisfies SessionMessageInfo
    const part = normalizeSessionMessages("ses_a", [message]).parts.get("msg_shell:assistant")![0] as ToolPart
    if (part.state.status !== "completed") throw new Error("Expected completed fixture")
    const first = cache.read(part, scope, message)
    part.state.output = "discarded normalized output".repeat(SUMMARY_WINDOW)
    expect(cache.read(part, scope, message)).toBe(first!)
    expect(cache.retainedCharacters).toBeLessThan(SUMMARY_WINDOW * 2)
    const failed = { ...message, exit: 1, output: { ...message.output, output: await fixture("bun-fail") } }
    expect(cache.read(part, scope, failed)?.state).toBe("failed")
    expect(cache.read(part, scope, { ...message, status: "killed" })).toBeUndefined()
    expect(cache.read(part, scope, { ...message, output: { ...message.output, truncated: true } })?.state).toBe(
      "partial",
    )
  })

  test("tracks output extent, eligibility and metadata even with a stable footer", async () => {
    const cache = createEvidenceCache()
    const output = await fixture("go-pass")
    const part = bash({ command: "go test ./...", output, metadata: { exit: 0 } })
    expect(cache.read(part, scope)?.state).toBe("passed")
    if (part.state.status !== "completed") throw new Error("Expected completed fixture")
    part.state.output = "x".repeat(SUMMARY_WINDOW) + "\n" + output
    expect(cache.read(part, scope)).toBeUndefined()
    part.state.output = output
    expect(cache.read(part, scope)?.state).toBe("passed")
    part.state.metadata.exit = undefined
    expect(cache.read(part, scope)?.state).toBe("unconfirmed")
    part.state.metadata.truncated = undefined
    expect(cache.read(part, scope)).toBeUndefined()
    part.state.metadata.truncated = false
    part.state.input.workdir = { invalid: output }
    expect(cache.read(part, scope)).toBeUndefined()
    delete part.state.input.workdir
    expect(cache.read(part, scope)?.state).toBe("unconfirmed")
    cache.read(bash({ status: "running" }), scope)
    expect(cache.size).toBe(0)
    expect(cache.retainedCharacters).toBe(0)
  })

  test("oversized opaque revisions bypass caching without truncating their identity", async () => {
    const cache = createEvidenceCache()
    const output = await fixture("bun-pass")
    expect(cache.read(bash({ output, metadata: { exit: 0 } }), scope)?.state).toBe("passed")
    expect(cache.size).toBe(1)
    // Escaping is part of the serialized budget even when each input string fits.
    const workdir = "\0".repeat(SUMMARY_WINDOW)
    expect(cache.read(bash({ output, workdir, metadata: { exit: 0 } }), scope)?.source.workdir).toBe(workdir)
    expect(cache.size).toBe(0)
    expect(cache.retainedCharacters).toBe(0)
  })

  test("parses once per revision and re-parses when the output changes", async () => {
    const cache = createEvidenceCache()
    const part = bash({ output: await fixture("bun-pass"), metadata: { exit: 0 } })
    const first = cache.read(part, scope)
    expect(cache.read({ ...part, state: { ...part.state } }, scope)).toBe(first!)
    const changed = bash({ output: await fixture("bun-fail"), metadata: { exit: 1 } })
    const second = cache.read(changed, scope)
    expect(second).not.toBe(first!)
    expect(second?.state).toBe("failed")
    expect(cache.read(changed, { ...scope, scope: "server-b" })).not.toBe(second!)
  })

  test("keeps at most the configured number of executions and releases on clear", async () => {
    const cache = createEvidenceCache()
    const output = await fixture("bun-pass")
    for (let index = 0; index < EVIDENCE_CACHE_LIMIT + 8; index++)
      cache.read(bash({ id: `prt_${index}`, output, metadata: { exit: 0 } }), scope)
    expect(cache.size).toBe(EVIDENCE_CACHE_LIMIT)
    expect(cache.retainedCharacters).toBeLessThanOrEqual(EVIDENCE_CACHE_LIMIT * EVIDENCE_CACHE_ENTRY_LIMIT)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})

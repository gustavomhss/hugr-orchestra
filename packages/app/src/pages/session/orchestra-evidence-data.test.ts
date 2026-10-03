import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { normalizeSessionMessages } from "@/utils/session-message"
import { createEvidenceCache, EVIDENCE_CACHE_LIMIT, readExecutionEvidence } from "./orchestra-evidence-data"

const scope = { scope: "server-a", directory: "/repo" }
const fixture = (name: string) => Bun.file(new URL(`./orchestra-evidence-fixtures/${name}.txt`, import.meta.url)).text()

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
          metadata: input.metadata ?? {},
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
      return readExecutionEvidence(part, scope)
    }
    expect(run("exited", 0)?.state).toBe("passed")
    expect(run("exited", 0)?.source.messageID).toBe("msg_shell:assistant")
    expect(run("killed")).toBeUndefined()
    expect(run("timeout")).toBeUndefined()
  })
})

describe("createEvidenceCache", () => {
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
    cache.clear()
    expect(cache.size).toBe(0)
  })
})

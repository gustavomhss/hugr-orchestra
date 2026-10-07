import { describe, expect, test } from "bun:test"
import type { SessionProcess } from "@opencode-ai/sdk/v2/client"
import { createProcessStops, descendants, sortProcesses, tailLines } from "./processes-data"

function item(id: string, started: number, pids = [100, 101]): SessionProcess {
  return {
    id,
    pid: pids[0],
    title: `npm run ${id}`,
    started,
    processes: pids.map((pid, index) => ({ pid, ...(index === 0 ? {} : { parentPid: pids[0] }) })),
    output: "",
    written: 0,
  }
}

describe("processes data", () => {
  test("tailLines keeps the last lines, normalizes CRLF and drops the trailing newline", () => {
    expect(tailLines("a\r\nb\nc\n", 2)).toBe("b\nc")
    expect(tailLines("only", 5)).toBe("only")
    expect(tailLines("", 3)).toBe("")
    expect(tailLines(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n")).split("\n")).toHaveLength(12)
  })

  test("descendants leaves out the root the row already names", () => {
    expect(descendants(item("dev", 1, [7, 8, 9])).map((node) => node.pid)).toEqual([8, 9])
  })

  test("sortProcesses is oldest first and stable on equal start times", () => {
    expect(sortProcesses([item("b", 2), item("c", 1), item("a", 2)]).map((entry) => entry.id)).toEqual(["c", "a", "b"])
  })

  test("a stop stays pending while in flight, clears on success and fails visibly, once per click", async () => {
    const calls: string[] = []
    let settle: { resolve: () => void; reject: () => void } | undefined
    const stops = createProcessStops(
      (id) =>
        new Promise<void>((resolve, reject) => {
          calls.push(id)
          settle = { resolve, reject }
        }),
    )
    stops.stop("job_1")
    stops.stop("job_1")
    expect(calls).toEqual(["job_1"])
    expect(stops.state("job_1")).toBe("pending")
    settle?.reject()
    await Promise.resolve()
    await Promise.resolve()
    expect(stops.state("job_1")).toBe("failed")
    stops.stop("job_1")
    settle?.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(stops.state("job_1")).toBeUndefined()
    expect(calls).toEqual(["job_1", "job_1"])
  })
})

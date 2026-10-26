import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { transportLog } from "./live-transport-log"

test("transport log writes ordered JSON lines per meeting", async () => {
  const log = transportLog(join(await mkdtemp(join(tmpdir(), "live-log-")), "logs"), "meeting-1")
  log.write({ event: "open", attempt: 0, replayFromMs: 0 })
  log.write({ event: "segment", track: "them", startMs: 0, endMs: 900, latencyMs: 350 })
  await log.flush()
  const lines = (await Bun.file(log.file).text()).trim().split("\n").map((line) => JSON.parse(line))
  expect(log.file.endsWith("meeting-1.jsonl")).toBe(true)
  expect(lines.map((line) => line.event)).toEqual(["open", "segment"])
  expect(typeof lines[0].at).toBe("number")
})

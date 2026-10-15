import { describe, expect, test } from "bun:test"
import {
  diskSeverity,
  idleMinutes,
  parseDfLine,
  parsePsLine,
  parseWindowsDiskJson,
  parseWindowsPortJson,
  parseWindowsProcessJson,
  isUsefulMount,
  isUsefulProcess,
  scannerUnavailable,
  severityRank,
  summarize,
} from "./scan"

describe("janitor scan parsers", () => {
  test("parses df usage and ranks severity", () => {
    const parsed = parseDfLine("/dev/disk3 100 85 15 85% /")
    expect(parsed).toEqual({ mount: "/", use: 0.85 })
    expect(diskSeverity(0.85)).toBe("attention")
    expect(diskSeverity(0.95)).toBe("urgent")
    expect(diskSeverity(0.2)).toBe("ok")
    expect(parseDfLine("junk")).toBeUndefined()
  })

  test("parses ps lines and idle time", () => {
    expect(parsePsLine("123 01:30:00 95.0 bun")).toEqual({ pid: 123, etime: "01:30:00", pcpu: 95, comm: "bun" })
    expect(idleMinutes("01:30:00")).toBe(90)
    expect(idleMinutes("05:00")).toBe(5)
    expect(idleMinutes("2-03:04:05")).toBe(3064.0833333333335)
    expect(parsePsLine("junk")).toBeUndefined()
  })

  test("sorts urgent reports first", () => {
    const report = summarize([
      { kind: "disk", severity: "attention", summary: "b", evidence: "e", suggestion: "s" },
      { kind: "process", severity: "urgent", summary: "a", evidence: "e", suggestion: "s" },
    ])
    expect(report.findings.map((item) => item.severity)).toEqual(["urgent", "attention"])
    expect(severityRank("ok")).toBe(0)
  })

  test("reports unavailable platform scanners instead of clean", () => {
    expect(scannerUnavailable("ps")).toMatchObject({
      kind: "scanner",
      severity: "attention",
    })
  })

  test("parses Windows disk, process, and port scanner output", () => {
    expect(parseWindowsDiskJson('{"DeviceID":"C:","Size":100,"FreeSpace":10}')).toEqual([{ mount: "C:", use: 0.9 }])
    expect(
      parseWindowsProcessJson(
        '{"Id":42,"Name":"bun","CPU":600,"StartTime":"2026-09-09T00:00:00.000Z"}',
        Date.parse("2026-09-09T01:00:00.000Z"),
      ),
    ).toEqual([expect.objectContaining({ pid: 42, comm: "bun", ageMinutes: 60, pcpu: 16.666666666666664 })])
    expect(parseWindowsPortJson('{"LocalAddress":"0.0.0.0","LocalPort":3000,"OwningProcess":42}')).toEqual([
      { address: "0.0.0.0", port: 3000, pid: 42, evidence: expect.any(String) },
    ])
  })

  test("drops virtual mounts and system daemons from user findings", () => {
    expect(isUsefulMount("/dev")).toBe(false)
    expect(isUsefulMount("/System/Volumes/Data")).toBe(true)
    expect(isUsefulProcess("/System/Library/CoreServices/powerd.bundle/powerd")).toBe(false)
    expect(isUsefulProcess("./externals/node20/bin/node")).toBe(true)
  })
})

import { describe, expect, test } from "bun:test"
import { ago, checkParams, duration, liveRuns, runHandle } from "./format"
import { layerBase, parseRelayRoute, relayPath } from "./route"

describe("routes", () => {
  test("library views", () => {
    expect(parseRelayRoute("workflow", "")).toEqual({ page: "library", kind: "workflow", tab: "list", create: false })
    expect(parseRelayRoute("workflow", "/executions")).toEqual({
      page: "library",
      kind: "workflow",
      tab: "runs",
      create: false,
    })
    expect(parseRelayRoute("hook", "/activity")).toEqual({ page: "library", kind: "hook", tab: "runs", create: false })
    expect(parseRelayRoute("hook", "/new")).toEqual({ page: "library", kind: "hook", tab: "list", create: true })
  })

  test("every editor layer has its own URL and parses back to it", () => {
    const cases = [
      relayPath.editor("workflow", "wp-execute"),
      relayPath.add("workflow", "wp-execute"),
      relayPath.node("workflow", "wp-execute", "gate.gate"),
      relayPath.node("workflow", "wp-execute", "gate.gate", "1042"),
      relayPath.view("wp-execute", "1042"),
      relayPath.history("workflow", "wp-execute"),
      relayPath.history("workflow", "wp-execute", "1042"),
      relayPath.history("hook", "protect"),
    ]
    expect(
      cases.map((path) =>
        parseRelayRoute(
          path.includes("/hooks/") ? "hook" : "workflow",
          path.replace(/^\/orchestra\/(workflows|hooks)/, ""),
        ),
      ),
    ).toEqual([
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "editor", add: false },
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "editor", add: true },
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "editor", add: false, node: "gate.gate" },
      {
        page: "editor",
        kind: "workflow",
        id: "wp-execute",
        tab: "editor",
        add: false,
        view: "1042",
        node: "gate.gate",
      },
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "editor", add: false, view: "1042" },
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "runs", add: false },
      { page: "editor", kind: "workflow", id: "wp-execute", tab: "runs", add: false, run: "1042" },
      { page: "editor", kind: "hook", id: "protect", tab: "runs", add: false },
    ])
  })

  test("IDs are encoded and decoded, and a layer closes back to the canvas it sits on", () => {
    expect(relayPath.node("workflow", "a b", "x/y")).toBe("/orchestra/workflows/a%20b/node/x%2Fy")
    const route = parseRelayRoute("workflow", "/a%20b/run/7/node/x%2Fy")
    expect(route).toMatchObject({ id: "a b", view: "7", node: "x/y" })
    if (route.page === "editor") expect(layerBase(route)).toBe("/orchestra/workflows/a%20b/run/7")
    expect(parseRelayRoute("hook", "/h/run/7").page).toBe("editor")
    expect(parseRelayRoute("hook", "/h/run/7")).not.toHaveProperty("view")
  })
})

describe("format", () => {
  test("relative times and durations read like the approved mock", () => {
    const now = 10 * 24 * 60 * 60_000
    expect(ago(now - 20_000, now)).toEqual({ key: "now", count: 0 })
    expect(ago(now - 26 * 60_000, now)).toEqual({ key: "minutes", count: 26 })
    expect(ago(now - 22 * 60 * 60_000, now)).toEqual({ key: "hours", count: 22 })
    expect(ago(now - 30 * 60 * 60_000, now)).toEqual({ key: "yesterday", count: 1 })
    expect(ago(now - 3 * 24 * 60 * 60_000, now)).toEqual({ key: "days", count: 3 })
    expect([duration(4_000), duration(185_000), duration(72 * 60_000)]).toEqual(["4s", "3m 05s", "1h 12m"])
  })

  test("live runs list the ones waiting for a human first", () => {
    const run = (runID: string, status: "parked" | "running" | "completed", startedAt: number) => ({
      runID,
      documentID: "d",
      version: 1,
      status,
      position: undefined,
      failing: [],
      reason: undefined,
      label: undefined,
      agent: undefined,
      baseRef: undefined,
      startedAt,
      endedAt: undefined,
      steps: [],
    })
    expect(
      liveRuns([run("1", "running", 5), run("2", "completed", 9), run("3", "parked", 1), run("4", "running", 7)]).map(
        (item) => item.runID,
      ),
    ).toEqual(["3", "4", "1"])
  })

  test("check parameters come from ${name} references, once each", () => {
    expect(checkParams(["${test_cmd}", "test -s ${wp_dir}/a && ${test_cmd}", "echo $HOME ${1bad}"])).toEqual([
      "test_cmd",
      "wp_dir",
    ])
    expect([runHandle("1042"), runHandle("3f1c9a2e-77aa-4a5b-9c1d-000000000000")]).toEqual(["1042", "3f1c9a2e"])
  })
})

import { expect, test } from "bun:test"
import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityApply } from "@orchestra/schema/activity-apply"
import type { Platform } from "@/context/platform"
import type { ServerConnection } from "@/context/server"
import { mount, receipt, snapshot, target, until } from "./activity-plan-fixture"

const text = (element: Element) => element.textContent?.trim() ?? ""

function button(app: Awaited<ReturnType<typeof mount>>, label: string) {
  const found = [...app.panel().querySelectorAll<HTMLButtonElement>("button")].find((item) => text(item) === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}

test("IN/OUT reads on entry and distinguishes a complete empty ledger from unread", async () => {
  const app = await mount()
  try {
    await until("plan read starts on entry", () => app.calls.length === 1)
    expect(app.calls[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(text(app.panel())).toContain("Reading the IN/OUT ledger")
    expect(text(app.panel())).not.toContain("has no entries")
    app.calls[0]!.respond({ ready: [], approvals: [], partial: false })
    await until("complete empty ledger is shown", () => text(app.panel()).includes("complete IN/OUT ledger has no entries"))
    expect(text(app.panel())).toContain("Ready: 0 · Armed: 0 · Refused: 0")
    expect(app.panel().querySelector("tbody")).toBeNull()
    expect(app.panel().querySelectorAll("button").length).toBe(1)
  } finally {
    app.dispose()
  }
})

test("partial and failed reads stay explicit and a same-scope failure retains the prior projection", async () => {
  const app = await mount({
    connection: { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4777" } },
    platform: {
      platform: "desktop",
      os: "linux",
      async openDirectoryPickerDialog() { return null },
    } as unknown as Platform,
  })
  try {
    await until("initial plan read", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot({ partial: true }))
    await until("partial plan row", () => text(app.panel()).includes("ready-a"))
    expect(text(app.panel())).toContain("reading is partial")
    expect(text(app.panel())).not.toContain("Ready: 1")
    expect([...app.panel().querySelectorAll("button")].map(text)).not.toContain("Arm quarantine…")

    button(app, "Refresh").click()
    await until("same-scope refresh starts", () => app.calls.length === 2)
    app.calls[1]!.fail(new Error("ledger unavailable"))
    await until("read failure appears", () => text(app.panel()).includes("could not be read"))
    expect(text(app.panel())).toContain("ready-a")
    expect([...app.panel().querySelectorAll("button")].map(text)).not.toContain("Arm quarantine…")
  } finally {
    app.dispose()
  }
})

test("filter miss is distinct from an empty or unavailable ledger", async () => {
  const app = await mount()
  try {
    await until("initial plan read", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot())
    await until("plan row", () => text(app.panel()).includes("ready-a"))
    app.filter("not-present")
    await until("filter miss appears", () => text(app.panel()).includes("No row matches this filter"))
    expect(text(app.panel())).not.toContain("has no entries")
    expect(text(app.panel())).not.toContain("could not be read")
  } finally {
    app.dispose()
  }
})

test("a web server displays Ready rows without an arm control", async () => {
  const app = await mount()
  try {
    await until("initial plan read", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot())
    await until("ready target appears", () => text(app.panel()).includes("ready-a"))
    expect([...app.panel().querySelectorAll("button")].map(text)).not.toContain("Arm quarantine…")
    expect(app.arms).toEqual([])
  } finally {
    app.dispose()
  }
})

test("apply uses only the cached ledger state, waits for a signed result, and replays Unknown", async () => {
  const ready = target("ready-a")
  const approval = { approvalID: "approval-1", targetID: ready.targetID, generation: ready.generation }
  const states: ActivityApply.State[] = [
    { available: true, partial: false, eligible: [approval], results: [] },
    { available: true, partial: false, eligible: [], results: [{ ...approval, outcome: "Unknown" }] },
    { available: true, partial: false, eligible: [], results: [{ ...approval, outcome: "Unknown" }] },
  ]
  let applyResult: ((value: ActivityApply.Receipt | undefined) => void) | undefined
  let stateIndex = 0
  const app = await mount({
    connection: { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4777" } },
    platform: { platform: "desktop", os: "linux", async openDirectoryPickerDialog() { return null } } as unknown as Platform,
    applyState: async () => states[stateIndex++]!,
    apply: () => new Promise((resolve) => { applyResult = resolve }),
  })
  try {
    await until("cached public plan GET and apply state read", () => app.calls.length === 1 && app.applyStates.length === 1)
    app.calls[0]!.respond(snapshot({ ready: [], approvals: [{ receipt: { ...receipt(ready), approvalID: approval.approvalID }, changed: false }] }))
    await until("eligible Apply control", () => [...app.panel().querySelectorAll("button")].some((item) => text(item) === "Apply…"))
    expect(app.inspections).toHaveLength(0)
    button(app, "Apply…").click()
    await until("native Apply call is pending", () => app.applies.length === 1)
    expect(app.applies).toEqual([{ serverURL: "http://127.0.0.1:4777", request: approval }])
    expect(app.panel().querySelector("tbody")?.textContent).toContain("Armed")
    expect(app.panel().querySelector("tbody")?.textContent).not.toContain("Out")
    applyResult!({ previewID: "preview-1", ...approval, outcome: "Unknown" })
    await until("signed persisted Unknown appears", () => text(app.panel()).includes("Unknown: 1"))
    button(app, "Refresh").click()
    await until("cached plan reload plus persisted state replay", () => app.calls.length === 2 && app.applyStates.length === 3)
    app.calls[1]!.respond(snapshot({ ready: [], approvals: [{ receipt: { ...receipt(ready), approvalID: approval.approvalID }, changed: true }] }))
    await until("replayed Unknown remains visible", () => app.panel().querySelector("tbody")?.textContent?.includes("Unknown") === true)
    expect(app.inspections).toHaveLength(0)
  } finally {
    app.dispose()
  }
})

test("only a Ready target on the desktop base sidecar reaches the native arm bridge", async () => {
  const server: ServerConnection.Any = { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4777" } }
  const platform = {
    platform: "desktop",
    os: "linux",
    async openDirectoryPickerDialog() { return null },
  } as unknown as Platform
  const approved = target("ready-a")
  let nativeCalls = 0
  const app = await mount({
    connection: server,
    platform,
    arm: async () => {
      nativeCalls++
      return receipt(approved)
    },
  })
  try {
    await until("initial plan read", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot({ ready: [approved] }))
    await until("eligible target appears", () => text(app.panel()).includes("ready-a"))
    button(app, "Verify objects").click()
    await until("signed verification is requested separately", () => app.inspections.length === 1)
    expect(app.calls.length).toBe(1)
    app.inspections[0]!.respond(snapshot({ ready: [approved] }))
    await until("verified target becomes armable", () => text(app.panel()).includes("Verified objects"))
    const armButton = button(app, "Arm quarantine…")
    expect(armButton.classList.contains("primary")).toBe(false)
    armButton.click()
    await until("native bridge is called", () => nativeCalls === 1)
    expect(nativeCalls).toBe(1)
    expect(app.arms).toEqual([{
      serverURL: "http://127.0.0.1:4777",
      request: { targets: [{ targetID: "ready-a", generation: "1" }] },
    }])
    await until("receipt triggers a fresh projection", () => app.calls.length === 2)
    const refused = target("ready-a", { owner: "recorded session" })
    app.calls[1]!.respond(snapshot({ ready: [], approvals: [{ receipt: receipt(refused), changed: true }] }))
    await until("changed receipt is shown as refused", () => text(app.panel()).includes("Refused"))
    expect(text(app.panel())).toContain("recorded session")
    expect([...app.panel().querySelectorAll("button")].map(text)).not.toContain("Confirm")
  } finally {
    app.dispose()
  }
})

test("live verification is explicit and stale results from a previous server are discarded", async () => {
  const app = await mount({
    connection: { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4777" } },
    platform: { platform: "desktop", os: "linux", async openDirectoryPickerDialog() { return null } } as unknown as Platform,
  })
  try {
    await until("ledger read starts on entry", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot({ ready: [target("ledger-only")] }))
    await until("ledger target appears", () => text(app.panel()).includes("ledger-only"))
    expect(app.inspections).toHaveLength(0)
    button(app, "Verify objects").click()
    await until("explicit verification starts", () => app.inspections.length === 1)
    expect(app.calls).toHaveLength(1)
    app.switchServer("verification-second")
    await until("new ledger scope starts", () => app.calls.length === 2)
    app.inspections[0]!.respond(snapshot({ ready: [target("stale-verified")] }))
    app.calls[1]!.respond(snapshot({ ready: [target("new-ledger")] }))
    await until("new ledger appears", () => text(app.panel()).includes("new-ledger"))
    expect(text(app.panel())).not.toContain("stale-verified")
  } finally {
    app.dispose()
  }
})

test("a delayed Arm completion cannot refresh or clear a newer Arm after revisiting the same server", async () => {
  const connection: ServerConnection.Any = { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4777" } }
  const approvals = Array.from({ length: 2 }, () => Promise.withResolvers<ActivityArm.Receipt>())
  let nextApproval = 0
  const app = await mount({
    connection,
    platform: { platform: "desktop", os: "linux", async openDirectoryPickerDialog() { return null } } as unknown as Platform,
    arm: () => approvals[nextApproval++]!.promise,
  })
  const beginArm = async (verified: ActivityArm.Target, count: number) => {
    await until("ledger arrives", () => !button(app, "Verify objects").disabled)
    button(app, "Verify objects").click()
    await until("verification starts", () => app.inspections.length === count)
    app.inspections[count - 1]!.respond(snapshot({ ready: [verified] }))
    await until("verification arrives", () => text(app.panel()).includes("Verified objects"))
    button(app, "Arm quarantine…").click()
    await until("Arm starts", () => app.arms.length === count)
  }
  try {
    const first = target("cache")
    await until("initial ledger starts", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot({ ready: [first] }))
    await beginArm(first, 1)

    app.switchServer("other")
    await until("other ledger starts", () => app.calls.length === 2)
    app.switchServer(connection)
    await until("revisited ledger starts", () => app.calls.length === 3)
    const second = target("cache", { generation: "2" })
    app.calls[2]!.respond(snapshot({ ready: [second] }))
    await beginArm(second, 2)

    approvals[0]!.resolve(receipt(first))
    await Bun.sleep(0)
    expect(app.calls).toHaveLength(3)
    expect(button(app, "Verify objects").disabled).toBe(true)

    approvals[1]!.resolve(receipt(second))
    await until("current Arm refreshes the ledger", () => app.calls.length === 4)
    app.calls[3]!.respond(snapshot({ ready: [], approvals: [{ changed: false, receipt: receipt(second) }] }))
    await until("current receipt appears", () => text(app.panel()).includes("Armed: 1"))
  } finally {
    app.dispose()
  }
})

test("a server-scope change aborts the old read and hides its rows", async () => {
  const app = await mount()
  try {
    await until("first scope read", () => app.calls.length === 1)
    app.calls[0]!.respond(snapshot({ ready: [target("old-scope")] }))
    await until("first scope row", () => text(app.panel()).includes("old-scope"))
    button(app, "Refresh").click()
    await until("pending first scope refresh", () => app.calls.length === 2)
    app.switchServer("plan-second")
    await until("replacement scope read", () => app.calls.length === 3)
    expect(app.calls[1]?.signal?.aborted).toBe(true)
    expect(text(app.panel())).not.toContain("old-scope")
    app.calls[1]!.respond(snapshot({ ready: [target("stale-row")] }))
    app.calls[2]!.respond(snapshot({ ready: [target("new-scope")] }))
    await until("new scope row", () => text(app.panel()).includes("new-scope"))
    expect(text(app.panel())).not.toContain("stale-row")
  } finally {
    app.dispose()
  }
})

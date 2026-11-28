import { expect, test } from "bun:test"
import type { ServerConnection } from "@/context/server"
import { mount, receipt, snapshot, until } from "./activity-quarantine-fixture"

const text = (element: Element) => element.textContent?.trim() ?? ""

test("Quarantine refresh and filter only read inventory; explicit empty uses URL only, shows receipt and reloads", async () => {
  const app = await mount({ empty: async () => receipt() })
  try {
    await until("initial quarantine inventory read", () => app.reads.length === 1)
    expect(app.reads[0]?.serverURL).toBe("http://127.0.0.1:4777")
    app.reads[0]!.respond(snapshot())
    await until("both registered entries appear", () => text(app.panel()).includes("/original/b"))
    expect(text(app.panel())).toContain("Owner A")
    expect(text(app.panel())).toContain("Owner B")

    app.button("Refresh").click()
    await until("manual inventory refresh", () => app.reads.length === 2)
    expect(app.reads[1]?.serverURL).toBe("http://127.0.0.1:4777")
    app.reads[1]!.respond(snapshot())
    await until("refreshed inventory is displayed", () => text(app.panel()).includes("Registered entries: 2"))

    app.filter("Owner A")
    await until("filter hides the second entry", () => !text(app.panel()).includes("/original/b"))
    expect(app.reads).toHaveLength(2)
    expect(app.button("Empty quarantine…").disabled).toBe(false)

    app.button("Empty quarantine…").click()
    await until("one explicit native bridge call", () => app.empties.length === 1)
    expect(app.empties).toEqual(["http://127.0.0.1:4777"])
    await until("post-action inventory reload starts", () => app.reads.length === 3)
    app.reads[2]!.respond({ rows: [], canEmpty: false, partial: false })
    await until("verified receipt and refreshed empty state appear", () =>
      text(app.panel()).includes("Emptying verified for 2 entries") && text(app.panel()).includes("No registered quarantine entries."),
    )
    const details = app.panel().querySelector<HTMLDetailsElement>("details")
    if (details) details.open = true
    expect(text(app.panel())).toContain("11111111-1111-1111-1111-111111111111")
    expect(text(app.panel())).toContain("entry-a")
    expect(text(app.panel())).toContain("Generation 1")
    expect(text(app.panel())).not.toContain("/original/b")
    expect(app.button("Empty quarantine…").disabled).toBe(true)
  } finally {
    app.dispose()
  }
})

test("an unavailable server shows an explicit state and performs no inventory read", async () => {
  const connection: ServerConnection.Any = { type: "http", http: { url: "http://remote.test" } }
  const app = await mount({ connection })
  try {
    await until("unavailable server state appears", () => text(app.panel()).includes("owned local server is unavailable"))
    expect(app.reads).toEqual([])
    expect(app.button("Refresh").disabled).toBe(true)
    expect(app.button("Empty quarantine…").disabled).toBe(true)
  } finally {
    app.dispose()
  }
})

import { expect, test } from "bun:test"
import { Seats } from "@orchestra/maestro/seats"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ProductHost } from "../src/host"
import { productHost } from "./fixture/product-host"

// K1: the product's V2 server composes every module contribution, and the composed Location graph boots with
// the Maestro seats and the Maestro, Atlas, continuity and Dock tools registered.

test("the product composes Maestro, continuity and the Claude Code engine, and the Dock only with a channel", () => {
  const ids = (dock?: Parameters<typeof ProductHost.contributions>[0]) => ProductHost.contributions(dock).map((item) => item.id)
  expect(ids()).toEqual(["maestro", "continuity", "engine-claude-code"])
  expect(ids({ postMessage: () => {}, on: () => {} })).toEqual(["maestro", "continuity", "engine-claude-code", "app-dock"])
})

test("the composed host boots a Location with the seats and the module tools", async () => {
  const host = await productHost()
  expect(host.seats).toEqual(Object.keys(Seats.all))
  expect(host.seats).toContain("backend")
  expect(host.tools).toEqual(
    expect.arrayContaining([
      "maestro_record_admission",
      "maestro_present_approval",
      "maestro_record_approval",
      "maestro_grant_authorization",
      "maestro_record_plan_revision",
      "maestro_request_review",
      "maestro_workflows",
      ...Object.values(MaestroArsenal.names),
      "atlas_context",
      "context_recall",
      "dock_list",
      "lean_recall",
    ]),
  )
}, 60_000)

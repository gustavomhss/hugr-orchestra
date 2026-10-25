import { expect, test } from "bun:test"
import { productHost } from "./fixture/product-host"

// K1: the product's V2 server composes every module contribution, and the composed Location graph boots with
// the Maestro seats and the Maestro, Atlas, continuity and Dock tools registered.

test("the product composes Maestro, continuity and the Claude Code engine, and the Dock only with a channel", async () => {
  const host = await productHost()
  expect(host.ids()).toEqual(["maestro", "continuity", "engine-claude-code"])
  expect(host.ids(host.dock)).toEqual(["maestro", "continuity", "engine-claude-code", "app-dock"])
}, 60_000)

test("the composed host boots a Location with the seats and the module tools", async () => {
  const host = await productHost()
  expect(host.seats).toEqual(host.rosterSeats)
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
      ...host.arsenal,
      "atlas_context",
      "context_recall",
      "dock_list",
      "lean_recall",
    ]),
  )
}, 60_000)

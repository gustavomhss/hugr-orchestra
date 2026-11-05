import { expect, test } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Schema } from "effect"
import { Seats } from "@orchestra/maestro/seats"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroTeamV2 } from "../src/v2/team-source"

// Maestro's team list comes from the agents and the seat catalog: ids address, names are the owner's, unstaffed seats wait.

const agent = (id: string, fields: Partial<AgentV2.Info> = {}) => ({
  ...AgentV2.Info.empty(AgentV2.ID.make(id)),
  mode: "subagent" as const,
  ...fields,
})

test("the team list routes by id, shows the owner's names and areas, and keeps unstaffed and undispatchable agents out", () => {
  const text = MaestroTeamV2.render(
    [
      agent("maestro", { mode: "primary" }),
      agent("live", { mode: "primary" }),
      agent("compaction", { mode: "primary", hidden: true }),
      agent("general", { description: "Multi-step work\nwith write paths." }),
      agent("backend", { name: "Ana\n  Lima" }),
      agent("jimmy"),
      agent("archie"),
      agent("lucy"),
      agent("billy"),
      agent("custom", { description: "A project agent." }),
    ],
    new Map([["backend", ["packages/core", "apps/cli"]]]),
  )
  expect(text.startsWith("<team>\n")).toBe(true)
  expect(text.endsWith("\n</team>")).toBe(true)
  expect(text).toContain(`- \`backend\` (shown as Ana Lima): ${Seats.all.backend.routing} Areas: \`packages/core\`, \`apps/cli\`.`)
  expect(text).toContain(`- \`jimmy\` (shown as jimmy): ${Seats.all.jimmy.routing}`)
  expect(text).toContain("- `general` (shown as general): Multi-step work with write paths.")
  expect(text).toContain("- `custom` (shown as custom): A project agent.")
  expect(text).toContain("Not staffed yet, do not dispatch: `billy`.")
  expect(text).toContain("go to `jimmy`")
  expect(text).toContain("go to `archie`")
  expect(text).toContain("goes to `lucy`")
  expect(text).toContain("or to `general` with `writePaths`")
  for (const id of ["maestro", "live", "compaction"]) expect(text).not.toContain(`\`${id}\``)
  expect(text.indexOf("`archie`")).toBeLessThan(text.indexOf("`backend`"))
})

test("a role whose seat is missing from the Location gets no routing line", () => {
  const text = MaestroTeamV2.render([agent("backend")], new Map())
  expect(text).not.toContain("`jimmy`")
  expect(text).not.toContain("`archie`")
  expect(text).not.toContain("`general`")
  expect(text).toContain("Code in a teammate's areas goes to that teammate")
})

test("areas come from config agents, the later document winning", () => {
  const document = (agents: Record<string, { areas?: string[] }>) =>
    Schema.decodeUnknownSync(Config.Document)({ type: "document", info: { agents } })
  const areas = MaestroTeamV2.areas([
    document({ backend: { areas: ["packages/core"] }, jimmy: { areas: ["docs"] } }),
    document({ backend: { areas: ["apps/cli"] }, archie: {} }),
  ])
  expect([...areas]).toEqual([
    ["backend", ["apps/cli"]],
    ["jimmy", ["docs"]],
  ])
})

test("the team source is one of Maestro's Location nodes", () => {
  expect(MaestroSeatsV2.contribution.locationNodes).toContain(MaestroTeamV2.node)
})

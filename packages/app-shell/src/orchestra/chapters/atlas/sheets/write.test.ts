import { describe, expect, test } from "bun:test"
import type { AtlasTransport } from "../atlas-api"
import { createAtlasController } from "../atlas-controller"
import { atlasFixture } from "../atlas-model.fixture"
import type { AtlasOutput } from "../atlas-types"
import { governed, writeFact } from "./write"

const guidance = { next: "", invariant: "" }
const drafted = {
  state: "ok",
  ok: true,
  data: {
    draft: { fact: { kind: "advisory", tier: "T2", scope: "README.md" }, rev: "rev1", operation: "UPDATE", route: "full-ratify" },
    check: null,
  },
  guidance,
} as unknown as AtlasOutput<"draft">
const emittedOk = { state: "ok", ok: true, data: { emitted: true, nodeKey: "k4" }, guidance } as unknown as AtlasOutput<"emit">

// A transport that answers the two writes and records what they were sent.
function fake(draft: AtlasOutput<"draft">, emit: AtlasOutput<"emit">) {
  const sent: { name: string; input: unknown }[] = []
  const unused = <T>() => Promise.resolve({} as unknown as T)
  const transport: AtlasTransport = {
    snapshot: () => Promise.resolve(atlasFixture()),
    reasoning: () => unused(),
    own: () => unused(),
    health: () => unused(),
    promote: () => unused(),
    link: () => unused(),
    verify: () => unused(),
    review: () => Promise.resolve({ state: "empty" } as unknown as AtlasOutput<"review">),
    hold: () => unused(),
    release: () => unused(),
    propose: () => unused(),
    decide: () => unused(),
    answer: () => unused(),
    memoryDecide: () => unused(),
    territory: () => unused(),
    delegate: () => unused(),
    draft: (input) => {
      sent.push({ name: "draft", input })
      return Promise.resolve(draft)
    },
    emit: (input) => {
      sent.push({ name: "emit", input })
      return Promise.resolve(emit)
    },
  }
  return { sent, transport }
}
async function controllerOf(transport: AtlasTransport) {
  const controller = createAtlasController((error) => ({ message: error instanceof Error ? error.message : "unknown" }))
  await controller.select({ server: "local", directory: "/repo", transport })
  return controller
}

describe("atlas fact write", () => {
  test("drafts, then emits the drafted fact at the target tier and group", async () => {
    const source = fake(drafted, emittedOk)
    const outcome = await writeFact(await controllerOf(source.transport), {
      anchor: "README.md",
      slot: "",
      claim: "The readme explains setup.",
      token: "k",
      tier: "T1",
      scope: "atlas:mined",
    })
    expect(outcome).toEqual({ ok: true })
    expect(source.sent).toEqual([
      { name: "draft", input: { anchor: "README.md", slot: "", claim: "The readme explains setup.", token: "k" } },
      { name: "emit", input: { fact: { kind: "advisory", tier: "T1", scope: "atlas:mined" }, at: "rev1", token: "k" } },
    ])
  })

  test("stops at a refused draft", async () => {
    const refused = { state: "ok", ok: false, rejected: "ungrounded", guidance } as unknown as AtlasOutput<"draft">
    const source = fake(refused, emittedOk)
    const outcome = await writeFact(await controllerOf(source.transport), { anchor: "a", slot: "gotcha", claim: "c", token: "" })
    expect(outcome).toEqual({ ok: false, reason: "ungrounded" })
    expect(source.sent.map((item) => item.name)).toEqual(["draft"])
  })

  test("reports the emit door's refusal", async () => {
    const emitRefused = { state: "ok", ok: true, data: { emitted: false, rejected: "unratified" }, guidance } as unknown as AtlasOutput<"emit">
    const outcome = await writeFact(await controllerOf(fake(drafted, emitRefused).transport), { anchor: "a", slot: "", claim: "c", token: "" })
    expect(outcome).toEqual({ ok: false, reason: "unratified" })
  })

  test("an empty store resolves nothing", async () => {
    const empty = { state: "empty" } as unknown as AtlasOutput<"draft">
    expect(await writeFact(await controllerOf(fake(empty, emittedOk).transport), { anchor: "a", slot: "", claim: "c", token: "" })).toBeUndefined()
  })

  test("patches only objects, and only the fields given", () => {
    expect(governed(null, { tier: "T1" })).toBeNull()
    expect(governed({ tier: "T2", a: 1 }, {})).toEqual({ tier: "T2", a: 1 })
    expect(governed({ tier: "T2", scope: "x" }, { tier: "T0" })).toEqual({ tier: "T0", scope: "x" })
  })
})

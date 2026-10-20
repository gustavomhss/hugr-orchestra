import { describe, expect, test } from "bun:test"
import { type AtlasOwnPack, createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import {
  type AtlasOwner,
  firstPublished,
  lastFolder,
  leafOf,
  otherUnit,
  owners,
  pickOwner,
  SAMPLE_UNIT,
  skillName,
} from "./ownership-data"

const pack: AtlasOwnPack = {
  summary: "B keeps y single.",
  owner: "atlas-foundation",
  tier: "T1",
  invariants: [{ nodeId: "b:single", tier: "T1", claim: "y runs once.", freshness: "FRESH" }],
  advisory: 0,
  dependents: 1,
  tokenEstimate: 40,
  sourceFiles: 1,
}
// The fixture model with a committed Own snapshot that publishes `units` (A15c fills it from OWN-SNAPSHOT.json).
const publishing = (units: string[], packs: Record<string, AtlasOwnPack>) => ({
  ...createAtlasModel(atlasFixture()),
  snapshot: { revision: "1a235323361717d1", units, catalog: false, packs },
})
const plain = (list: AtlasOwner[]) =>
  list.map((owner) => ({
    id: owner.id,
    leaf: owner.leaf,
    files: owner.files,
    rules: owner.rules,
    hints: owner.b.adv.length,
    role: owner.role,
    gov: owner.gov.map((rule) => rule.claim),
    uses: owner.uses,
    usedBy: owner.usedBy,
    people: owner.people,
    state: owner.state,
  }))
const liveA = {
  id: "packages/a",
  leaf: "a",
  files: 1,
  rules: 1,
  hints: 1,
  role: "Writes are atomic.",
  gov: ["Writes are atomic."],
  uses: [],
  usedBy: ["packages/b"],
  people: ["seat:orchestrator"],
  state: "live-drifted" as const,
}
const liveB = {
  id: "packages/b",
  leaf: "b",
  files: 1,
  rules: 1,
  hints: 0,
  role: "Never call y twice.",
  gov: ["Never call y twice."],
  uses: ["packages/a"],
  usedBy: [],
  people: ["seat:orchestrator"],
  state: "live" as const,
}

describe("atlas ownership data", () => {
  test("names a skill after the base64url of the whole unit id", () => {
    expect(skillName("packages/genesis")).toBe("cGFja2FnZXMvZ2VuZXNpcw")
    expect(skillName("src/café")).toBe("c3JjL2NhZsOp")
    expect([skillName("a?>"), skillName("a??"), skillName("x")]).toEqual(["YT8-", "YT8_", "eA"])
    expect(skillName("src/billing")).not.toBe(skillName("crates/billing"))
  })

  test("short names and the colliding sample", () => {
    expect([leafOf("(root)"), leafOf("packages/a"), leafOf("README.md"), lastFolder("src/billing")]).toEqual([
      "root",
      "a",
      "README.md",
      "billing",
    ])
    expect([otherUnit(SAMPLE_UNIT), otherUnit("packages/billing"), otherUnit("billing")]).toEqual([
      "crates/billing",
      "src/billing",
      "src/billing",
    ])
  })

  test("one live owner per unit, without the root", () => {
    expect(plain(owners(createAtlasModel(atlasFixture())))).toEqual([liveA, liveB])
  })

  test("a published owner says what its committed skill says", () => {
    expect(plain(owners(publishing(["packages/b"], { "packages/b": pack })))).toEqual([
      liveA,
      { ...liveB, role: "B keeps y single.", gov: ["y runs once."], state: "published" },
    ])
    expect(plain(owners(publishing(["packages/a"], {})))[0]).toEqual({ ...liveA, state: "published-drifted" })
  })

  test("picks the asked owner, else a committed one, else a published one, else the first", () => {
    const empty = createAtlasModel(atlasFixture()).snapshot
    const live = owners(createAtlasModel(atlasFixture()))
    expect(pickOwner(live, undefined, empty)?.id).toBe("packages/a")
    expect(pickOwner(live, "packages/b", empty)?.id).toBe("packages/b")
    expect(pickOwner(live, "nope", empty)?.id).toBe("packages/a")
    const committed = publishing(["packages/b"], { "packages/b": pack })
    expect(pickOwner(owners(committed), undefined, committed.snapshot)?.id).toBe("packages/b")
    const listed = publishing(["packages/b"], {})
    expect(pickOwner(owners(listed), undefined, listed.snapshot)?.id).toBe("packages/b")
    expect(pickOwner([], undefined, empty)).toBeUndefined()
  })

  test("finds the first published unit with its pack", () => {
    expect(firstPublished(createAtlasModel(atlasFixture()).snapshot)).toBeUndefined()
    expect(firstPublished(publishing(["packages/b"], { "packages/b": pack }).snapshot)).toEqual({ unit: "packages/b", pack })
    expect(firstPublished(publishing(["packages/b"], {}).snapshot)).toBeUndefined()
  })
})

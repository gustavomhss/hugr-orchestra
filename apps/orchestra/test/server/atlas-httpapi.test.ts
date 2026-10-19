import { afterEach, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { Context } from "effect"
import path from "path"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { AtlasPaths } from "../../src/server/routes/instance/httpapi/groups/atlas"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

// The `atlas` group end to end through the real handler stack and the generated boundary bundle: every route's empty
// answer for a project with no `.atlas/`, then the snapshot, the reasoning and the review queue of a store written to
// disk by hand.

const context = Context.empty() as Context.Context<unknown>

function call(route: string, directory: string, options: { query?: Record<string, string>; body?: unknown } = {}) {
  const url = new URL(`http://localhost${route}`)
  Object.entries(options.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
  const post = options.body !== undefined
  return HttpApiApp.webHandler().handler(
    new Request(url, {
      method: post ? "POST" : "GET",
      headers: { "x-orchestra-directory": directory, ...(post ? { "content-type": "application/json" } : {}) },
      ...(post ? { body: JSON.stringify(options.body) } : {}),
    }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const FACT_HASH = "a".repeat(64)
const WHY_HASH = "b".repeat(64)

// One committed source file and one fact `k1`, both promoted (projection) and staged (staging), with its CAS bytes and
// its reasoning. Returns the commit the store was derived at.
async function writeStore(directory: string) {
  await Bun.write(path.join(directory, "src/a.ts"), "export const a = 1\n")
  await $`git add src/a.ts`.cwd(directory).quiet()
  await $`git commit -m add`.cwd(directory).quiet()
  const head = (await $`git rev-parse HEAD`.cwd(directory).quiet().text()).trim()
  const row = {
    nodeKey: "k1",
    family: "advisory",
    contentHash: FACT_HASH,
    claims: ["a claim"],
    primaryAnchor: "src/a.ts",
    tier: "T2",
    scope: "atlas:mined",
    derivedAt: head,
  }
  await Bun.write(
    path.join(directory, ".atlas/projection.json"),
    JSON.stringify({ current: [["k1", row]], cas: [FACT_HASH], builtAt: head, gen: 3 }),
  )
  await Bun.write(
    path.join(directory, ".atlas/staging.json"),
    JSON.stringify({ current: [["k1", { ...row, answerRef: WHY_HASH }]], cas: [], gen: 5 }),
  )
  await Bun.write(
    path.join(directory, `.atlas/cas/aa/${FACT_HASH}`),
    JSON.stringify({
      kind: "advisory",
      authoring: "ADVISORY",
      freshness: "FRESH",
      grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "0123456789abcdef99" } }] },
    }),
  )
  await Bun.write(path.join(directory, `.atlas/cas/bb/${WHY_HASH}`), JSON.stringify("the reasoning text"))
  return head
}

describe("atlas HttpApi", () => {
  test("answers empty on every route for a project with no Atlas store", async () => {
    await using tmp = await tmpdir({ git: true })
    const responses = await Promise.all([
      call(AtlasPaths.snapshot, tmp.path),
      call(AtlasPaths.reasoning.replace(":id", "abc"), tmp.path),
      call(AtlasPaths.own, tmp.path, { query: { scope: "src" } }),
      call(AtlasPaths.health, tmp.path),
      call(AtlasPaths.promote, tmp.path, { body: { nodeKeys: ["k1"] } }),
      call(AtlasPaths.draft, tmp.path, { body: { anchor: "src/a.ts", slot: "invariant", claim: "x" } }),
      call(AtlasPaths.emit, tmp.path, { body: { fact: {}, at: "abc" } }),
      call(AtlasPaths.link, tmp.path, { body: { a: "x", b: "y" } }),
      call(AtlasPaths.verify, tmp.path, { body: { kind: "dependency", target: "x", scope: "src" } }),
      call(AtlasPaths.review, tmp.path),
      call(AtlasPaths.hold, tmp.path, { body: { nodeKey: "k1" } }),
      call(AtlasPaths.release, tmp.path, { body: { nodeKey: "k1" } }),
      call(AtlasPaths.propose, tmp.path, { body: { nodeKey: "k1", toTier: "T1", reason: "r" } }),
      call(AtlasPaths.decide, tmp.path, { body: { proposalId: "p1", verdict: "rejected", reason: "r" } }),
      call(AtlasPaths.answer, tmp.path, { body: { questionId: "q1", answer: "a" } }),
      call(AtlasPaths.memoryDecide, tmp.path, { body: { proposalId: "p1", verdict: "discarded" } }),
      call(AtlasPaths.territory, tmp.path, { body: { name: "t", owner: "o", tier: "T1", globs: ["src/**"] } }),
      call(AtlasPaths.delegate, tmp.path, { body: { questionIds: ["q1"], providerID: "openai", modelID: "gpt-5.2" } }),
    ])
    expect(responses.map((response) => response.status)).toEqual(Array.from({ length: 18 }, () => 200))
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
      Array.from({ length: 18 }, () => ({ state: "empty" })),
    )
  })

  test("serves the snapshot and the reasoning of a store written to disk", async () => {
    await using tmp = await tmpdir({ git: true })
    const head = await writeStore(tmp.path)

    const snapshot = await call(AtlasPaths.snapshot, tmp.path)
    expect(snapshot.status).toBe(200)
    const body = (await snapshot.json()) as { readonly facts: unknown }
    expect(body).toMatchObject({
      state: "ok",
      head: head.slice(0, 8),
      builtAt: head.slice(0, 8),
      gen: 3,
      stagingGen: 5,
      scip: false,
      tracked: { projection: false, cas: 0, staging: false, policy: false, memory: false },
      langs: { ts: 1 },
      children: { ".": ["src"], src: ["a.ts"] },
      candidates: [],
      own: null,
      memory: {},
      orientation: [],
      territories: [],
    })
    expect(body.facts).toEqual([
      {
        key: "k1",
        hash: FACT_HASH,
        claim: "a claim",
        file: "src/a.ts",
        family: "advisory",
        tier: "T2",
        scope: "atlas:mined",
        derivedAt: head.slice(0, 8),
        subtree: "0123456789abcdef",
        obvious: null,
        promoted: true,
        why: "bbbbbbbbbbbb",
        kind: "advisory",
        authoring: "ADVISORY",
        storedFreshness: "FRESH",
        obviousBy: null,
        anchor: { kind: "file", qualifiedPath: "src/a.ts" },
        slot: null,
        seal: null,
        supersededBy: null,
        sameAs: null,
        provenance: null,
      },
    ])

    const reasoning = await call(AtlasPaths.reasoning.replace(":id", "bbbbbbbbbbbb"), tmp.path)
    expect(await reasoning.json()).toEqual({ state: "ok", id: "bbbbbbbbbbbb", text: "the reasoning text" })
  })

  test("holds and releases a staged candidate and reads the review queue", async () => {
    await using tmp = await tmpdir({ git: true })
    await writeStore(tmp.path)

    const before = await call(AtlasPaths.review, tmp.path)
    expect(before.status).toBe(200)
    expect(await before.json()).toMatchObject({ state: "ok", held: [], proposals: [], memoryProposals: [] })

    const hold = await call(AtlasPaths.hold, tmp.path, { body: { nodeKey: "k1" } })
    expect(await hold.json()).toMatchObject({ state: "ok", ok: true, data: { id: expect.any(String) } })
    expect(await (await call(AtlasPaths.review, tmp.path)).json()).toMatchObject({ state: "ok", held: ["k1"] })

    const again = await call(AtlasPaths.hold, tmp.path, { body: { nodeKey: "k1" } })
    expect(await again.json()).toMatchObject({ state: "ok", ok: false })
    const unknown = await call(AtlasPaths.hold, tmp.path, { body: { nodeKey: "nope" } })
    expect(await unknown.json()).toMatchObject({ state: "ok", ok: false })

    const release = await call(AtlasPaths.release, tmp.path, { body: { nodeKey: "k1" } })
    expect(await release.json()).toMatchObject({ state: "ok", ok: true, data: { id: expect.any(String) } })
    expect(await (await call(AtlasPaths.review, tmp.path)).json()).toMatchObject({ state: "ok", held: [] })
  })
})

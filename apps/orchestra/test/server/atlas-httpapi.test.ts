import { afterEach, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { Context } from "effect"
import path from "path"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { AtlasPaths } from "../../src/server/routes/instance/httpapi/groups/atlas"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

// The `atlas` group end to end through the real handler stack and the generated boundary bundle: every route's empty
// answer for a project with no `.atlas/`, then the snapshot and reasoning of a store written to disk by hand.

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

describe("atlas HttpApi", () => {
  test("answers empty on every route for a project with no Atlas store", async () => {
    await using tmp = await tmpdir({ git: true })
    const responses = await Promise.all([
      call(AtlasPaths.snapshot, tmp.path),
      call(AtlasPaths.reasoning.replace(":id", "abc"), tmp.path),
      call(AtlasPaths.own, tmp.path, { query: { scope: "src" } }),
      call(AtlasPaths.health, tmp.path),
      call(AtlasPaths.promote, tmp.path, { body: {} }),
      call(AtlasPaths.draft, tmp.path, { body: { anchor: "src/a.ts", slot: "invariant", claim: "x" } }),
      call(AtlasPaths.emit, tmp.path, { body: { fact: {}, at: "abc" } }),
      call(AtlasPaths.link, tmp.path, { body: { a: "x", b: "y" } }),
      call(AtlasPaths.verify, tmp.path, { body: { kind: "dependency", target: "x", scope: "src" } }),
    ])
    expect(responses.map((response) => response.status)).toEqual(Array.from({ length: 9 }, () => 200))
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
      Array.from({ length: 9 }, () => ({ state: "empty" })),
    )
  })

  test("serves the snapshot and the reasoning of a store written to disk", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "src/a.ts"), "export const a = 1\n")
    await $`git add src/a.ts`.cwd(tmp.path).quiet()
    await $`git commit -m add`.cwd(tmp.path).quiet()
    const head = (await $`git rev-parse HEAD`.cwd(tmp.path).quiet().text()).trim()
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
      path.join(tmp.path, ".atlas/projection.json"),
      JSON.stringify({ current: [["k1", row]], cas: [FACT_HASH], builtAt: head, gen: 3 }),
    )
    await Bun.write(
      path.join(tmp.path, ".atlas/staging.json"),
      JSON.stringify({ current: [["k1", { ...row, answerRef: WHY_HASH }]], cas: [], gen: 5 }),
    )
    await Bun.write(
      path.join(tmp.path, `.atlas/cas/aa/${FACT_HASH}`),
      JSON.stringify({
        kind: "advisory",
        authoring: "ADVISORY",
        freshness: "FRESH",
        grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "0123456789abcdef99" } }] },
      }),
    )
    await Bun.write(path.join(tmp.path, `.atlas/cas/bb/${WHY_HASH}`), JSON.stringify("the reasoning text"))

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
})

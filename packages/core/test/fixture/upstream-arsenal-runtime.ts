import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Effect, Schema } from "effect"
import { Arsenal } from "@orchestra/maestro-arsenal"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"

const mode = process.env.ORCHESTRA_UPSTREAM_DRIFT
const boundary = process.env.ORCHESTRA_UPSTREAM_BOUNDARY
const directory = process.env.ORCHESTRA_UPSTREAM_SNAPSHOT
const marker = process.env.ORCHESTRA_UPSTREAM_OPERATION_MARKER
if (!directory || !marker) throw new Error("UPSTREAM_DRIFT_FIXTURE_PLACEMENT_MISSING")
if (mode !== "missing" && mode !== "nonpure") throw new Error("UPSTREAM_DRIFT_FIXTURE_MODE_INVALID")
if (boundary !== "catalog" && boundary !== "describe" && boundary !== "execute")
  throw new Error("UPSTREAM_DRIFT_FIXTURE_BOUNDARY_INVALID")

test(`actual ${boundary} rejects ${mode} registry drift before backend entry`, async () => {
  const context = { sessionID: "ses_upstream_drift", agent: "walt" }
  const host = {
    directory,
    stateDirectory: directory,
    projectID: "upstream-drift",
    nativeMaestro: true,
    nativeUpstream: true,
    ask: () => Effect.void,
    authorize: () => Effect.void,
    outputBudget: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
  }
  const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
  const descriptors = await Arsenal.list()
  expect(descriptors.filter((item) => item.name === "conflict-map")).toHaveLength(mode === "missing" ? 0 : 1)
  if (mode === "nonpure") expect(await Arsenal.describe("conflict-map")).toMatchObject({ effects: ["read"] })
  if (mode === "missing") await expect(Arsenal.describe("conflict-map")).rejects.toThrow("unknown tool: conflict-map")

  // Positive control uses the actual handlers and registry entry instrumented by the source snapshot.
  await Effect.runPromise(handlers.describe({ name: "sliceability" }, context))
  const control = await Effect.runPromise(
    handlers.execute(
      {
        name: "sliceability",
        arguments: { symbols: ["only"], edges: [], k: 1 },
      },
      context,
    ),
  )
  const result = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        content: Schema.Array(Schema.Struct({ text: Schema.String })),
      }),
    ),
  )(control)
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.content[0].text)).toMatchObject({
    verdict: "SLICEABLE",
  })
  expect(await Bun.file(marker).text()).toBe("entered")
  await fs.unlink(marker)

  // An exact receipt for the drifted descriptor must not bypass current upstream purity checks.
  if (mode === "nonpure" && boundary === "execute")
    await Effect.runPromise(handlers.describe({ name: "conflict-map" }, context))
  host.nativeMaestro = false
  const response = await Effect.runPromise(
    (boundary === "catalog"
      ? handlers.catalog({ group: "pure", offset: 10, limit: 1 }, context)
      : boundary === "describe"
        ? handlers.describe({ name: "conflict-map" }, context)
        : handlers.execute({ name: "conflict-map", arguments: { wps: [{ id: "only" }] } }, context)
    ).pipe(Effect.result),
  )
  const entered = await Bun.file(marker).exists()
  console.log(
    JSON.stringify({ upstreamDrift: { mode, boundary, realBackendControl: true, backendEnteredAfterDenial: entered } }),
  )
  expect(response).toMatchObject({
    _tag: "Failure",
    failure: { message: `UPSTREAM_AUTHORING_DESCRIPTOR_${mode === "missing" ? "MISSING" : "NOT_PURE"}: conflict-map` },
  })
  expect(entered).toBe(false)
})

import { describe, expect, test } from "bun:test"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionStore } from "@orchestra/core/session"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer } from "effect"
import { MaestroAtlasRestoreV2 } from "../src/v2/atlas-restore"
import { MaestroSeats } from "../src/v2/seats-service"

// Ruling M3-1 on V2: a seat's admitted resume fold that a compaction left behind returns, with identical text, as a
// System Context source of that seat's turns; a visible, refused, foreign or already restored fold restores nothing.

const projectID = "prj_atlas_restore"
const admission = (input: { owner?: string; project?: string; residency?: "admitted" | "restored"; ok?: boolean; id?: string }) => ({
  schema: "atlas-resume-admission-v1",
  key: {
    projectID: input.project ?? projectID,
    memoryOwner: input.owner ?? "backend",
    logicalResumeID: "ses_parent/call_1",
    kind: "task",
    id: input.id ?? "task-1",
  },
  residency: input.residency ?? "admitted",
  verdict: input.ok === false ? { ok: false, refusal: "fold-missing" } : { ok: true, ref: { eventId: "evt_1" } },
  text: `Atlas Memory resume of your task "${input.id ?? "task-1"}": checkpoint`,
})
const synthetic = (seq: number, value: unknown) => ({
  seq,
  message: { type: "synthetic", metadata: { [MaestroAtlasRestoreV2.ADMISSION_KEY]: value } },
})
const tool = (seq: number, value: unknown) => ({
  seq,
  message: {
    type: "assistant",
    content: [{ type: "tool", state: { status: "completed", structured: { [MaestroAtlasRestoreV2.ADMISSION_KEY]: value } } }],
  },
})
const compaction = (seq: number) => ({ seq, message: { type: "compaction" } })

describe("V2 Atlas resume restore", () => {
  test("an evicted admitted fold is restored with identical text", () => {
    const restored = MaestroAtlasRestoreV2.evicted([synthetic(1, admission({})), compaction(5)], "backend", projectID)
    expect(restored).toMatchObject({ residency: "restored", text: admission({}).text, key: admission({}).key })
    expect(MaestroAtlasRestoreV2.evicted([tool(1, admission({})), compaction(5)], "backend", projectID)?.text).toBe(
      admission({}).text,
    )
  })

  test("a visible, refused, foreign, other-project or already restored fold restores nothing", () => {
    const cases = [
      [synthetic(1, admission({}))],
      [compaction(1), synthetic(2, admission({}))],
      [synthetic(1, admission({})), compaction(2), synthetic(3, admission({ residency: "restored" }))],
      [synthetic(1, admission({ ok: false })), compaction(2)],
      [synthetic(1, admission({ owner: "jimmy" })), compaction(2)],
      [synthetic(1, admission({ project: "prj_other" })), compaction(2)],
      [synthetic(1, { schema: "atlas-resume-admission-v1", text: "malformed" }), compaction(2)],
    ]
    for (const entries of cases) expect(MaestroAtlasRestoreV2.evicted(entries, "backend", projectID)).toBeUndefined()
  })

  test("only the latest admission counts", () => {
    const entries = [synthetic(1, admission({ id: "old" })), synthetic(2, admission({ id: "new" })), compaction(3)]
    expect(MaestroAtlasRestoreV2.evicted(entries, "backend", projectID)?.key.id).toBe("new")
  })

  const load = (agent: string) => {
    const layer = AppNodeBuilder.build(LayerNode.group([SystemContextRegistry.node, MaestroAtlasRestoreV2.node]), [
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: AbsolutePath.make("/project"),
            project: { id: Project.ID.make(projectID), directory: AbsolutePath.make("/project") },
          }),
        ),
      ],
      [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "lucy"]))],
      [
        SessionStore.node,
        Layer.mock(SessionStore.Service, {
          entries: () => Effect.succeed([synthetic(1, admission({})), compaction(4)] as never),
        }),
      ],
    ]) as Layer.Layer<SystemContextRegistry.Service>
    return Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* SystemContextRegistry.Service
        return (yield* SystemContext.initialize(yield* registry.load({ sessionID: "ses_restore", agent }))).baseline
      }).pipe(Effect.scoped, Effect.provide(layer)),
    )
  }

  test("the restored fold reaches only its Atlas Memory seat's turns", async () => {
    expect(await load("backend")).toContain(admission({}).text)
    for (const agent of ["maestro", "lucy"]) expect(await load(agent)).not.toContain("Atlas Memory resume")
  })
})

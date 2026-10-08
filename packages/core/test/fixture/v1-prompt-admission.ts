import { Effect } from "effect"
import { SessionID } from "@orchestra/schema/session-id"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionV1 } from "@orchestra/core/v1/session"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"

export const layer = (filename = ":memory:") =>
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node]), [
    [Database.node, Database.layerFromPath(filename)],
  ])
export const sessionID = SessionID.make("ses_v1_admission")
export const otherSessionID = SessionID.make("ses_v1_other")
export const payload = {
  sessionID,
  messageID: SessionV1.MessageID.make("msg_v1_admission"),
  identityVersion: 1,
  identity: '{"parts":[{"text":"raw bytes","type":"text"}]}',
  info: {
    id: SessionV1.MessageID.make("msg_v1_admission"),
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "maestro",
    model: { providerID: Provider.ID.make("provider"), modelID: Model.ID.make("model") },
    promptContext: { reminders: ["first reminder", "second reminder"] },
  },
  parts: ["prt_v1_z", "prt_v1_a"].map((id, index) => ({
    id: SessionV1.PartID.make(id),
    sessionID,
    messageID: SessionV1.MessageID.make("msg_v1_admission"),
    type: "text",
    text: `projected ${index}`,
  })),
} satisfies PromptAdmission.Payload
export const firstPart = payload.parts[0]
if (!firstPart) throw new Error("Admission fixture requires a first part")
export const seed = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  yield* database.db
    .insert(ProjectTable)
    .values({
      id: Project.ID.global,
      worktree: AbsolutePath.make("/project"),
      sandboxes: [],
    })
    .run()
    .pipe(Effect.orDie)
  yield* Effect.forEach([sessionID, otherSessionID], (id) =>
    events.publish(SessionV1.Event.Created, {
      sessionID: id,
      info: {
        id,
        slug: "test",
        projectID: Project.ID.global,
        directory: "/project",
        title: "test",
        version: "test",
        time: { created: 0, updated: 0 },
      },
    }),
  )
})

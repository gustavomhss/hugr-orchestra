import { LLM, LLMEvent, type LLMClientShape } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import type { Database } from "../../database/database"
import type { SessionCompaction } from "../compaction"
import { SessionHistory } from "../history"
import { SessionSchema } from "../schema"
import type { SessionSubagentModels } from "../subagent-models"
import type { Interface } from "./index"
import { SessionRunnerModel } from "./model"
import { toLLMMessages } from "./to-llm-message"

export function createAuxiliary(input: {
  getSession: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info, SessionSubagentModels.StorageError>
  db: Database.Interface["db"]
  llm: LLMClientShape
  models: SessionRunnerModel.Interface
  subagentModels: SessionSubagentModels.Interface
  compaction: SessionCompaction.Interface
}): Pick<Interface, "compact" | "generate"> {
  const getSession = input.getSession
  const db = input.db
  const llm = input.llm
  const models = input.models
  const subagentModels = input.subagentModels
  const compaction = input.compaction
  const compact = Effect.fn("SessionRunner.compact")(function* (sessionID: SessionSchema.ID) {
    const session = yield* getSession(sessionID)
    const history = yield* SessionHistory.load(db, session.id)
    if (history.length === 0) return false
    const model = yield* models.resolve(session)
    return yield* compaction.compact({
      sessionID: session.id,
      entries: history.map((message, seq) => ({ seq, message })),
      model,
      request: LLM.request({ model, http: { headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID) } }),
    })
  })

  const generate = Effect.fn("SessionRunner.generate")(function* (input: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: string
  }) {
    const session = yield* getSession(input.sessionID)
    const model = yield* models.resolve(session)
    yield* subagentModels.assert(session.id, SessionRunnerModel.reference(model))
    const history = yield* SessionHistory.load(db, session.id)
    const chunks: string[] = []
    yield* llm
      .stream(
        LLM.request({ model, http: { headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID) }, messages: toLLMMessages(history, model), prompt: input.prompt }),
      )
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.providerError(event)) return Effect.die(new Error(event.message))
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
      )
    return chunks.join("")
  })


  return { compact, generate }
}

// Per-session continuity state, shared by the service's workers.
import type { Deferred, Scope, Semaphore } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Provider } from "@/provider/provider"
import type { ResearchExecution } from "@/research/allowance"
import type { LLM } from "@/session/llm"
import type { MessageID, SessionID } from "@/session/schema"
import type { create } from "./context"
import type { ParentRequest } from "./fork"
import type { MemoryArtifact, MemorySnapshot } from "./memory-types"
import type { ContinuityContext } from "./model"

export type Backend = { readonly model: Provider.Model; readonly llm: LLM.Interface; readonly revision: number }
export type Active = { generation: number; epoch: number; backend: Backend | null | undefined; boundary: MessageID;
  registered: Deferred.Deferred<void>; done: Deferred.Deferred<void>; context?: string }
export type Pending = { message: SessionV1.Assistant; canRecall: boolean; model?: Provider.Model; context?: string
  /** The research dispatch that initiated the pass, retained for a pass that starts later in another worker. */
  attribution?: ResearchExecution.Frame }
/** A checked catch-up whose caller was superseded, with everything its reuse must find unchanged. Revision counts history edits. */
export type Parked = { artifact: MemoryArtifact; selected: MemorySnapshot; model: Provider.Model; context: string; epoch: number;
  backend: Backend | null | undefined; revision: number; prior?: ContinuityContext }
export type Entry = {
  generation: number
  revision?: number
  parked?: Parked
  safe?: MessageID
  active?: Active
  pending?: Pending
  attempted?: MessageID
  refresh: boolean
  archived?: MessageID
  /** Consecutive producer failures; maintenance stops for the session at MAX_FAILURES. */
  failures?: number
  /** How the last maintenance run ended. */
  result?: string
  admittedBoundary?: MessageID
  /** No masking fallback until a failed mandatory checkpoint has been saved successfully. */
  checkpointBlocked?: boolean
}
export type State = {
  backends: Map<SessionID, Backend | null>
  epochs: Map<SessionID, number>
  backendGates: Map<SessionID, Semaphore.Semaphore>
  sessions: Map<SessionID, Entry>
  contexts: ReturnType<typeof create>
  scope: Scope.Scope
  /** Latest parent model request per session, kept so maintenance can reuse its prompt cache. */
  requests: Map<SessionID, ParentRequest>
  /** The parent's measured system and tool overhead per session; it outlives the evicted request. */
  overheads: Map<SessionID, number>
  /** Masked tool part IDs per session, mapped to the archive reference with the full output. */
  masks: Map<SessionID, Map<string, string>>
  /** Sessions whose persisted memory was loaded, is loading, or must not load (invalidated or forgotten). */
  loads: Map<SessionID, Deferred.Deferred<void>>
}

export function entry(state: State, sessionID: SessionID) {
  const existing = state.sessions.get(sessionID)
  if (existing) return existing
  const next: Entry = { generation: 0, refresh: false }
  state.sessions.set(sessionID, next)
  return next
}

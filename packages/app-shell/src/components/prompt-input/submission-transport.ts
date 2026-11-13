import type { DirectorySDK } from "@/context/sdk"
import { Event } from "@orchestra/schema/event"
import type { AdmissionRequest, PromptDispatch } from "./submission-types"

// Shared by the composer and evidence replay: exact draft retries retain their event ID, and
// the request carries no workdir, so callers must only replay in the session directory.
export async function submitShellCommand(input: {
  api: DirectorySDK["api"]["session"]
  sessionID: string
  command: string
  agent: string
  model: { providerID: string; modelID: string }
  signal?: AbortSignal
  before?: () => Promise<boolean> | boolean
  current?: () => boolean
  request?: AdmissionRequest
  dispatch?: PromptDispatch
}) {
  if (input.signal?.aborted || input.current?.() === false) return false
  if ((await input.before?.()) === false || input.signal?.aborted || input.current?.() === false) return false
  const send = (request = input.request, current = () => !input.signal?.aborted && input.current?.() !== false) => {
    const shell = request?.shell ?? {
      sessionID: input.sessionID,
      id: request ? Event.ID.make(request.id) : Event.ID.create(),
      command: input.command,
      agent: input.agent,
      model: input.model,
    }
    if (request) request.shell = shell
    if (!current()) return Promise.resolve(false)
    return input.api.shell(shell, { signal: input.signal })
  }
  if (input.dispatch) return input.dispatch(send)
  if (input.request?.admitted) return true
  return send()
}


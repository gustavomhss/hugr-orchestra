import type { OpencodeClient, SessionStatus } from "@opencode-ai/sdk/v2"
import { Locale } from "@/util/locale"
import { UI } from "../../ui"

// A provider quota can answer 429 with a retry-after of hours, and the session then sleeps through it with no output.
// `run` reports every retry and aborts the session rather than wait longer than this.
export const RETRY_WAIT_LIMIT = 10 * 60_000

export async function reportRetry(input: {
  client: OpencodeClient
  sessionID: string
  retrySessionID: string
  status: Extract<SessionStatus, { type: "retry" }>
  emit: (type: string, data: Record<string, unknown>) => boolean
}) {
  const wait = Math.max(0, input.status.next - Date.now())
  if (!input.emit("retry", { retry: { ...input.status, sessionID: input.retrySessionID } })) {
    UI.println(
      UI.Style.TEXT_WARNING_BOLD + "!",
      UI.Style.TEXT_NORMAL + `${input.status.message}; retry ${input.status.attempt} in ${Locale.duration(wait)}`,
    )
  }
  if (wait <= RETRY_WAIT_LIMIT) return undefined
  const error = `${input.status.message}; the provider asks to retry in ${Locale.duration(wait)}, longer than run waits (${Locale.duration(RETRY_WAIT_LIMIT)})`
  if (!input.emit("error", { error: { name: "RetryWaitTooLong", data: { message: error } } })) UI.error(error)
  await input.client.session.abort({ sessionID: input.sessionID })
  return error
}

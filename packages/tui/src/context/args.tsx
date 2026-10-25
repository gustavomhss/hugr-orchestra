import { createSimpleContext } from "./helper"

export interface Args {
  model?: string
  agent?: string
  prompt?: string
  continue?: boolean
  sessionID?: string
  fork?: boolean
  auto?: boolean
  /** Model variant (reasoning effort) applied to the chosen model. */
  variant?: string
  /** Minimal layout: no sidebar unless it is opened by hand. */
  mini?: boolean
  /** With mini: false hides the session history that existed when the TUI opened. */
  replay?: boolean
  /** With mini: show only the newest N messages of the session history. */
  replayLimit?: number
  /** With mini: the demo slash commands run synthetic output instead of a model turn. */
  demo?: boolean
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})

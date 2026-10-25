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
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})

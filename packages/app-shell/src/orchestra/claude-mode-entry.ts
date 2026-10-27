import type { HomeProjectSelection } from "@/context/layout"
import { type ClaudeProviders, readAccount } from "./chapters/claude-mode-account"

export const CLAUDE_MODE_PATH = "/orchestra/providers"

type Engine = "orchestra" | "claude-code"
type Config = { updateConfig: (config: { agent: { maestro: { engine: Engine } } }) => Promise<unknown> }

// Route state for the Providers page. `engine` asks the page to switch Maestro to Claude Code once sign-in succeeds;
// `returnTo` is where the page goes back to after setup, so the person resumes the task they started.
export type ClaudeModeIntent = { returnTo?: string; engine?: boolean }

export function setMaestroEngine(sync: Config, engine: Engine) {
  return sync.updateConfig({ agent: { maestro: { engine } } })
}

// The entry point of the no-provider surfaces. The engine switches only when the account is already signed in;
// otherwise the Providers page switches it after its sign-in succeeds, so a signed-out person never gets an engine
// with no account behind it. The chapter page reads the Home profile, so give it one when none is selected yet.
export async function enableClaudeMode(input: {
  sync: Config
  providers: ClaudeProviders
  home: { selection: () => HomeProjectSelection; setSelection: (selection: HomeProjectSelection) => void }
  server: HomeProjectSelection["server"]
  directory: string | null | undefined
  returnTo?: string
  close: () => void
  navigate: (path: string, intent: ClaudeModeIntent) => void
}) {
  const account = await readAccount(input.providers)
  const signedIn = account?.signedIn === true
  if (signedIn) await setMaestroEngine(input.sync, "claude-code")
  input.close()
  if (input.directory && !input.home.selection().directory)
    input.home.setSelection({ server: input.server, directory: input.directory })
  // Already signed in: the engine is switched and the person stays on the task they started.
  if (signedIn) return
  input.navigate(CLAUDE_MODE_PATH, { returnTo: input.returnTo, engine: true })
}

import type { HomeProjectSelection } from "@/context/layout"

export const CLAUDE_MODE_PATH = "/orchestra/providers"

type Engine = "orchestra" | "claude-code"
type Config = { updateConfig: (config: { agent: { maestro: { engine: Engine } } }) => Promise<unknown> }

export function setMaestroEngine(sync: Config, engine: Engine) {
  return sync.updateConfig({ agent: { maestro: { engine } } })
}

// The entry point of the no-provider surfaces: switch Maestro to Claude Code, then open the Claude mode section of
// Settings › Providers. The chapter page reads the Home profile, so give it one when none is selected yet.
export async function enableClaudeMode(input: {
  sync: Config
  home: { selection: () => HomeProjectSelection; setSelection: (selection: HomeProjectSelection) => void }
  server: HomeProjectSelection["server"]
  directory: string | null | undefined
  close: () => void
  navigate: (path: string) => void
}) {
  await setMaestroEngine(input.sync, "claude-code")
  input.close()
  if (input.directory && !input.home.selection().directory)
    input.home.setSelection({ server: input.server, directory: input.directory })
  input.navigate(CLAUDE_MODE_PATH)
}

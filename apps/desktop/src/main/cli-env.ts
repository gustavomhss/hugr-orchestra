import { OmniHost } from "./omni-host"

type Environment = Record<string, string | undefined>

/** The owned CLI's environment: the desktop's, plus the resolved omni pair its packaged preflight requires. */
export function cliEnv(base: Environment, stateHome: string | undefined): Environment {
  const env = { ...base, ...OmniHost.sidecarEnv() }
  if (stateHome === undefined) delete env.XDG_STATE_HOME
  else env.XDG_STATE_HOME = stateHome
  return env
}

import { EOL } from "os"
import type { BackendToolkit } from "@orchestra/core/backend-toolkit"

export function describe(state: BackendToolkit.State<string>) {
  if (state.status === "ready") return `ready ${state.executable}`
  if (state.status === "failed") return `failed: ${state.cause}`
  if (state.status === "unsupported") return `unsupported: ${state.reason}`
  return state.status
}

export function print(states: ReadonlyArray<BackendToolkit.State<string>>, json: boolean) {
  process.stdout.write(
    (json ? JSON.stringify(states, null, 2) : states.map((state) => `${state.engine} ${state.version} ${describe(state)}`).join(EOL)) + EOL,
  )
}

export function names(states: ReadonlyArray<BackendToolkit.State<string>>) {
  return states.map((state) => `${state.engine} ${describe(state)}`).join(", ")
}

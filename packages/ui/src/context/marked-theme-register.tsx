import { registerCustomTheme } from "@pierre/diffs"
import { OrchestraTheme } from "./marked-theme"

let registered = false

export function registerOrchestraTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("Orchestra", () => Promise.resolve(OrchestraTheme))
}

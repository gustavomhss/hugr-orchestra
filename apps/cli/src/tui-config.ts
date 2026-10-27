import { TuiConfig } from "@orchestra/tui/config"
import { TuiConfigFiles } from "@orchestra/core/tui-config-files"
import { Schema } from "effect"

/**
 * Loads `tui.json(c)` (global first, then project folders; later files win per key) and resolves it. An invalid file
 * throws an error naming it. Keybinds and plugin toggles merge by name, so a project file overrides single entries
 * instead of dropping the global ones.
 */
export async function loadTuiConfig(directory: string, globalConfig?: string) {
  const decode = Schema.decodeUnknownSync(TuiConfig.Info)
  const infos = (await TuiConfigFiles.read(directory, globalConfig)).map((file) => {
    try {
      return decode(file.value)
    } catch (error) {
      throw new Error(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  const merged = infos.reduce<TuiConfig.Info>(
    (base, next) => ({
      ...base,
      ...next,
      ...(base.keybinds && next.keybinds ? { keybinds: { ...base.keybinds, ...next.keybinds } } : {}),
      ...(base.plugin_enabled && next.plugin_enabled
        ? { plugin_enabled: { ...base.plugin_enabled, ...next.plugin_enabled } }
        : {}),
    }),
    {},
  )
  return TuiConfig.resolve(merged, { terminalSuspend: false })
}

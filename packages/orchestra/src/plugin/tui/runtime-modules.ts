import { runtimeModules } from "@opentui/keymap/runtime-modules"

// Modules that TUI plugins import and resolve to this process's copies. That includes the TUI half of the plugin SDK,
// so no plugin needs a registry copy of it; PluginSdkRuntime covers the rest of the SDK.
export const tuiRuntimeModules = {
  ...runtimeModules,
  "@orchestra/plugin/tui": () => import("@orchestra/plugin/tui"),
}

import { runtimeModules } from "@opentui/keymap/runtime-modules"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"

// OpenTUI rewrites remaining bare imports to disk paths after runtime imports. Register the whole public SDK here
// too, so mixed SDK/TUI imports keep using this process's copies through that rewrite.
export const tuiRuntimeModules = {
  ...runtimeModules,
  ...PluginSdkRuntime.modules,
  "@orchestra/plugin/tui": () => import("@orchestra/plugin/tui"),
}

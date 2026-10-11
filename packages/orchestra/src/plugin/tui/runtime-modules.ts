import { runtimeModules } from "@opentui/keymap/runtime-modules"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"

// OpenTUI rewrites remaining bare imports to disk paths after runtime imports. Register the whole public SDK here
// too, so mixed SDK/TUI imports keep using this process's copies through that rewrite. The SDK map already
// carries `@orchestra/plugin/tui`; redefining it here would hand OpenTUI a different loader than the SDK's.
export const tuiRuntimeModules = {
  ...runtimeModules,
  ...PluginSdkRuntime.modules,
}

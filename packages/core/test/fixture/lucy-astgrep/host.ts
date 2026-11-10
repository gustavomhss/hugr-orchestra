import { Effect } from "effect"
import { BackendToolkit } from "../../../src/backend-toolkit"
import { BackendToolkitManifest } from "../../../src/backend-toolkit/manifest"

// Test-host setup only. An isolated toolkit root receives the canonical pinned ast-grep through BackendToolkit.ensure,
// which checks the pin's integrity before the install appears. A review's locate stays status-only and must not call this.
const engine = BackendToolkitManifest.ENGINES["ast-grep"]

export const provision = (root: string) =>
  BackendToolkit.ensure("ast-grep").pipe(
    Effect.provideService(BackendToolkit.Root, root),
    Effect.provideService(BackendToolkit.Manifest, { [engine.id]: engine }),
    Effect.catch((error) => Effect.die(new Error(`conformance-missing: ast-grep ${engine.version}: ${error.reason}`))),
    Effect.flatMap((ready) => ready.executable.includes(engine.version)
      ? Effect.succeed({ root, executable: ready.executable, version: engine.version })
      : Effect.die(new Error(`conformance-missing: ast-grep ${engine.version}: install is not the pinned artifact`))),
  )

import { Effect } from "effect"
import { BackendToolkit } from "../../../src/backend-toolkit"
import { BackendToolkitManifest } from "../../../src/backend-toolkit/manifest"

// Test-host setup only. Isolated root, canonical 2.67.0 pin, existing PinnedArtifact hash check inside ensure.
// A review locate stays status-only and must not call this. Network here is the authorized pinned fetch.
const engine = BackendToolkitManifest.ENGINES.squawk

export const provision = (root: string) =>
  BackendToolkit.ensure("squawk").pipe(
    Effect.provideService(BackendToolkit.Root, root),
    Effect.provideService(BackendToolkit.Manifest, { [engine.id]: engine }),
    Effect.catch((error) => Effect.die(new Error(`conformance-missing: squawk ${engine.version}: ${error.reason}`))),
    Effect.flatMap((ready) => ready.executable.includes(engine.version)
      ? Effect.succeed({ executable: ready.executable, version: engine.version })
      : Effect.die(new Error(`conformance-missing: squawk ${engine.version}: install is not the pinned artifact`))),
  )

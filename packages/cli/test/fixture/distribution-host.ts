import { isAbsolute } from "node:path"

// Native Darwin publication uses the SDK-backed existing ArtifactNative adapter.
// Discover the actual hosted SDK; a missing compiler/header setup is a failure.
export function requireDistributionHost() {
  if (process.platform !== "darwin" || process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK) return
  if (!process.env.RUNNER_OS) throw new Error("Distribution host setup requires hosted CI")
  const result = Bun.spawnSync(["xcrun", "--sdk", "macosx", "--show-sdk-path"], {
    stdout: "pipe", stderr: "pipe", timeout: 15_000,
  })
  const sdk = result.stdout.toString().trim()
  if (result.exitCode !== 0 || !isAbsolute(sdk)) throw new Error("DISTRIBUTION_DARWIN_SDK_UNAVAILABLE")
  process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK = sdk
}

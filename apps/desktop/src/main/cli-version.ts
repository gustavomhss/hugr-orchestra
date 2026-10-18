import { readCliManifest } from "./cli-artifacts"
import { nativeT } from "./native-translations"

export async function readWslExpectedVersion(platform: string, directory: string, appVersion: string) {
  if (platform !== "win32") return appVersion
  return readCliManifest(directory)
    .then((manifest) => manifest.version)
    .catch((cause: unknown) => {
      const error = new Error(nativeT("desktop.recovery.loadFailed"), { cause })
      error.name = "OwnedCliBootstrapError"
      throw error
    })
}

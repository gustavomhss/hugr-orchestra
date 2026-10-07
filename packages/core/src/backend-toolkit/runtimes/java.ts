import type { PinnedArtifact } from "../../pinned-artifact"
import type { Runtime } from "../manifest"

// Pins are the Temurin release assets' sha256 digests in SRI form; each `.sha256.txt` companion agreed with them when
// pinning.
const TEMURIN = "17.0.20.1+1"

// Every archive holds one JRE home with these six children. They move as whole directories, so the installed tree is
// the complete JRE with its tar modes intact. macOS nests the home in a bundle whose launcher stub and signature
// resources are left out: `bin/java` loads only from the home.
const temurin = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = asset.endsWith("_windows")
  const home = asset.endsWith("_mac") ? `jdk-${TEMURIN}-jre/Contents/Home` : `jdk-${TEMURIN}-jre`
  return {
    artifact: {
      url: `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN)}/OpenJDK17U-jre_${asset}_hotspot_${TEMURIN.replace("+", "_")}.${windows ? "zip" : "tar.gz"}`,
      integrity,
      format: windows ? ("zip" as const) : ("tar.gz" as const),
      entries: ["NOTICE", "bin", "conf", "legal", "lib", "release"].map((name) => ({ from: `${home}/${name}`, to: name })),
    },
    executable: windows ? "bin/java.exe" : "bin/java",
  }
}

export default {
  id: "java",
  version: TEMURIN,
  license: "GPL-2.0-only WITH Classpath-exception-2.0",
  upstream: "adoptium/temurin17-binaries",
  targets: {
    "darwin-arm64": temurin("aarch64_mac", "sha256-GQSAh0zM6zWMvIQDkyB/d6w+Y6TF+BKdDiPpUYuWrQU="),
    "darwin-x64": temurin("x64_mac", "sha256-Mzy4ESPDZWhYZkbHPI+iMm2ri63EP16jiKkP/1nJ3yc="),
    "linux-arm64": temurin("aarch64_linux", "sha256-uO/NWsyRCf6NNb7RMkmWQwSKJXtPYEKQbs430DyDnXc="),
    "linux-x64": temurin("x64_linux", "sha256-CytkDjBGtkyOxQTeCrnZG7VhAYK9oh+tRUaBzlTUWmI="),
    "win32-x64": temurin("x64_windows", "sha256-vCGpOSMQPNqsk+4zewrkNl5zn94234I91Fa8Z8ip01I="),
  },
} satisfies Runtime

export * as ReviewToolkitManifest from "./manifest"

import jscpd from "../backend-toolkit/packs/jscpd"
import cargoAudit from "../backend-toolkit/packs/cargo-audit"

/** Review-only engines provisioned by the host before a review starts. */
export const ENGINES = { jscpd, "cargo-audit": cargoAudit } as const

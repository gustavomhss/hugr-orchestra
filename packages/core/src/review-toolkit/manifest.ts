export * as ReviewToolkitManifest from "./manifest"

import jscpd from "../backend-toolkit/packs/jscpd"

/** Review-only engines provisioned by the host before a review starts. */
export const ENGINES = { jscpd } as const

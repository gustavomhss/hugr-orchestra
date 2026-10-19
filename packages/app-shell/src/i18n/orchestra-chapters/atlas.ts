import { ATLAS_FRAME_COPY } from "./atlas-frame"
import { ATLAS_KIT_COPY } from "./atlas-kit"

// Copy owned by the Atlas chapter. Each part keeps its keys in its own atlas-<part>.ts file, spread here.
export const ATLAS_COPY = {
  "orchestra.nav.atlas": "Atlas",
  ...ATLAS_FRAME_COPY,
  ...ATLAS_KIT_COPY,
}

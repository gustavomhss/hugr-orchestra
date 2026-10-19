import { ATLAS_ACTIVITY_COPY } from "./atlas-activity"
import { ATLAS_ARCHITECTURE_COPY } from "./atlas-architecture"
import { ATLAS_EXPLORE_COPY } from "./atlas-explore"
import { ATLAS_FACT_COPY } from "./atlas-fact"
import { ATLAS_FRAME_COPY } from "./atlas-frame"
import { ATLAS_GENESIS_COPY } from "./atlas-genesis"
import { ATLAS_HOW_COPY } from "./atlas-how"
import { ATLAS_KIT_COPY } from "./atlas-kit"
import { ATLAS_MEMORY_COPY } from "./atlas-memory"
import { ATLAS_OVERVIEW_COPY } from "./atlas-overview"
import { ATLAS_OWNERSHIP_COPY } from "./atlas-ownership"
import { ATLAS_REVIEW_COPY } from "./atlas-review"
import { ATLAS_SHEETS_COPY } from "./atlas-sheets"
import { ATLAS_UNIT_COPY } from "./atlas-unit"

// Copy owned by the Atlas chapter. Each part keeps its keys in its own atlas-<part>.ts file, spread here.
export const ATLAS_COPY = {
  "orchestra.nav.atlas": "Atlas",
  ...ATLAS_FRAME_COPY,
  ...ATLAS_KIT_COPY,
  ...ATLAS_OVERVIEW_COPY,
  ...ATLAS_EXPLORE_COPY,
  ...ATLAS_UNIT_COPY,
  ...ATLAS_FACT_COPY,
  ...ATLAS_REVIEW_COPY,
  ...ATLAS_ACTIVITY_COPY,
  ...ATLAS_GENESIS_COPY,
  ...ATLAS_ARCHITECTURE_COPY,
  ...ATLAS_OWNERSHIP_COPY,
  ...ATLAS_HOW_COPY,
  ...ATLAS_MEMORY_COPY,
  ...ATLAS_SHEETS_COPY,
}

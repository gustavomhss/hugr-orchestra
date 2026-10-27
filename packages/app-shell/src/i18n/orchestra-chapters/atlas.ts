import { ATLAS_ACTIVITY_COPY, ATLAS_ACTIVITY_COPY_BR } from "./atlas-activity"
import { ATLAS_ARCHITECTURE_COPY, ATLAS_ARCHITECTURE_COPY_BR } from "./atlas-architecture"
import { ATLAS_EXPLORE_COPY, ATLAS_EXPLORE_COPY_BR } from "./atlas-explore"
import { ATLAS_FACT_COPY, ATLAS_FACT_COPY_BR } from "./atlas-fact"
import { ATLAS_FRAME_COPY, ATLAS_FRAME_COPY_BR } from "./atlas-frame"
import { ATLAS_GENESIS_COPY, ATLAS_GENESIS_COPY_BR } from "./atlas-genesis"
import { ATLAS_HOW_COPY, ATLAS_HOW_COPY_BR } from "./atlas-how"
import { ATLAS_KIT_COPY, ATLAS_KIT_COPY_BR } from "./atlas-kit"
import { ATLAS_MEMORY_COPY, ATLAS_MEMORY_COPY_BR } from "./atlas-memory"
import { ATLAS_OVERVIEW_COPY, ATLAS_OVERVIEW_COPY_BR } from "./atlas-overview"
import { ATLAS_OWNERSHIP_COPY, ATLAS_OWNERSHIP_COPY_BR } from "./atlas-ownership"
import { ATLAS_REVIEW_COPY, ATLAS_REVIEW_COPY_BR } from "./atlas-review"
import { ATLAS_SHEETS_COPY, ATLAS_SHEETS_COPY_BR } from "./atlas-sheets"
import { ATLAS_UNIT_COPY, ATLAS_UNIT_COPY_BR } from "./atlas-unit"

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

export const ATLAS_COPY_BR: Record<keyof typeof ATLAS_COPY, string> = {
  "orchestra.nav.atlas": "Atlas",
  ...ATLAS_FRAME_COPY_BR,
  ...ATLAS_KIT_COPY_BR,
  ...ATLAS_OVERVIEW_COPY_BR,
  ...ATLAS_EXPLORE_COPY_BR,
  ...ATLAS_UNIT_COPY_BR,
  ...ATLAS_FACT_COPY_BR,
  ...ATLAS_REVIEW_COPY_BR,
  ...ATLAS_ACTIVITY_COPY_BR,
  ...ATLAS_GENESIS_COPY_BR,
  ...ATLAS_ARCHITECTURE_COPY_BR,
  ...ATLAS_OWNERSHIP_COPY_BR,
  ...ATLAS_HOW_COPY_BR,
  ...ATLAS_MEMORY_COPY_BR,
  ...ATLAS_SHEETS_COPY_BR,
}

export * as ConfigResearch from "./research"

import { Schema } from "effect"
import { PositiveInt } from "../schema"

export class Limits extends Schema.Class<Limits>("ConfigV2.ResearchLimits")({
  indexer_bytes: PositiveInt.pipe(Schema.optional).annotate({
    description: "Memory cap of one code indexer run in bytes (default and maximum: 2 GiB)",
  }),
  probe_bytes: PositiveInt.pipe(Schema.optional).annotate({
    description: "Memory cap of one research probe in bytes (default and maximum: 1 GiB)",
  }),
  scratch_bytes: PositiveInt.pipe(Schema.optional).annotate({
    description: "Scratch disk of one research probe in bytes (default and maximum: 2 GiB)",
  }),
  index_bytes: PositiveInt.pipe(Schema.optional).annotate({
    description: "Disk budget of the code index cache in bytes (default and maximum: 4 GiB)",
  }),
}) {}

export class Info extends Schema.Class<Info>("ConfigV2.Research")({
  limits: Limits.pipe(Schema.optional),
}) {}

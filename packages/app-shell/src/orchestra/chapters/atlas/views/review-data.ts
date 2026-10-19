import type { AtlasModel } from "../atlas-model"
import type { AtlasPromoteRecord } from "../sheets/state"

// Review › Changed code: drifted facts, narrowed to one unit and one commit when the query names them
// (mock views-more.js:26).
export function changedFacts(model: AtlasModel, filter: { unit?: string; commit?: string }) {
  return model
    .live()
    .filter((x) => model.state(x) === "drifted")
    .filter((x) => !filter.commit || !!x.drift?.commits.some((commit) => commit[0] === filter.commit))
    .filter((x) => !filter.unit || model.unitOf(x.file) === filter.unit)
}

// The units that hold a drifted fact, for the unit filter (mock views-more.js:27).
export function changedUnits(model: AtlasModel) {
  return [...new Set(model.live().filter((x) => model.state(x) === "drifted").map((x) => model.unitOf(x.file)))].sort()
}

// The mined suggestions still waiting (mock views-more.js:34).
export const waiting = (model: AtlasModel) => model.candidates.filter((x) => !x.promotedNow && !x.discarded)

// The kept promote run's "Last run" counts: suggestions it accepted and suggestions it refused (mock views-more.js:36).
export function lastRun(record: AtlasPromoteRecord) {
  const staged = (row: { nodeKey: string }) => record.staged.includes(row.nodeKey)
  return {
    fresh: record.run.rows.filter((row) => row.settled && staged(row)).length,
    refused: record.run.rows.filter((row) => !row.settled && staged(row)).length,
  }
}

// One mined row's outcome in the kept run, when the run touched it (mock views-more.js:21-24).
export const rowOutcome = (record: AtlasPromoteRecord | undefined, key: string) =>
  record?.run.rows.find((row) => row.nodeKey === key)

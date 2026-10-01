// @atlas/persist — barrel
//
// Layer 2: git-native durability / provenance / re-spawn. Re-exports the package's FULL public surface so
// consumers import from the bare package root (`import type { VersionDelta } from '@atlas/persist'`). Each
// frozen interface is co-located with its impl; the shared/multi-consumer data model lives in types.ts.

// The shared frozen data model + the multi-consumer version-delta types (VersionDelta/VersionDeltaEntry).
export type * from "./types.js"

// WP-1.1-b.PERSIST runtime surface: store+trailers portable-source assembly + full-store OKF export.
// (The frozen PortableSource/SourceApi are re-exported explicitly — source.js keeps its Home/Placement/
//  Source model private, exactly as before.)
export { clone, soleHomeViolations, exportStore, importStore } from "./source.js"
export type { PortableSource, SourceApi } from "./source.js"

// WP-1.2-b.PERSIST runtime surface: set-fold reconstruction over git history + archive/forget + rewind.
export {
  collect,
  reconstruct,
  replayEvents,
  replayFromExport,
  serializeState,
  rewind,
  archive,
  del,
  mergeArchive,
  respawn,
  forget,
} from "./reconstruct.js"

// WP-1.3-b.PERSIST runtime surface: the git merge-driver over the SEALED kernel merge/fold/head seam —
// content-keyed union-fold, self-install, and the lossless safe-degrade path (PERSIST-11).
export {
  mergeAtlas,
  mergeDriver,
  degradeMerge,
  gitattributesEntry,
  mergeDriverRegistration,
  setupHook,
  ATLAS_LOG_PATH,
  MERGE_DRIVER_NAME,
} from "./merge.js"
export type { DriverRegistration, SetupResult } from "./merge.js"

// Campaign-3 runtime surface (provenance trailer + host-forge projection + scrubbed transcript + re-spawn):
//   WP-3.4-a: provenance / attach / metering · WP-3.4-b: host-adapter / placement
//   WP-3.5-a: transcript-store / scrub       · WP-3.5-b: reinvoke
export * from "./provenance.js"
export * from "./attach.js"
export * from "./metering.js"
export * from "./host-adapter.js"
export * from "./placement.js"
export * from "./transcript-store.js"
export * from "./scrub.js"
export * from "./reinvoke.js"

// WP-7.32.PERSIST runtime surface (EPIC-32): version-delta = deterministic read-only fold-diff over the
// sealed kernel fold/head/canonicalForm seam (added/edited/superseded/decayed, each with persist-local provenance).
export * from "./diff.js"

import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { createProgram, getPreEmitDiagnostics, ModuleKind, ScriptTarget } from "typescript"
import { splitTypes } from "../script/split-types"

const names = ["MaestroWorkResultDecided", "SyncEventMaestroWorkResultDecided"]
const location = "export type LocationRef = { directory: string }\n"
const event = `/** Keep this comment: export type Decoy = never */
export type MaestroWorkResultDecided = { type: "maestro.work_result.decided"; location?: LocationRef }
`
const sync = `export type SyncEventMaestroWorkResultDecided = { syncEvent: { type: "maestro.work_result.decided.1" } }
`
const source = location + event + sync + "export type V2Event = MaestroWorkResultDecided\n"

test("partition preserves declaration bytes/comments and imports parsed dependencies", () => {
  const split = splitTypes(source, names)
  expect(split.partition).toContain(event.trimEnd())
  expect(split.partition).toContain(sync.trimEnd())
  expect(split.partition).toContain('import type { LocationRef } from "./types.gen.js"')
  expect(split.main).toContain(location)
  expect(split.main).toContain("export type V2Event = MaestroWorkResultDecided")
  expect(split.main).toContain(
    'export type { MaestroWorkResultDecided, SyncEventMaestroWorkResultDecided } from "./maestro-events.gen.js"',
  )
  const renamed = splitTypes(source.replaceAll("LocationRef", "OtherLocation"), names)
  expect(renamed.partition).toContain('import type { OtherLocation } from "./types.gen.js"')
})

test("partition fails named on empty selection, missing/duplicate aliases and unresolved dependencies", () => {
  expect(() => splitTypes(source, [])).toThrow("SdkTypePartition: empty-selection")
  expect(() => splitTypes(source, [names[0], names[0]])).toThrow("SdkTypePartition: duplicate-selection")
  expect(() => splitTypes(location + sync, names)).toThrow("SdkTypePartition: missing-type MaestroWorkResultDecided")
  expect(() => splitTypes(source + sync, names)).toThrow(
    "SdkTypePartition: duplicate-type SyncEventMaestroWorkResultDecided",
  )
  expect(() => splitTypes(event + sync, names)).toThrow("SdkTypePartition: missing-or-ambiguous-dependency LocationRef")
  expect(() => splitTypes(source.replace("export type Maestro", "type Maestro"), names)).toThrow(
    "SdkTypePartition: not-exported MaestroWorkResultDecided",
  )
  expect(() => splitTypes(source.replace("Decided = { type", "Decided<T> = { type"), names)).toThrow(
    "SdkTypePartition: unsupported-generic MaestroWorkResultDecided",
  )
  expect(() => splitTypes(source.replace("location?: LocationRef", "location?: typeof LocationRef"), names)).toThrow(
    "SdkTypePartition: unsupported-type-query MaestroWorkResultDecided",
  )
  expect(() => splitTypes(source.replace("location?: LocationRef", "location?: Namespace.LocationRef"), names)).toThrow(
    "SdkTypePartition: qualified-reference MaestroWorkResultDecided",
  )
})

test("compiler resolves partition cycle, public SDK reexports and SSE/sync union identities", async () => {
  const dir = await mkdtemp(join(import.meta.dir, ".split-types-"))
  try {
    const split = splitTypes(source, names)
    await Bun.write(join(dir, "types.gen.ts"), split.main)
    await Bun.write(join(dir, "maestro-events.gen.ts"), split.partition)
    await Bun.write(
      join(dir, "proof.ts"),
      `
import type { MaestroWorkResultDecided, SyncEventMaestroWorkResultDecided, LocationRef, V2Event, GlobalEvent } from "@orchestra/sdk/v2/types"
import type { EventMaestroWorkResultDecided, MaestroTaskBound, SyncEventMaestroTaskBound, EventMaestroTaskBound } from "@orchestra/sdk/v2/types"
type Assert<T extends true> = T
type SplitEvent = import("../../src/v2/gen/maestro-events.gen.js").MaestroWorkResultDecided
type SplitSync = import("../../src/v2/gen/maestro-events.gen.js").SyncEventMaestroWorkResultDecided
type Synthetic = import("./types.gen.js").MaestroWorkResultDecided
type SyntheticSplit = import("./maestro-events.gen.js").MaestroWorkResultDecided
type Any<T> = 0 extends (1 & T) ? true : false
export type NotAny = Assert<Any<MaestroWorkResultDecided> extends false ? true : false>
export type ExactPublic = Assert<MaestroWorkResultDecided extends SplitEvent ? true : false>
export type ExactPartition = Assert<SplitEvent extends MaestroWorkResultDecided ? true : false>
export type ExactSync = Assert<SyncEventMaestroWorkResultDecided extends SplitSync ? true : false>
export type ExactSyncBack = Assert<SplitSync extends SyncEventMaestroWorkResultDecided ? true : false>
export type DecidedCompatibility = Assert<EventMaestroWorkResultDecided extends import("../../src/v2/gen/maestro-events.gen.js").EventMaestroWorkResultDecided ? true : false>
export type BoundLive = Assert<MaestroTaskBound extends import("../../src/v2/gen/maestro-events.gen.js").MaestroTaskBound ? true : false>
export type BoundSync = Assert<SyncEventMaestroTaskBound extends import("../../src/v2/gen/maestro-events.gen.js").SyncEventMaestroTaskBound ? true : false>
export type BoundCompatibility = Assert<EventMaestroTaskBound extends import("../../src/v2/gen/maestro-events.gen.js").EventMaestroTaskBound ? true : false>
export type EventUnion = Assert<Extract<V2Event, { type: "maestro.work_result.decided" }> extends MaestroWorkResultDecided ? true : false>
export type EventUnionBack = Assert<MaestroWorkResultDecided extends Extract<V2Event, { type: "maestro.work_result.decided" }> ? true : false>
export type SyncUnion = Assert<SyncEventMaestroWorkResultDecided extends GlobalEvent["payload"] ? true : false>
export type LocationCycle = Assert<Exclude<MaestroWorkResultDecided["location"], undefined> extends LocationRef ? true : false>
export type SyntheticCycle = Assert<Synthetic extends SyntheticSplit ? true : false>
// @ts-expect-error Partition must preserve literal event type.
export type RefuseWrongEvent = Assert<"forged" extends MaestroWorkResultDecided["type"] ? true : false>
// @ts-expect-error Partition must preserve decision vocabulary.
export type RefuseWrongDecision = Assert<"forged" extends MaestroWorkResultDecided["data"]["decision"] ? true : false>
`,
    )
    const program = createProgram([join(dir, "proof.ts"), join(import.meta.dir, "../script/split-types.ts")], {
      module: ModuleKind.NodeNext,
      target: ScriptTarget.ESNext,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    })
    expect(getPreEmitDiagnostics(program).map((entry) => entry.messageText)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

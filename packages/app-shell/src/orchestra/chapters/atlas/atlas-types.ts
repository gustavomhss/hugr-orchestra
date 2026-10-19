import type { DirectorySDK } from "@/context/sdk"

// The Atlas wire types are the generated SDK's (D4). They are read off the `atlas` group of the generated client, so
// they follow the HttpApi declarations (task A08) whatever schema identifiers those use. Never hand-write these shapes.
type AtlasClient = DirectorySDK["client"]["atlas"]
export type AtlasCall = "snapshot" | "reasoning" | "own" | "health" | "promote" | "draft" | "emit" | "link" | "verify"
// A call's 200 payload.
export type AtlasOutput<K extends AtlasCall> = NonNullable<Awaited<ReturnType<AtlasClient[K]>>["data"]>
// A call's parameters without the routing query; the transport adds the directory.
export type AtlasInput<K extends AtlasCall> = Omit<NonNullable<Parameters<AtlasClient[K]>[0]>, "directory" | "workspace">
// D3: the snapshot is extract.py's object minus `reasoning`; D5: an absent store answers { state: "empty" } instead.
export type AtlasSnapshot = Exclude<AtlasOutput<"snapshot">, { state: "empty" }>
export type AtlasSnapshotFact = AtlasSnapshot["facts"][number]

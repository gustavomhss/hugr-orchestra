export * as ResearchToolkit from "./index"

import path from "path"
import { Context, Effect } from "effect"
import { Global } from "../global"
import type { BackendToolkit } from "../backend-toolkit/index"
import type { Engine } from "../backend-toolkit/manifest"

// J6: the discovery seat's pinned engines on the BackendToolkit lifecycle, with research Root and Manifest supplied.
// F0 freezes the signatures; K1 implements them by generalizing BackendToolkit over the engine id.

/** scip-go and rust-analyzer join after the benchmark gate (X6). */
export type ResearchEngineId = "scip-typescript" | "scip-python" | "typescript"

export type Language = "ts" | "js" | "py" | "go" | "rust"

/** A research engine file; it carries its own fit and never touches the backend Pack's entry skills. */
export type ResearchPack = Engine<string> & {
  readonly fit: { readonly role: "indexer" | "oracle"; readonly languages: ReadonlyArray<Language> }
}

export type State = { readonly engine: ResearchEngineId; readonly version: string } & BackendToolkit.EngineState

/** Owner caps (D2, 2026-10-18) and the index disk budget (J2.4); config `research.limits.*` may lower them. */
export const Limits = Object.freeze({
  indexerBytes: 2 * 1024 * 1024 * 1024,
  probeBytes: 1024 * 1024 * 1024,
  scratchBytes: 2 * 1024 * 1024 * 1024,
  indexBytes: 4 * 1024 * 1024 * 1024,
  indexCommits: 8,
  shardTimeoutMs: 15 * 60_000,
})

export const Root = Context.Reference<string>("@orchestra/ResearchToolkit/Root", {
  defaultValue: () => process.env.RESEARCH_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "research-toolkit"),
})

/** The same verbs as BackendToolkit, over the research manifest. */
export const status: (id?: ResearchEngineId) => Effect.Effect<ReadonlyArray<State>> = () => Effect.die("not implemented")

export const ensure: (id: ResearchEngineId) => Effect.Effect<{ readonly executable: string }, BackendToolkit.NotReady> = () =>
  Effect.die("not implemented")

export const prefetch: (ids?: ReadonlyArray<ResearchEngineId>) => Effect.Effect<ReadonlyArray<State>> = () =>
  Effect.die("not implemented")

/** Background warm-up: ensures the packs of present languages and builds the current commit's shards; never blocks. */
export const prewarm: (worktree: string) => Effect.Effect<void> = () => Effect.die("not implemented")

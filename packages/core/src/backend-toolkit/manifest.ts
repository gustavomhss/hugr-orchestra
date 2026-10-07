export * as BackendToolkitManifest from "./manifest"

import type { PinnedArtifact } from "../pinned-artifact"
import type { TargetId } from "./target"
import { ENGINES } from "./packs"
import go from "./runtimes/go"
import java from "./runtimes/java"
import node from "./runtimes/node"
import python from "./runtimes/python"
import rust from "./runtimes/rust"

// Ruling M6-1: every engine is one pack file under `packs/`, listed once in `packs/index.ts`; its id is the key.
export { ENGINES }

export type EngineId = keyof typeof ENGINES

export type RuntimeId = "node" | "java" | "python" | "go" | "rust"

export const RUNTIMES: Readonly<Record<RuntimeId, Runtime>> = { node, java, python, go, rust }

/** The entry skills a pack's recipe serves. */
export type EntrySkill =
  | "backend-implement"
  | "backend-api"
  | "backend-data"
  | "backend-concurrency"
  | "backend-refactor"
  | "backend-check"

/** One engine file: its pinned engine data plus where it fits in the backend specialist's work (ruling M6-1). */
export type Pack = Engine<string> & {
  readonly fit: {
    /** A generator writes artifacts from an input; a check reads one and reports. */
    readonly role: "generator" | "check"
    /** What the packet supplies, e.g. "an OpenAPI v3 description". */
    readonly input: string
    /** Entry skills whose work the engine serves; empty for a host-side engine with no recipe. */
    readonly skills: ReadonlyArray<EntrySkill>
  }
}

/** A private interpreter shared by every hosted engine that names it (ruling M4-1). */
export type Runtime = {
  readonly id: RuntimeId
  readonly version: string
  readonly license: string
  readonly upstream: string
  /** Per target: the pinned archive and the install-relative interpreter, e.g. `bin/node` or `python.exe`. */
  readonly targets: Readonly<
    Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>
  >
}

/** An engine that runs on a private runtime; every byte of its own install is pinned. */
export type HostedEngine<Id extends string = EngineId> = {
  readonly id: Id
  readonly version: string
  readonly license: string
  readonly upstream: string
  /** Launcher environment; values may use `{install}` and `{runtime}`. */
  readonly env?: Readonly<Record<string, string>>
  readonly runtime: RuntimeId
  /**
   * `npm`: `npm ci --ignore-scripts` with the runtime's bundled npm over a lockfile carrying an integrity for every
   * package. `pip`: `pip install --require-hashes --no-deps --only-binary=:all:` over a hash list covering every target.
   * `jar`: the raw jar. `source` (ruling M5-1): the upstream source archive, whose entries must lay the source root at
   * `src`, built by the runtime toolchain; go's `path` is the package dir inside the module, cargo's the crate dir.
   */
  readonly install:
    | { readonly kind: "npm"; readonly packageJson: string; readonly lock: string }
    | { readonly kind: "pip"; readonly requirements: string }
    | { readonly kind: "jar"; readonly artifact: PinnedArtifact.Artifact }
    | {
        readonly kind: "source"
        readonly artifact: PinnedArtifact.Artifact
        readonly build: "go" | "cargo"
        readonly path: string
        /** The built executable's name without `.exe`. */
        readonly binary: string
        /** Cargo only. */
        readonly features?: ReadonlyArray<string>
      }
  /**
   * Arguments after the runtime interpreter; `{install}` and `{runtime}` expand to the two install directories. Empty
   * for a `source` engine, whose launcher runs the built binary.
   */
  readonly launch: ReadonlyArray<string>
  /** Targets the engine cannot be made ready on, with the reason, e.g. `needs-msvc-linker`. */
  readonly unsupported?: Readonly<Partial<Record<TargetId, string>>>
}

export type Engine<Id extends string = EngineId> = NativeEngine<Id> | HostedEngine<Id>

export type NativeEngine<Id extends string = EngineId> = {
  readonly id: Id
  readonly version: string
  /** SPDX identifier of the upstream license. */
  readonly license: string
  /** Upstream `owner/repo`. */
  readonly upstream: string
  /** Child-scoped environment for every invocation of the engine. */
  readonly env?: Readonly<Record<string, string>>
  /** Per target: the pinned download and the install-relative executable it provides. */
  readonly targets: Readonly<
    Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>
  >
}

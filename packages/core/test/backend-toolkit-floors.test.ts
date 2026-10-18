import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget, type Host } from "../src/backend-toolkit/target"
import { it } from "./lib/effect"

const linux: Host = { platform: "linux", arch: "x64", musl: false, rosetta: false, avx2: true, kernel: "6.8.0", glibc: "2.35" }
const mac: Host = { platform: "darwin", arch: "arm64", musl: false, rosetta: false, avx2: false, kernel: "24.3.0" }
const win: Host = { platform: "win32", arch: "x64", musl: false, rosetta: false, avx2: true, kernel: "10.0.19045" }

describe("below", () => {
  test.each([
    [linux, "linux-x64", { glibc: "2.34" }, undefined],
    [{ ...linux, glibc: "2.34" }, "linux-x64", { glibc: "2.34" }, undefined],
    [{ ...linux, glibc: "2.31" }, "linux-x64", { glibc: "2.34" }, "glibc-below-2.34"],
    // Numeric, not lexical: 2.9 is older than 2.34 and 2.100 is newer.
    [{ ...linux, glibc: "2.9" }, "linux-x64", { glibc: "2.34" }, "glibc-below-2.34"],
    [{ ...linux, glibc: "2.100" }, "linux-x64", { glibc: "2.34" }, undefined],
    [{ ...linux, glibc: undefined }, "linux-x64", { glibc: "2.34" }, undefined],
    [mac, "darwin-arm64", { macos: "12.0" }, undefined],
    [{ ...mac, kernel: "21.6.0" }, "darwin-arm64", { macos: "12.0" }, undefined],
    [{ ...mac, kernel: "20.6.0" }, "darwin-arm64", { macos: "12.0" }, "macos-below-12"],
    [{ ...mac, kernel: "20.6.0" }, "darwin-arm64", { macos: "11.0" }, undefined],
    [{ ...mac, kernel: "19.6.0" }, "darwin-x64", { macos: "10.12" }, undefined],
    // macOS 26 is Darwin 25, not Darwin 35.
    [{ ...mac, kernel: "25.0.0" }, "darwin-arm64", { macos: "26.0" }, undefined],
    [{ ...mac, kernel: "24.6.0" }, "darwin-arm64", { macos: "26.0" }, "macos-below-26"],
    [win, "win32-x64", { windows: "10.0" }, undefined],
    [{ ...win, kernel: "10.0.17134" }, "win32-x64", { windows: "10.0.17763" }, "windows-below-10.0.17763"],
    [{ ...win, kernel: "10.0.17763" }, "win32-x64", { windows: "10.0.17763" }, undefined],
    // A cross-target prefetch is described by another platform's host; its floors do not apply.
    [{ ...linux, glibc: "2.17" }, "darwin-arm64", { glibc: "2.34", macos: "12.0" }, undefined],
    [{ ...mac, kernel: "20.6.0" }, "linux-x64", { glibc: "2.34", macos: "12.0" }, undefined],
    [{ ...linux, glibc: "2.17" }, "linux-x64", undefined, undefined],
  ] as ReadonlyArray<readonly [Host, BackendToolkitTarget.TargetId, BackendToolkitTarget.Floor | undefined, string | undefined]>)(
    "%o on %s needing %o",
    (host, target, floor, expected) => {
      expect(BackendToolkitTarget.below(host, target, floor)).toBe(expected)
    },
  )
})

describe("recorded floors", () => {
  const shape = /^\d+(\.\d+){1,2}$/
  const owners = [
    ...Object.values(BackendToolkitManifest.RUNTIMES),
    ...Object.values<BackendToolkitManifest.Pack>(BackendToolkitManifest.ENGINES).filter((pack) => "targets" in pack),
  ]

  test("every runtime and downloaded binary records a floor for every target", () => {
    expect(owners.length).toBeGreaterThan(10)
    expect(
      owners.flatMap((owner) => BackendToolkitTarget.TARGETS.filter((target) => !owner.floor?.[target]).map((target) => `${owner.id}:${target}`)),
    ).toEqual([])
  })

  test("recorded values are version numbers on the dimension of their target", () => {
    const wrong = [...owners, BackendToolkitManifest.ENGINES.orval, BackendToolkitManifest.ENGINES["datamodel-codegen"]].flatMap((owner) =>
      Object.entries(owner.floor ?? {}).flatMap(([target, floor]) => {
        const allowed = target.startsWith("linux") ? ["glibc"] : target.startsWith("darwin") ? ["macos"] : ["windows"]
        return Object.entries(floor)
          .filter(([key, value]) => !allowed.includes(key) || !shape.test(value))
          .map(([key, value]) => `${owner.id}:${target}:${key}=${value}`)
      }),
    )
    expect(wrong).toEqual([])
  })

  // The measured table (docs/specs/backend-specialist/toolkit-floors.md): the highest requirements, by the binary that sets them.
  test("measured highs are recorded", () => {
    const { ENGINES, RUNTIMES } = BackendToolkitManifest
    expect(ENGINES["ast-grep"].floor["linux-x64"]).toEqual({ glibc: "2.34" })
    expect(ENGINES.squawk.floor["linux-arm64"]).toEqual({ glibc: "2.34" })
    expect(ENGINES["postgres-language-server"].floor["linux-x64"]).toEqual({ glibc: "2.34" })
    expect(ENGINES.sqlc.floor["darwin-x64"]).toEqual({ macos: "12.0" })
    expect(RUNTIMES.go.floor?.["darwin-arm64"]).toEqual({ macos: "12.0" })
    expect(RUNTIMES.node.floor?.["linux-x64"]).toEqual({ glibc: "2.28" })
  })
})

// Refusals happen before any fetch, so these run the real manifest with no network and an empty cache root.
const scoped =
  (target: BackendToolkitTarget.TargetId, machine: Host) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.provideService(BackendToolkit.Root, path.join(tmpdir(), "backend-toolkit-floors-unused")),
      Effect.provideService(BackendToolkit.Target, { target }),
      Effect.provideService(BackendToolkit.Machine, machine),
    )

const state = (engine: BackendToolkitManifest.EngineId, target: BackendToolkitTarget.TargetId, machine: Host) =>
  BackendToolkit.status(engine).pipe(
    scoped(target, machine),
    Effect.map(([item]) => (item?.status === "unsupported" ? item.reason : item?.status)),
  )

const refused = (engine: BackendToolkitManifest.EngineId, target: BackendToolkitTarget.TargetId, machine: Host) =>
  Effect.gen(function* () {
    const reason = yield* BackendToolkit.ensure(engine).pipe(scoped(target, machine), Effect.flip, Effect.map((error) => error.reason))
    return { reason, state: yield* state(engine, target, machine) }
  })

describe("ensure refuses a host below the engine's measured floor", () => {
  it.live("a binary's own glibc floor names the engine", () =>
    Effect.gen(function* () {
      expect(yield* refused("ast-grep", "linux-x64", { ...linux, glibc: "2.31" })).toEqual({
        reason: "unsupported-target:ast-grep:glibc-below-2.34",
        state: "glibc-below-2.34",
      })
    }),
  )

  it.live("a host that meets the floor is not refused", () =>
    Effect.gen(function* () {
      expect(yield* state("ast-grep", "linux-x64", { ...linux, glibc: "2.34" })).toBe("absent")
      expect(yield* state("ast-grep", "linux-arm64", { ...linux, arch: "arm64", glibc: "2.31" })).toBe("absent")
      expect(yield* state("sqlc", "darwin-arm64", mac)).toBe("absent")
    }),
  )

  it.live("macOS names the major from the Darwin kernel", () =>
    Effect.gen(function* () {
      expect(yield* refused("sqlc", "darwin-arm64", { ...mac, kernel: "20.6.0" })).toEqual({
        reason: "unsupported-target:sqlc:macos-below-12",
        state: "macos-below-12",
      })
    }),
  )

  it.live("a hosted engine inherits its runtime's floor", () =>
    Effect.gen(function* () {
      expect(yield* refused("orval", "linux-x64", { ...linux, glibc: "2.27" })).toEqual({
        reason: "unsupported-target:orval:glibc-below-2.28",
        state: "glibc-below-2.28",
      })
    }),
  )

  it.live("an engine inherits the floor of its owned dependency's runtime", () =>
    Effect.gen(function* () {
      expect(BackendToolkitManifest.ENGINES.buf.dependencies).toContain("protoc-gen-es")
      expect((yield* refused("buf", "linux-x64", { ...linux, glibc: "2.27" })).reason).toBe("unsupported-target:buf:glibc-below-2.28")
    }),
  )

  it.live("a source engine inherits its toolchain's floor", () =>
    Effect.gen(function* () {
      expect(yield* refused("ogen", "darwin-x64", { ...mac, arch: "x64", kernel: "20.6.0" })).toEqual({
        reason: "unsupported-target:ogen:macos-below-12",
        state: "macos-below-12",
      })
    }),
  )
})

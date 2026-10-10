import { describe, expect } from "bun:test"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer, Sink, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { AppProcess } from "@orchestra/core/process"
import { testEffect } from "../lib/effect"

const methods: Installation.Method[] = ["curl", "npm", "yarn", "pnpm", "bun", "brew", "scoop", "choco", "unknown"]

// Records every process the Installation service spawns. Each spawn exits 0 with empty output.
function recordingLayer() {
  const spawns: string[] = []
  const spawner = ChildProcessSpawner.make((command) => {
    spawns.push(ChildProcess.isStandardCommand(command) ? [command.command, ...command.args].join(" ") : "piped")
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  const spawnerNode = makeGlobalNode({
    service: ChildProcessSpawner.ChildProcessSpawner,
    layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
    deps: [],
  })
  // Classification uses a recording spawner, not the native collection fast path or a real package manager.
  const processNode = makeGlobalNode({ service: AppProcess.Service, layer: AppProcess.layerWith("off"), deps: [spawnerNode] })
  return { spawns, layer: LayerNode.compile(Installation.node, [[CrossSpawnSpawner.node, spawnerNode], [AppProcess.node, processNode]]) }
}

describe("installation", () => {
  const latest = recordingLayer()
  testEffect(latest.layer).effect("latest() reports the running version for every method without spawning", () =>
    Effect.gen(function* () {
      expect(yield* Installation.use.latest()).toBe(InstallationVersion)
      for (const method of methods) expect(yield* Installation.use.latest(method)).toBe(InstallationVersion)
      expect(latest.spawns).toEqual([])
    }),
  )

  const info = recordingLayer()
  testEffect(info.layer).effect("info() reports no newer version", () =>
    Effect.gen(function* () {
      expect(yield* Installation.use.info()).toEqual({ version: InstallationVersion, latest: InstallationVersion })
      expect(info.spawns).toEqual([])
    }),
  )

  const upgrade = recordingLayer()
  testEffect(upgrade.layer).effect("upgrade() is disabled for every method without spawning", () =>
    Effect.gen(function* () {
      for (const method of methods) {
        const error = yield* Effect.flip(Installation.use.upgrade(method, "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe(Installation.UPGRADE_DISABLED_MESSAGE)
        expect(error.message).toBe(Installation.UPGRADE_DISABLED_MESSAGE)
      }
      expect(upgrade.spawns).toEqual([])
    }),
  )

  // Positive control: proves the recorder sees spawns, so the empty lists above are meaningful.
  const method = recordingLayer()
  testEffect(method.layer).effect("method() still detects the install method through the spawner", () =>
    Effect.gen(function* () {
      const detected = yield* Installation.use.method()
      expect(methods).toContain(detected)
      if (detected === "curl") return
      expect(method.spawns).toContain("npm list -g --depth=0")
    }),
  )
})

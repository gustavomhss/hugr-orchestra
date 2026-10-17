import { describe, expect, test } from "bun:test"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer, Sink, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Global } from "@orchestra/core/global"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { AppProcess } from "@orchestra/core/process"
import { testEffect } from "../lib/effect"

const methods: Installation.Method[] = ["curl", "npm", "yarn", "pnpm", "bun", "brew", "scoop", "choco", "desktop", "unknown"]

// Records every process the Installation service spawns. Each spawn exits 0 with empty output.
type Fake = {
  // Output of the spawned command, keyed by its joined argv.
  stdout?: (command: string) => string
  exitCode?: number
  stderr?: string
  // Body of the GitHub releases reply; undefined fails the request.
  release?: unknown
}

function recordingLayer(fake: Fake = {}) {
  const requests: string[] = []
  const spawns: string[] = []
  const directories: (string | undefined)[] = []
  const spawner = ChildProcessSpawner.make((command) => {
    spawns.push(ChildProcess.isStandardCommand(command) ? [command.command, ...command.args].join(" ") : "piped")
    directories.push(ChildProcess.isStandardCommand(command) ? command.options.cwd : undefined)
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(fake.exitCode ?? 0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode(fake.stdout?.(spawns[spawns.length - 1]) ?? "")),
        stderr: Stream.make(new TextEncoder().encode(fake.stderr ?? "")),
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
  const httpNode = makeGlobalNode({
    service: HttpClient.HttpClient,
    layer: Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        requests.push(request.url)
        if (fake.release === undefined) return Effect.die("offline")
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response(JSON.stringify(fake.release), { status: 200 })),
        )
      }),
    ),
    deps: [],
  })
  return {
    spawns,
    directories,
    requests,
    layer: LayerNode.compile(Installation.node, [
      [CrossSpawnSpawner.node, spawnerNode],
      [AppProcess.node, processNode],
      [LayerNodePlatform.httpClient, httpNode],
    ]),
  }
}

describe("installation", () => {
  const latest = recordingLayer({ release: { tag_name: "v9.9.9" } })
  testEffect(latest.layer).effect("latest() reads the Orchestra GitHub release without spawning", () =>
    Effect.gen(function* () {
      expect(yield* Installation.use.latest()).toBe("9.9.9")
      expect(yield* Installation.use.latest("npm")).toBe("9.9.9")
      expect(yield* Installation.use.info()).toEqual({ version: InstallationVersion, latest: "9.9.9" })
      expect(latest.requests[0]).toBe("https://api.github.com/repos/gustavomhss/hugr-orchestra/releases/latest")
      expect(latest.spawns).toEqual([])
    }),
  )

  const offline = recordingLayer()
  testEffect(offline.layer).effect("latest() falls back to the running version when the lookup fails", () =>
    Effect.gen(function* () {
      expect(yield* Installation.use.latest()).toBe(InstallationVersion)
    }),
  )

  const commands = recordingLayer()
  testEffect(commands.layer).effect("upgrade() runs the package manager command for the method in the state directory", () =>
    Effect.gen(function* () {
      for (const method of ["npm", "pnpm", "bun", "yarn", "brew"] as const)
        yield* Installation.use.upgrade(method, "9.9.9")
      expect(commands.spawns).toEqual([
        "npm install -g @hugr/cli@9.9.9",
        "pnpm add -g @hugr/cli@9.9.9",
        "bun add -g @hugr/cli@9.9.9",
        "yarn global add @hugr/cli@9.9.9",
        "brew upgrade gustavomhss/tap/orchestra",
      ])
      expect(commands.directories.every((directory) => directory === Global.Path.state)).toBe(true)
    }),
  )

  const failing = recordingLayer({ exitCode: 1, stderr: "EACCES" })
  testEffect(failing.layer).effect("upgrade() reports the command's stderr on a non-zero exit", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Installation.use.upgrade("npm", "9.9.9"))
      expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
      expect(error.stderr).toBe("EACCES")
    }),
  )

  const refused = recordingLayer()
  testEffect(refused.layer).effect("upgrade() refuses with an instruction, without spawning, for the other methods", () =>
    Effect.gen(function* () {
      for (const method of ["curl", "desktop", "scoop", "choco", "unknown"] as const) {
        const error = yield* Effect.flip(Installation.use.upgrade(method, "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr.length).toBeGreaterThan(0)
      }
      expect((yield* Effect.flip(Installation.use.upgrade("curl", "9.9.9"))).stderr).toContain("install.sh")
      expect((yield* Effect.flip(Installation.use.upgrade("desktop", "9.9.9"))).stderr).toContain("desktop app")
      expect((yield* Effect.flip(Installation.use.upgrade("unknown", "9.9.9"))).stderr).toContain("paru -Syu orchestra-bin")
      expect(refused.spawns).toEqual([])
    }),
  )

  test("isDesktopBundle() recognises the app bundle's CLI directory on both platforms", () => {
    expect(Installation.isDesktopBundle("/Applications/Orchestra.app/Contents/Resources/cli/orchestra")).toBe(true)
    expect(Installation.isDesktopBundle("C:\\Orchestra\\resources\\cli\\orchestra.exe")).toBe(true)
    expect(Installation.isDesktopBundle("/opt/HuGR Orchestra/resources/cli/orchestra")).toBe(true)
    expect(Installation.isDesktopBundle("/usr/local/bin/orchestra")).toBe(false)
  })

  const detect = recordingLayer({ stdout: (command) => (command === "pnpm list -g --depth=0" ? "@hugr/cli 1.0.0" : "orchestra-ai 1.0.0") })
  testEffect(detect.layer).effect("method() matches the @hugr/cli package name, not the old one", () =>
    Effect.gen(function* () {
      const detected = yield* Installation.use.method()
      if (detected === "curl" || detected === "desktop") return
      expect(detected).toBe("pnpm")
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

  // The probes run package managers, which execute project files from their cwd (yarn's .yarnrc yarn-path, pnpm's
  // packageManager, bunfig.toml). The process cwd is the workspace, so every probe runs in Orchestra's own state directory.
  const probes = recordingLayer()
  testEffect(probes.layer).effect("method() probes package managers outside the workspace", () =>
    Effect.gen(function* () {
      if ((yield* Installation.use.method()) === "curl") return
      expect(probes.spawns).toContain("yarn global list")
      expect(probes.directories.every((directory) => directory === Global.Path.state)).toBe(true)
    }),
  )
})

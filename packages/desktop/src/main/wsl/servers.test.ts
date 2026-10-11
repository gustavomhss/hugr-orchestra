import { expect, test } from "bun:test"
import { clearWslDistroState, requireWslIpcString, requireWslIpcStrings, wslTerminalArgs } from "./policy"
import { pendingRestartAfterWslInstall, pollWslHealth, wslServerIdsToStartOnInitialize } from "./startup"
import { createWslServersController, type WslServerConfig } from "./servers"
import { WslArtifactError } from "./artifact"
import { nativeT } from "../native-translations"

let persistedServers: WslServerConfig[] = []
let releaseOrchestraResolve: (() => void) | undefined

test("starts every configured WSL server on initialization", () => {
  expect(
    wslServerIdsToStartOnInitialize([
      { id: "wsl:Debian", distro: "Debian" },
      { id: "wsl:Ubuntu-24.04", distro: "Ubuntu-24.04" },
    ]),
  ).toEqual(["wsl:Debian", "wsl:Ubuntu-24.04"])
})

test("installs owned WSL artifact and checks descriptor version after admission", async () => {
  persistedServers = []
  const installed: string[] = []
  const options = {
    ...testControllerOptions(),
    installArtifact: async (distro: string, opts: { signal?: AbortSignal }) => {
      expect(opts.signal?.aborted).toBe(false)
      installed.push(distro)
    },
    resolveOrchestra: async () => "/home/me/.orchestra/bin/orchestra",
  }
  const controller = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), options)

  await controller.installServer("Debian")
  expect(controller.getState().job).toBeNull()
  expect(installed).toEqual(["Debian"])
  expect(controller.getState().orchestraChecks.Debian?.matchesDesktop).toBe(true)
  expect(controller.getState().orchestraChecks.Debian?.expectedVersion).toBe("1.16.2")
})

test("clears cached distro probes when removing a WSL server", () => {
  expect(
    clearWslDistroState(
      { Debian: { name: "Debian", canExecute: true, hasBash: true, error: null } },
      {
        Debian: {
          distro: "Debian",
          resolvedPath: "/home/luke/.orchestra/bin/orchestra",
          version: "1.16.2",
          expectedVersion: "1.16.2",
          matchesDesktop: true,
          error: null,
        },
      },
      "Debian",
    ),
  ).toEqual({ distroProbes: {}, orchestraChecks: {} })
})

test("opens terminals for distro names containing spaces", () => {
  expect(wslTerminalArgs("Ubuntu Preview")).toEqual(["/c", "start", "", "wsl", "-d", "Ubuntu Preview"])
})

test("stops health polling when sidecar startup settles", async () => {
  const abort = new AbortController()
  let checks = 0
  const polling = pollWslHealth(
    async () => {
      checks++
      return false
    },
    abort.signal,
    1,
  )

  await new Promise((resolve) => setTimeout(resolve, 5))
  abort.abort()
  await polling
  const settled = checks
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(checks).toBe(settled)
})

test("validates WSL IPC identifiers at the module boundary", () => {
  expect(requireWslIpcString("distro", "Debian")).toBe("Debian")
  expect(requireWslIpcStrings("distro", ["Debian", "Ubuntu"])).toEqual(["Debian", "Ubuntu"])
  expect(() => requireWslIpcString("distro", "")).toThrow("Invalid distro")
  expect(() => requireWslIpcString("server id", undefined)).toThrow("Invalid server id")
  expect(() => requireWslIpcStrings("distro", [])).toThrow("Invalid distro")
})

test("derives a required Windows restart from the post-install runtime probe", () => {
  expect(pendingRestartAfterWslInstall({ available: false, version: null, error: "WSL unavailable" })).toBe(true)
  expect(pendingRestartAfterWslInstall({ available: true, version: "WSL version: 2.6.1", error: null })).toBe(false)
})

test("ignores stale background Orchestra checks after removing a WSL server", async () => {
  persistedServers = []
  releaseOrchestraResolve = undefined
  const controller = createWslServersController(
    "1.16.2",
    async () => ({
      listener: {
        stop: () => undefined,
        onExit: () => undefined,
      },
      url: "http://127.0.0.1:4096",
      username: "orchestra",
      password: "secret",
    }),
    testControllerOptions(),
  )

  await controller.addServer("Debian")
  await waitFor(() => !!releaseOrchestraResolve)
  await controller.removeServer("wsl:Debian")
  releaseOrchestraResolve?.()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(controller.getState().servers).toEqual([])
  expect(controller.getState().orchestraChecks).toEqual({})
})

test("ignores stale startup Orchestra checks after removing a WSL server", async () => {
  persistedServers = [{ id: "wsl:Debian", distro: "Debian" }]
  releaseOrchestraResolve = undefined
  const controller = createWslServersController(
    "1.16.2",
    async () => new Promise<never>(() => undefined),
    testControllerOptions(),
  )

  await controller.initialize()
  await waitFor(() => !!releaseOrchestraResolve)
  await controller.removeServer("wsl:Debian")
  releaseOrchestraResolve?.()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(controller.getState().servers).toEqual([])
  expect(controller.getState().orchestraChecks).toEqual({})
})

test("probes addable distros in parallel before checking Orchestra", async () => {
  persistedServers = []
  const started: string[] = []
  const release = new Map<string, () => void>()
  const orchestra: string[] = []
  const controller = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), {
    ...testControllerOptions(),
    probeDistro: async (distro) => {
      started.push(distro)
      await new Promise<void>((resolve) => release.set(distro, resolve))
      return { name: distro, canExecute: true, hasBash: true, error: null }
    },
    resolveOrchestra: async (distro) => {
      orchestra.push(distro)
      return "/home/me/.orchestra/bin/orchestra"
    },
  })

  const task = controller.probeAddable(["Debian", "Ubuntu"])
  await waitFor(() => started.length === 2)
  expect(started).toEqual(["Debian", "Ubuntu"])
  expect(orchestra).toEqual([])
  release.get("Debian")?.()
  release.get("Ubuntu")?.()
  await task

  expect(Object.keys(controller.getState().distroProbes)).toEqual(["Debian", "Ubuntu"])
  expect(orchestra).toEqual(["Debian", "Ubuntu"])
  expect(Object.keys(controller.getState().orchestraChecks)).toEqual(["Debian", "Ubuntu"])
})

test("does not check Orchestra in addable distros that cannot execute commands", async () => {
  persistedServers = []
  const orchestra: string[] = []
  const controller = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), {
    ...testControllerOptions(),
    probeDistro: async (distro) => ({
      name: distro,
      canExecute: distro === "Debian",
      hasBash: distro === "Debian",
      error: distro === "Debian" ? null : "Open Ubuntu once to finish setup",
    }),
    resolveOrchestra: async (distro) => {
      orchestra.push(distro)
      return "/home/me/.orchestra/bin/orchestra"
    },
  })

  await controller.probeAddable(["Debian", "Ubuntu"])

  expect(Object.keys(controller.getState().distroProbes)).toEqual(["Debian", "Ubuntu"])
  expect(orchestra).toEqual(["Debian"])
  expect(Object.keys(controller.getState().orchestraChecks)).toEqual(["Debian"])
})

test("a guest CLI from another desktop build is a server to update, and other distros keep their checks", async () => {
  persistedServers = []
  const installed = "/home/me/.orchestra/bin/orchestra"
  const controller = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), {
    ...testControllerOptions(),
    probeDistro: async (distro) => ({ name: distro, canExecute: true, hasBash: true, error: null }),
    resolveOrchestra: async () => installed,
    // Admission refuses an install whose bytes differ from this desktop's bundle, as after every desktop update.
    readCommandVersion: async (_command, distro) => {
      if (distro === "Debian") throw new WslArtifactError("bytes")
      if (distro === "Alpine") throw new WslArtifactError("abi")
      return "1.16.2"
    },
  })

  await controller.probeAddable(["Debian", "Ubuntu", "Alpine"])

  expect(controller.getState().job).toBeNull()
  expect(controller.getState().orchestraChecks).toEqual({
    Debian: { distro: "Debian", resolvedPath: installed, version: null, expectedVersion: "1.16.2", matchesDesktop: false, error: null },
    Ubuntu: { distro: "Ubuntu", resolvedPath: installed, version: "1.16.2", expectedVersion: "1.16.2", matchesDesktop: true, error: null },
    Alpine: {
      distro: "Alpine", resolvedPath: installed, version: null, expectedVersion: "1.16.2", matchesDesktop: null,
      error: nativeT("desktop.wsl.error.serverCannotRun"),
    },
  })
})

test("one distro whose check fails does not sink the addable probe batch", async () => {
  persistedServers = []
  const errors: unknown[] = []
  const controller = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), {
    ...testControllerOptions(),
    logger: { log: () => undefined, error: (_message, meta) => errors.push(meta) },
    probeDistro: async (distro) => ({ name: distro, canExecute: true, hasBash: true, error: null }),
    resolveOrchestra: async (distro) => {
      if (distro === "Debian") throw new Error("wsl.exe timed out")
      return "/home/me/.orchestra/bin/orchestra"
    },
  })

  await controller.probeAddable(["Debian", "Ubuntu"])

  expect(controller.getState().job).toBeNull()
  expect(Object.keys(controller.getState().orchestraChecks)).toEqual(["Ubuntu"])
  expect(errors).toEqual([{ distro: "Debian", message: "wsl.exe timed out" }])
})

test("background checks record a stale guest server as one to update", async () => {
  const stale = {
    ...testControllerOptions(),
    resolveOrchestra: async () => "/home/me/.orchestra/bin/orchestra",
    readCommandVersion: async () => {
      throw new WslArtifactError("bytes")
    },
  }
  const sidecar = async () => ({
    listener: { stop: () => undefined, onExit: () => undefined },
    url: "http://127.0.0.1:4096",
    username: "orchestra",
    password: "secret",
  })
  // The refresh of every configured server at startup.
  persistedServers = [{ id: "wsl:Debian", distro: "Debian" }]
  const starting = createWslServersController("1.16.2", async () => new Promise<never>(() => undefined), stale)
  await starting.initialize()
  await waitFor(() => !!starting.getState().orchestraChecks.Debian)
  expect(starting.getState().orchestraChecks.Debian?.matchesDesktop).toBe(false)
  // The check after a server's sidecar is ready.
  persistedServers = []
  const adding = createWslServersController("1.16.2", sidecar, stale)
  await adding.addServer("Ubuntu")
  await waitFor(() => !!adding.getState().orchestraChecks.Ubuntu)
  expect(adding.getState().orchestraChecks.Ubuntu?.matchesDesktop).toBe(false)
  expect(adding.getState().orchestraChecks.Ubuntu?.resolvedPath).toBe("/home/me/.orchestra/bin/orchestra")
})

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("Timed out waiting for condition")
}

function testControllerOptions() {
  return {
    readServers: () => persistedServers,
    writeServers: (servers: WslServerConfig[]) => {
      persistedServers = servers
    },
    readCommandVersion: async () => "1.16.2",
    resolveOrchestra: async () => {
      await new Promise<void>((resolve) => {
        releaseOrchestraResolve = resolve
      })
      return "/home/me/.orchestra/bin/orchestra"
    },
  }
}

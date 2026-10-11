import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"
import { nativeCliTarget, verifyCliArtifact } from "../src/main/cli-artifacts"
import { installElectron } from "./install-electron"

test("owned native CLI authenticates through Electron without changing workspace dependency paths", async () => {
  if (!process.env.RUNNER_OS) throw new Error("Native artifact integration requires Actions")
  const desktop = resolve(import.meta.dir, "..")
  const home = await mkdtemp(join(tmpdir(), "orchestra-native-integration-"))
  await Promise.all(
    ["state", "config", "data", "cache", "desktop", "desktop-data", "tmp"].map((name) => mkdir(join(home, name))),
  )
  await writeFile(join(home, "models.json"), "{}")
  const version = "1.18.27-w3-integration"
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(ORCHESTRA_|XDG_|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|RUST_TARGET$)/.test(key),
      ),
    ),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    XDG_STATE_HOME: join(home, "state"),
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    TMPDIR: join(home, "tmp"),
    TMP: join(home, "tmp"),
    TEMP: join(home, "tmp"),
    ORCHESTRA_TEST_HOME: home,
    ORCHESTRA_VERSION: version,
    ORCHESTRA_CHANNEL: "dev",
    ORCHESTRA_PURE: "1",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    MODELS_DEV_API_JSON: join(home, "models.json"),
  }
  const run = promisify(execFile)
  const directory = join(desktop, "resources/cli")
  const target = nativeCliTarget(process.platform, process.arch)
  const binary = join(directory, `orchestra-${target}${process.platform === "win32" ? ".exe" : ""}`)
  const require = createRequire(resolve(desktop, "../cli/package.json"))
  const dependencies = ["@effect/platform-node", "@orchestra/core/installation/version", "effect"]
  const paths = await Promise.all(dependencies.map((name) => realpath(require.resolve(name))))
  console.log(
    "Workspace dependency paths before native build",
    Object.fromEntries(dependencies.map((name, index) => [name, paths[index]])),
  )
  return run(
    process.execPath,
    [
      "--eval",
      `const { buildCliToResources } = await import("./scripts/utils.ts"); await buildCliToResources({ targets: [${JSON.stringify(target)}] })`,
    ],
    {
      cwd: desktop,
      env,
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  )
    .then(async () => {
      const installed = await Promise.all(dependencies.map((name) => realpath(require.resolve(name))))
      expect(installed).toEqual(paths)
      console.log(
        "Workspace dependency paths after native build",
        Object.fromEntries(dependencies.map((name, index) => [name, installed[index]])),
      )
      const artifact = await verifyCliArtifact(directory, target)
      expect(artifact.version).toBe(version)
      expect((await run(artifact.path, ["--version"], { env })).stdout.trim()).toBe(`orchestra v${version}`)
      await installElectron()
      const built = await Bun.build({
        entrypoints: [join(desktop, "src/main/background-cli.ts")],
        target: "node",
        format: "esm",
        external: ["electron"],
        outdir: join(desktop, "out/main"),
      })
      if (!built.success) throw new Error(`Background CLI bundle failed: ${built.logs.join("\n")}`)
      const worker = join(home, "electron-worker.mjs")
      await writeFile(
        worker,
        `
      import { app } from "electron";
      import { startBackgroundCli } from ${JSON.stringify(pathToFileURL(join(desktop, "out/main/background-cli.js")).href)};
      app.setPath("userData", ${JSON.stringify(join(home, "desktop"))});
      app.setPath("appData", ${JSON.stringify(join(home, "desktop-data"))});
      app.whenReady().then(async () => {
      console.log("isolated Electron ready");
      const service = await startBackgroundCli({ log() {}, error() {} }, ${JSON.stringify(join(home, "state"))});
      const headers = { authorization: "Basic " + Buffer.from("orchestra:" + service.password).toString("base64") };
      const good = await fetch(new URL("/api/health", service.url), { headers, signal: AbortSignal.timeout(10000) });
      if (good.status !== 200 || (await good.json()).healthy !== true) throw new Error("Authenticated health failed");
      const bad = await fetch(new URL("/api/health", service.url), { headers: { authorization: "Basic " + Buffer.from("orchestra:wrong").toString("base64") }, signal: AbortSignal.timeout(10000) });
      if (bad.status !== 401) throw new Error("Wrong credential was accepted");
      console.log("owned background service authenticated");
      app.exit(0);
      }).catch((error) => { console.error(error); app.exit(1); });
    `,
      )
      const electronDirectory = dirname(createRequire(import.meta.url).resolve("electron/package.json"))
      const electron = join(
        electronDirectory,
        "dist",
        (await readFile(join(electronDirectory, "path.txt"), "utf8")).trim(),
      )
      const command = process.platform === "linux" ? "xvfb-run" : electron
      const args = [...(process.platform === "linux" ? ["-a", electron] : []), "--no-sandbox", worker]
      expect((await run(command, args, { env, timeout: 60_000 })).stdout).toContain(
        "owned background service authenticated",
      )
      expect(JSON.parse(await readFile(join(home, "state/orchestra/server.json"), "utf8")).version).toBe(version)
    })
    .finally(async () => {
      const stop = await run(binary, ["service", "stop"], { env, timeout: 30_000 }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error
        },
      )
      await rm(home, { recursive: true, force: true })
      return stop
    })
}, 900_000)

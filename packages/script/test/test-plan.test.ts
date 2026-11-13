import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { appBrowserAnchors, balance, coreShards, desktopAnchors, desktopBins, desktopFiles, desktopIgnores, packageLanes, packageShards, plannedBins, shardCount, suiteTimes, weigh, type Timings } from "../src/test-plan.ts"

const registry: { modules: { kind: string; scope: string; name: string }[] } = JSON.parse(
  readFileSync(new URL("../../../script/module-registry.json", import.meta.url), "utf8"),
)

describe("test shard planner", () => {
  test("every core matrix entry uses the default eight-minute step", () => {
    for (const platform of ["linux", "windows"] as const) {
      const lanes = coreShards(platform, "fixture-host", 2)
      expect(lanes).toHaveLength(2)
      for (const lane of lanes) {
        expect("budget" in lane).toBe(false)
      }
    }
  })

  test("package filters cover each package once or its complete App, Desktop or Boundary partition and keep future packages in libs", () => {
    const packages = [...registry.modules.filter((entry) => entry.kind === "bun" && entry.scope === ".").map((entry) => entry.name), "@orchestra/future-package"]
    for (const [platform, host] of [["linux", "ubuntu-24.04"], ["windows", "windows-latest"]] as const) {
      const lanes = [
        { part: "core", filters: "--filter=@orchestra/core" },
        ...packageLanes(platform, host),
      ] as { part: string; filters?: string }[]
      for (const name of packages) {
        const selected = lanes.filter((lane) => {
          if (!lane.filters) return false
          const filters = lane.filters.split(" ").map((filter) => filter.slice("--filter=".length))
          const included = filters.filter((filter) => !filter.startsWith("!"))
          return (included.length === 0 || included.includes(name)) && !filters.includes(`!${name}`)
        }).map((lane) => lane.part)
        expect(selected).toHaveLength(name === "@orchestra/desktop" || platform === "windows" && name === "@orchestra/app" ? 4 : platform === "windows" && name === "@orchestra/atlas-boundary" ? 2 : platform === "windows" && name === "@orchestra/httpapi-codegen" ? 0 : 1)
        if (name === "@orchestra/script")
          expect(selected).toEqual([platform === "linux" ? "packages-libs" : `windows-${name.slice("@orchestra/".length)}`])
        if (name === "@orchestra/future-package") expect(selected).toEqual([platform === "linux" ? "packages-libs" : "windows-libs"])
      }
    }
  })

  test("dedicated lanes preserve package filters and partition Linux HttpApi", () => {
    const linux = packageLanes("linux", "ubuntu-24.04")
    expect(linux.map((lane) => lane.part)).toEqual([
      "packages-app", "packages-cli", "packages-atlas", "packages-relay", "packages-desktop-bun-1", "packages-desktop-bun-2", "packages-desktop-bun-3", "packages-desktop-node", "packages-libs", "gates", "httpapi-1", "httpapi-2", "sandbox",
    ])
    expect(linux.filter((lane) => "httpapi" in lane && lane.httpapi).map((lane) => "httpapiShard" in lane ? lane.httpapiShard : undefined)).toEqual(["1/2", "2/2"])
    const windows = packageLanes("windows", "windows-latest") as { part: string; filters?: string; budget?: number }[]
    expect(windows.filter((lane) => ["windows-script", "windows-libs"].includes(lane.part)).map((lane) => lane.budget)).toEqual([15, 15])
    const libs = windows.find((lane) => lane.part === "windows-libs")!
    expect(libs.filters).toContain("--filter=!@orchestra/desktop")
    expect(libs.filters).toContain("--filter=!@orchestra/script")
  })

  test("Desktop shards cover every discovered Bun file once, with a distinct real control on each OS", () => {
    const directory = fileURLToPath(new URL("../../../apps/desktop/", import.meta.url))
    const all = [...new Bun.Glob("**/*").scanSync({ cwd: directory, onlyFiles: true, followSymlinks: false })]
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => !file.split("/").includes("node_modules") && /(?:\.test|_test|\.spec|_spec)\.[jt]sx?$/.test(file)).toSorted()
    const files = desktopFiles()
    expect([...files.bun, ...files.node, ...files.excluded].toSorted()).toEqual(all)
    expect(files.node.length).toBeGreaterThan(0)
    expect(files.node.every((file) => file.startsWith("src/") && file.endsWith(".node.test.ts"))).toBe(true)
    expect(files.excluded).toEqual([
      "src/main/app-dock-live.test.ts", "src/main/app-dock-rpc.test.ts", "src/main/app-dock-security.test.ts",
      "src/main/app-dock-tools.test.ts", "src/main/app-dock-youtube.test.ts",
    ])
    expect(files.bun).toContain("electron-builder.config.test.ts")
    expect(files.bun).toContain("scripts/finalize-latest-yml.test.ts")
    expect(files.bun).toContain("test/live-plist.test.ts")
    expect(files.bun).toContain("src/renderer/html.test.ts")
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    for (const platform of ["linux", "windows"] as const) {
      const bins = desktopBins(timings, platform)
      expect(bins).toHaveLength(3)
      expect(packageShards(timings, "apps/desktop", platform)).toBe(3)
      expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(files.bun)
      expect(new Set(bins.flatMap((bin) => bin.names)).size).toBe(files.bun.length)
      expect(desktopBins(timings, platform)).toEqual(bins)
      for (const [index, bin] of bins.entries()) {
        expect(bin.names.filter((name) => desktopAnchors.includes(name))).toEqual([desktopAnchors[index]!])
        expect(readFileSync(new URL(`../../../apps/desktop/${desktopAnchors[index]}`, import.meta.url), "utf8")).toContain("expectSpawn(import.meta.path)")
      }
    }
  })

  test("Desktop exclusion parsing accepts current literals and fails closed on new syntax", () => {
    const config = readFileSync(new URL("../../../apps/desktop/bunfig.toml", import.meta.url), "utf8")
    expect(desktopIgnores(config)).toContain("src/**/*.node.test.ts")
    expect(() => desktopIgnores(config.replace('"src/**/*.node.test.ts"', '"src/**/*.test.ts"'))).toThrow("Unsupported Desktop exclusion pattern")
    expect(() => desktopIgnores(config.replace('"src/**/*.node.test.ts"', "NODE_TESTS"))).toThrow("Unsupported Desktop exclusion syntax")
    expect(() => desktopIgnores(`${config}\npathIgnorePatterns = []`)).toThrow()
    expect(() => desktopIgnores(config.replace(/\]\s*$/, "] + EXTRA"))).toThrow()
    expect(() => desktopIgnores(config.replace('"src/main/app-dock-live.test.ts",', '"src/main/app-dock-live.test.ts"'))).toThrow()
    expect(() => desktopIgnores(config.replace('"src/**/*.node.test.ts"', "'src/**/*.node.test.ts'"))).toThrow()
  })

  test("Desktop tasks preserve complete Node execution, package filtering and bounded scheduling", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../../apps/desktop/package.json", import.meta.url), "utf8"))
    expect(pkg.scripts.test).toBe("bun run test:bun && bun run test:node")
    expect(pkg.scripts["test:bun"]).toBe("bun test")
    expect(pkg.scripts["test:node"]).toBe('node --experimental-strip-types --test "src/**/*.node.test.ts"')
    for (const platform of ["linux", "windows"] as const) {
      const lanes = packageLanes(platform, "fixture-host") as { part: string; filters?: string; desktop?: string; desktopShard?: string; budget?: number }[]
      const desktop = lanes.filter((lane) => lane.desktop)
      expect(desktop.map((lane) => lane.desktop)).toEqual(["bun", "bun", "bun", "node"])
      expect(desktop.map((lane) => lane.desktopShard)).toEqual(["1/3", "2/3", "3/3", undefined])
      expect(desktop.every((lane) => lane.filters === "--filter=@orchestra/desktop" && lane.budget === undefined)).toBe(true)
      expect(lanes.find((lane) => lane.part.endsWith("libs"))?.filters).toContain("--filter=!@orchestra/desktop")
    }
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8")
    expect([...workflow.matchAll(/max-parallel: (\d+)/g)].map((match) => Number(match[1]))).toEqual([10, 5])
    expect(workflow).toContain("needs: [omni, plan]")
    expect(workflow).toContain('"${files[@]/#/./}" "${report[@]}"')
    const desktop = workflow.split('if [ -n "$DESKTOP" ]; then')[1]?.split("# Core is sharded")[0] ?? ""
    expect(desktop).not.toContain("ORCHESTRA_OMNI_CONTROL=declared")
    expect(desktop).not.toContain("--timeout")
    const turbo = JSON.parse(readFileSync(new URL("../../../turbo.json", import.meta.url), "utf8").replace(/^\s*\/\/[^\n]*/gm, ""))
    expect(turbo.$schema).toBe("https://v2-8-13.turborepo.dev/schema.json")
    expect(turbo.tasks["@orchestra/desktop#test:bun"]).toEqual(turbo.tasks["@orchestra/desktop#test"])
    expect(turbo.tasks["@orchestra/desktop#test:node"]).toEqual(turbo.tasks["@orchestra/desktop#test"])
  })

  test("Windows App browser bins retain all99 files and distinct real process controls", () => {
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    const directory = fileURLToPath(new URL("../../../packages/app-shell/test-browser/", import.meta.url))
    const files = [...new Bun.Glob("**/*").scanSync({ cwd: directory, onlyFiles: true, followSymlinks: false })]
      .map((file) => `test-browser/${file.replaceAll("\\", "/")}`)
      .filter((file) => /(?:\.test|_test|\.spec|_spec)\.[jt]sx?$/.test(file)).toSorted()
    const bins = plannedBins(timings, "packages/app-shell", "windows")
    expect(files).toHaveLength(99)
    expect(packageShards(timings, "packages/app-shell", "windows")).toBe(3)
    expect(packageShards(timings, "packages/app-shell", "linux")).toBe(1)
    expect(bins).toHaveLength(3)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(files)
    expect(new Set(bins.flatMap((bin) => bin.names)).size).toBe(files.length)
    expect(bins.flatMap((bin) => bin.names).filter((file) => file === "test-browser/model-execution-consumer.test.tsx")).toHaveLength(1)
    expect(plannedBins(timings, "packages/app-shell", "windows")).toEqual(bins)
    expect(appBrowserAnchors).toEqual(["test-browser/lean-chapter-route.test.ts", "test-browser/lean-native-product.test.ts", "test-browser/prompt-retry.test.ts"])
    for (const [index, bin] of bins.entries()) {
      expect(bin.names.filter((file) => appBrowserAnchors.includes(file))).toEqual([appBrowserAnchors[index]!])
      expect(readFileSync(new URL(`../../../packages/app-shell/${appBrowserAnchors[index]}`, import.meta.url), "utf8")).toContain("expectSpawn(import.meta.path)")
    }
    const evidence = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")).provenance["packages/app-shell"]
    expect(evidence.observedFiles).toBe(99)
    expect(evidence.observedTopLevelCases).toBe(644)
    expect(evidence.nestedPrintedOutcomesNotTopLevelCases).toBe(700)
    expect(evidence.observedTopLevelPass + evidence.observedTopLevelFail).toBe(evidence.observedTopLevelCases)
  })

  test("Windows App uses its exact unit task and direct browser wrapper without a whole-directory argument", () => {
    const lanes = packageLanes("windows", "fixture-host") as { part: string; filters?: string; appMode?: string; appBrowserShard?: string; turbo?: boolean; budget?: number }[]
    const app = lanes.filter((lane) => lane.appMode)
    expect(app.map((lane) => [lane.part, lane.appMode, lane.appBrowserShard])).toEqual([
      ["windows-app-unit", "unit", undefined], ["windows-app-browser-1", "browser", "1/3"],
      ["windows-app-browser-2", "browser", "2/3"], ["windows-app-browser-3", "browser", "3/3"],
    ])
    expect(app.every((lane) => lane.turbo && lane.filters === "--filter=@orchestra/app" && lane.budget === undefined)).toBe(true)
    const pkg = JSON.parse(readFileSync(new URL("../../../packages/app-shell/package.json", import.meta.url), "utf8"))
    expect(pkg.scripts["test:unit"]).toBe("bun test --conditions=solid --only-failures --preload ./happydom.ts ./src")
    expect(pkg.scripts["test:browser"]).toBe("bun run ../../script/test-browser.ts ./test-browser")
    const turbo = JSON.parse(readFileSync(new URL("../../../turbo.json", import.meta.url), "utf8").replace(/^\s*\/\/[^\n]*/gm, ""))
    expect(turbo.tasks["@orchestra/app#test:unit"]).toEqual(turbo.tasks["@orchestra/app#test"])
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8")
    const branch = workflow.split('if [ -n "$APP_MODE" ]; then')[1]?.split("# Desktop's full package command")[0] ?? ""
    expect(branch).toContain("bun turbo run test:unit --filter=@orchestra/app --only --log-order=stream")
    expect(branch).toContain('(cd packages/app-shell && GITHUB_ACTIONS=false bun run ../../script/test-browser.ts "${files[@]/#/./}" "${report[@]}")')
    expect(branch).not.toContain("bun run test:browser")
    expect(branch).not.toContain('"./test-browser"')
    expect(branch).not.toContain("ORCHESTRA_OMNI_CONTROL=")
    expect(branch).not.toContain("--timeout")
    expect(branch).not.toContain("--retry")
    expect(workflow).toContain("APP_MODE: ${{ matrix.appMode }}")
    expect(workflow).toContain("APP_BROWSER_SHARD: ${{ matrix.appBrowserShard }}")
    expect(workflow).toContain("matrix.appBrowserShard)")
  })

  test("anchored balancing refuses missing or duplicate real controls rather than falling back", () => {
    const files = [{ name: "one", weight: 1 }, { name: "two", weight: 2 }, { name: "heavy", weight: 9 }]
    expect(() => balance(files, 2, ["missing", "two"])).toThrow("Missing real process control")
    expect(() => balance(files, 2, ["one", "one"])).toThrow("Invalid shard control anchors")
    expect(() => balance(files, 1, ["one", "two"])).toThrow("Invalid shard control anchors")
    expect(balance(files, 2, ["one", "two"])).toEqual([
      { seconds: 10, names: ["one", "heavy"] }, { seconds: 2, names: ["two"] },
    ])
  })

  test("Windows CLI, Server and clients have disjoint owners without changing package wrappers", () => {
    const lanes = packageLanes("windows", "fixture-host") as { part: string; filters?: string; turbo?: boolean; budget?: number }[]
    expect(lanes).toHaveLength(17)
    const expected = [
      { name: "windows", host: "fixture-host", part: "windows-cli", label: "cli", turbo: true, filters: "--filter=@orchestra/cli" },
      { name: "windows", host: "fixture-host", part: "windows-server", label: "server", turbo: true, filters: "--filter=@orchestra/server" },
      { name: "windows", host: "fixture-host", part: "windows-clients", label: "clients, SDK, TUI", turbo: true, filters: "--filter=@orchestra/client --filter=@orchestra/sdk-next --filter=@orchestra/tui --filter=@orchestra/session-ui" },
    ]
    expect(lanes.filter((lane) => ["windows-cli", "windows-server", "windows-clients"].includes(lane.part))).toEqual(expected)
    const cli = JSON.parse(readFileSync(new URL("../../../apps/cli/package.json", import.meta.url), "utf8"))
    expect(cli.scripts.test).toBe("bun run script/test.ts")
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8")
    expect(workflow).toContain('bun turbo test --concurrency="$concurrency" --continue=dependencies-successful "${only[@]}" "${filters[@]}"')
  })

  test("Windows Boundary partitions all seven files and retained 74-case evidence exactly once", () => {
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    const directory = "modules/atlas/boundary"
    const files = [...new Bun.Glob("**/*.test.ts").scanSync({ cwd: fileURLToPath(new URL("../../../modules/atlas/boundary/test/", import.meta.url)), onlyFiles: true })]
      .map((file) => `test/${file.replaceAll("\\", "/")}`).toSorted()
    const bins = plannedBins(timings, directory, "windows")
    expect(packageShards(timings, directory, "windows")).toBe(2)
    expect(packageShards(timings, directory, "linux")).toBe(1)
    expect(files).toHaveLength(7)
    expect(bins.map((bin) => bin.names.toSorted())).toEqual([
      ["test/build.test.ts"], files.filter((file) => file !== "test/build.test.ts"),
    ])
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(files)
    expect(new Set(bins.flatMap((bin) => bin.names)).size).toBe(7)
    expect(plannedBins(timings, directory, "windows")).toEqual(bins)
    const evidence: { platforms: { windows: { observedCases: Record<string, number> } } } = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")).provenance[directory]
    expect(Object.keys(evidence.platforms.windows.observedCases).toSorted()).toEqual(files)
    expect(bins.map((bin) => bin.names.reduce((sum, file) => sum + evidence.platforms.windows.observedCases[file]!, 0))).toEqual([1, 73])
    const pkg = JSON.parse(readFileSync(new URL("../../../modules/atlas/boundary/package.json", import.meta.url), "utf8"))
    expect(pkg.scripts.test).toBe("bun test --timeout 30000")
    const lanes = packageLanes("windows", "fixture-host") as { part: string; filters?: string; boundaryShard?: string; hosted?: boolean; rollback?: boolean; turbo?: boolean; budget?: number }[]
    const shards = lanes.filter((lane) => lane.boundaryShard)
    expect(shards.map((lane) => lane.boundaryShard)).toEqual(["1/2", "2/2"])
    expect(shards.every((lane) => lane.filters === "--filter=@orchestra/atlas-boundary" && lane.turbo && !lane.hosted && !lane.rollback && lane.budget === undefined)).toBe(true)
    const expected = [
      { name: "windows", host: "fixture-host", part: "windows-process", label: "process query, rollback", hosted: true, rollback: true },
    ]
    expect(lanes.filter((lane) => lane.hosted || lane.rollback)).toEqual(expected)
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8")
    expect(workflow).toContain('bun turbo test --filter=@orchestra/atlas-boundary --log-order=stream -- "${files[@]/#/./}" "${report[@]}"')
    const boundary = workflow.split('if [ -n "$BOUNDARY_SHARD" ]; then')[1]?.split("# Core is sharded")[0] ?? ""
    expect(boundary).not.toContain("--timeout")
    expect(boundary).not.toContain("--retry")
    expect(workflow.match(/- name: Run hosted process query proof/g)).toHaveLength(1)
    expect(workflow.match(/- name: Real AppProcess default and legacy backend selection/g)).toHaveLength(1)
    expect(workflow).toContain("if: ${{ !cancelled() && matrix.hosted }}")
    expect(workflow).toContain("if: ${{ !cancelled() && matrix.rollback && (inputs.packages == '' || contains(format(',{0},', inputs.packages), ',@orchestra/core,')) }}")
    expect(workflow).toContain("bun test --timeout 120000 ./test/windows-process-query.hosted.ts")
    expect(workflow).toContain("bun test test/omni-default-mode.test.ts test/effect/cross-spawn-spawner.test.ts --timeout 30000")
    expect([...workflow.matchAll(/max-parallel: (\d+)/g)].map((match) => Number(match[1]))).toEqual([10, 5])
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget || 10 }}")
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget && 12 || 8 }}")
  })

  test("Linux package matrix remains exactly the pre-split contract", () => {
    const common: { name: "linux"; host: string } = { name: "linux", host: "fixture-host" }
    const expected = [
      { ...common, part: "packages-app", label: "app", turbo: true, filters: "--filter=@orchestra/app", electron: true },
      { ...common, part: "packages-cli", label: "cli, server, clients", turbo: true, filters: "--filter=@orchestra/cli --filter=@orchestra/server --filter=@orchestra/sdk-next --filter=@orchestra/client --filter=@orchestra/tui --filter=@orchestra/session-ui", electron: true },
      { ...common, part: "packages-atlas", label: "atlas boundary", turbo: true, filters: "--filter=@orchestra/atlas-boundary", electron: true, hosted: false, rollback: false },
      { ...common, part: "packages-relay", label: "relay", turbo: true, filters: "--filter=@orchestra/relay" },
      ...[1, 2, 3].map((index) => ({ ...common, part: `packages-desktop-bun-${index}`, label: `desktop Bun ${index}/3`, turbo: true, filters: "--filter=@orchestra/desktop", desktop: "bun", desktopShard: `${index}/3`, electron: true })),
      { ...common, part: "packages-desktop-node", label: "desktop Node", turbo: true, filters: "--filter=@orchestra/desktop", desktop: "node", electron: true },
      { ...common, part: "packages-libs", label: "other packages", turbo: true, filters: "--filter=!@orchestra/core --filter=!@orchestra/cli --filter=!@orchestra/app --filter=!@orchestra/server --filter=!@orchestra/sdk-next --filter=!@orchestra/client --filter=!@orchestra/tui --filter=!@orchestra/session-ui --filter=!@orchestra/atlas-boundary --filter=!@orchestra/relay --filter=!@orchestra/desktop", electron: true },
      { ...common, part: "gates", label: "gates, relay", repo_gates: true, relay: true },
      { ...common, part: "httpapi-1", label: "httpapi 1/2", httpapi: true, httpapiShard: "1/2" },
      { ...common, part: "httpapi-2", label: "httpapi 2/2", httpapi: true, httpapiShard: "2/2" },
      { ...common, part: "sandbox", label: "sandbox proofs", hosted: true },
    ]
    expect(packageLanes("linux", common.host)).toEqual(expected)
  })

  test("a platform's overhead scales its total before the shard count", () => {
    const measured = Object.fromEntries(weigh("packages/core", {}, 0).map((entry) => [entry.name, 1]))
    // Isolate overhead from estimation and the per-file floor as the repository grows.
    expect(Object.keys(measured).length).toBeGreaterThan(0)
    expect(Object.keys(measured).length).toBeLessThan(9000)
    const timings: Timings = {
      target: { linux: 3000, windows: 3000, e2e: 300 },
      overhead: { linux: 1, windows: 1.6 },
      margin: 1,
      budget: { limit: 20, fixed: 4 },
      files: { "packages/core:linux": measured, "packages/core:windows": measured },
      totals: { "packages/core": { linux: 9000, windows: 9000 } },
    }
    expect(packageShards(timings, "packages/core", "linux")).toBe(3)
    expect(packageShards(timings, "packages/core", "windows")).toBe(5)
    expect(packageShards(timings, "packages/missing", "windows")).toBe(1)
  })

  test("new unmeasured files contribute to the package shard count", () => {
    const actual = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    const timings = { ...actual, target: { ...actual.target, linux: 1 }, margin: 1, files: { "packages/core:linux": { "test/behavior.test.ts": 1 } }, totals: { "packages/core": { linux: 1, windows: 1 } } }
    expect(packageShards(timings, "packages/core", "linux")).toBeGreaterThan(1)
  })

  test("a network proof reserves its declared budget without rewriting its measured time", () => {
    const actual = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    const file = "test/review-toolkit/rustsec-native-refresh.test.ts"
    const measured = { ...actual.files["packages/core:linux"], [file]: 1 }
    const timings = { ...actual, reserves: {}, files: { ...actual.files, "packages/core:linux": measured } }
    const reserved = { ...timings, reserves: { "packages/core:linux": { [file]: 300 } } }
    expect(weigh("packages/core", measured, actual.totals["packages/core"]!.linux, reserved.reserves["packages/core:linux"]).find((entry) => entry.name === file)?.weight).toBe(300)
    expect(packageShards(reserved, "packages/core", "linux")).toBeGreaterThan(packageShards(timings, "packages/core", "linux"))
    expect(measured[file]).toBe(1)
  })

  test("relay, gates and rollback never share a lane with a bulk package", () => {
    for (const [name, host] of [["linux", "ubuntu-24.04"], ["windows", "windows-latest"]] as const) {
      const lanes = packageLanes(name, host) as { part: string; filters?: string; turbo?: boolean; relay?: boolean; repo_gates?: boolean; rollback?: boolean }[]
      expect(new Set(lanes.map((lane) => lane.part)).size).toBe(lanes.length)
      for (const lane of lanes.filter((entry) => entry.relay || entry.repo_gates)) expect(lane.turbo).toBeUndefined()
      const rollback = lanes.filter((lane) => lane.rollback)
      expect(rollback.map((lane) => lane.part)).toEqual(name === "windows" ? ["windows-process"] : [])
      expect(rollback.every((lane) => lane.filters === undefined && lane.turbo === undefined)).toBe(true)
      const libs = lanes.find((lane) => lane.part.endsWith("libs"))
      expect(libs?.filters).toContain("--filter=!@orchestra/atlas-boundary")
      expect(libs?.filters).toContain("--filter=!@orchestra/relay")
      expect(libs?.relay ?? libs?.repo_gates ?? libs?.rollback).toBeUndefined()
      expect((libs as { budget?: number }).budget).toBe(name === "windows" ? 15 : undefined)
    }
  })

  test("a core shard does not compile plugin inside the timed test step", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n")
    const step = workflow.split("- name: Run unit tests")[1]?.split("- name:")[0] ?? ""
    const code = step.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n")
    const invocations = [...code.matchAll(/bun turbo test --filter=@orchestra\/core[^\n]*/g)].map((match) => match[0])
    expect(invocations).toEqual([
      "bun turbo test --filter=@orchestra/core --only --log-order=stream -- --preload ./test/file-start.ts \"${files[@]}\" \"${report[@]}\"",
    ])
    expect(code).toContain('cd packages/core && GITHUB_ACTIONS=false ')
    expect(code).toContain('=declared bun test --timeout 30000 --only-failures --preload ./test/file-start.ts "$alone_file") &')
    expect(code).toContain('wait "$pid"')
    const waited = code.split('if [ -n "${alone_pids[0]:-}" ]; then')[1]?.split("fi")[0] ?? ""
    expect(waited).toContain('for pid in "${alone_pids[@]}"; do')
    expect(waited).toContain('wait "$pid"')
    expect(waited).not.toContain(":-")
    expect(code).not.toContain('bun test --timeout 30000 --only-failures "${alone[@]}"')
    const own = code.split('if [ "$file" = "test/filesystem/watcher.test.ts" ] || [ "$file" = "test/tool-write.test.ts" ] || [ "$file" = "test/tool-safety-loopback.test.ts" ] || [ "$file" = "test/tool-safety-sandbox-repairs.test.ts" ] || [ "$file" = "test/review-toolkit/dependency-shadow.test.ts" ]; then')[1]?.split("else")[0] ?? ""
    expect(own).toContain('alone+=("$file")')
    expect(own).not.toContain("kept")
    const strip = (text: string) => text.replaceAll("\r\n", "\n").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n")
    const repairs = strip(readFileSync(new URL("../../core/test/tool-safety-sandbox-repairs.test.ts", import.meta.url), "utf8"))
    const runner = strip(readFileSync(new URL("../../core/test/lib/effect.ts", import.meta.url), "utf8"))
    expect(repairs).toContain("failed = true")
    expect([...repairs.matchAll(/process\.exit\([^)]*\)/g)].map((match) => match[0])).toEqual(["process.exit(failed ? 1 : 0)"])
    expect(runner).toContain("run(value, layer).catch(")
    expect(runner).toContain("onFailure?.()")
    const live = runner.split("const live =")[1]?.split("live.only")[0] ?? ""
    expect(live).toContain("noted(value, liveLayer)")
    expect(live).not.toContain("run(")
    expect(step).not.toContain("turbo build")
    expect(workflow).not.toContain("Build Windows test dependencies")
    const start = strip(readFileSync(new URL("../../core/test/file-start.ts", import.meta.url), "utf8"))
    const hook = start.split("build.onResolve")[1] ?? ""
    expect(hook).toContain("writeSync(2,")
    expect([...hook.matchAll(/return\s+[^\n]+/g)].map((match) => match[0].trim())).toEqual(["return undefined", "return undefined"])
    expect(start).not.toContain("onLoad")
    expect(start).not.toContain("console.")
    const shadow = strip(readFileSync(new URL("../../core/test/review-toolkit/dependency-shadow.test.ts", import.meta.url), "utf8"))
    const capsCall = (shadow.split("entry, path-byte and shared caps are inclusive")[0] ?? "").trimEnd().split("\n").at(-1) ?? ""
    expect(capsCall).toBe('if (process.platform !== "win32") it.live("')
    const recovery = strip(readFileSync(new URL("./recovery-bundle.test.ts", import.meta.url), "utf8"))
    const injection = recovery.split("destination %s injection cannot replace private restore publication")[1]?.split("\nasync function makeFixture")[0] ?? ""
    expect(injection.trimEnd().endsWith("}, 20_000)")).toBe(true)
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget && 12 || 8 }}")
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget || 10 }}")
    const app = code.split("if printf '%s\\n' \"${filters[@]}\" | grep -qx -- '--filter=@orchestra/app'; then")[1]?.split("fi")[0] ?? ""
    expect(app).toContain("only=(--only)")
    expect(app).not.toContain("filters")
    expect(code).toContain('bun turbo test --concurrency="$concurrency" --continue=dependencies-successful "${only[@]}" "${filters[@]}"')
  })

  test("shard count follows the measured time and the target", () => {
    expect(shardCount(1139, 270, 1.15)).toBe(5)
    expect(shardCount(100, 270, 1.15)).toBe(1)
    expect(shardCount(0, 270, 1.15)).toBe(1)
  })

  test("longest-first packing keeps every file once and balances the bins", () => {
    const items = [100, 90, 80, 30, 20, 10, 5, 5].map((weight, index) => ({ name: `f${index}`, weight }))
    const bins = balance(items, 3)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(items.map((item) => item.name).toSorted())
    const seconds = bins.map((bin) => bin.seconds)
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(30)
    expect(balance(items, 3)).toEqual(bins)
  })

  test("the real core package is covered by its shards without overlap", () => {
    const weights = weigh("packages/core", {}, 1200)
    const bins = balance(weights, 5)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(weights.map((entry) => entry.name).toSorted())
    expect(bins.every((bin) => bin.names.length > 0)).toBe(true)
  })

  test("a measured file keeps its time and an unmeasured one is scaled from it", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 60 }, 1200)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(60)
    expect(weights.every((entry) => entry.weight > 0)).toBe(true)
  })

  test("a zero measurement does not stay zero when a floor is set", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 0 }, 1200, 1)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(1)
    expect(weights.every((entry) => entry.weight >= 1)).toBe(true)
  })

  test("core shards do not pile untimed files, and a multi-file bin stays under the step", () => {
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    for (const platform of ["linux", "windows"] as const) {
      const bins = plannedBins(timings, "packages/core", platform)
      expect(Math.max(...bins.map((bin) => bin.names.length))).toBeLessThanOrEqual(120)
      // Windows 1.6 left multi-file bins at 255s, and that shard was still running at 8 minutes (run 43120112874).
      const limit = platform === "windows" ? 220 : 280
      expect(bins.filter((bin) => bin.names.length > 1).every((bin) => bin.seconds <= limit)).toBe(true)
      const bare = balance(
        weigh("packages/core", timings.files[`packages/core:${platform}`] ?? {}, timings.totals["packages/core"]?.[platform] ?? 0),
        packageShards(timings, "packages/core", platform),
      )
      expect(Math.max(...bare.map((bin) => bin.names.length))).toBeGreaterThan(120)
    }
  })

  test("reads per-file times from Bun's JUnit suites and ignores describe blocks", () => {
    const xml = `<testsuites><testsuite name="test/a.test.ts" tests="2" time="1.25"><testsuite name="inner" time="1.0"/></testsuite>` +
      `<testsuite name="test\\b.test.ts" tests="1" time="0.5"/></testsuites>`
    expect(suiteTimes(xml)).toEqual([["test/a.test.ts", 1.25], ["test/b.test.ts", 0.5]])
    expect(suiteTimes(`<testsuite name="packages/app-shell/test-browser/model-execution-consumer.test.tsx" time="13.2"/>`)).toEqual([["test-browser/model-execution-consumer.test.tsx", 13.2]])
    expect(suiteTimes(`<testsuite name="C:\\repo\\apps\\desktop\\src\\main\\owned-serve.test.ts" time="65.5"/><testsuite name="apps/desktop/scripts/stage-claude.test.ts" time="2"/><testsuite name="electron-builder.config.test.ts" time="0.2"/>`)).toEqual([["src/main/owned-serve.test.ts", 65.5], ["scripts/stage-claude.test.ts", 2], ["electron-builder.config.test.ts", 0.2]])
  })
})

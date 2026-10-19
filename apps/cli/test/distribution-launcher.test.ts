import { expect, test } from "bun:test"
import { posix } from "node:path"
import { runInNewContext } from "node:vm"

const source = await Bun.file(new URL("../bin/orchestra.cjs", import.meta.url)).text()

// Execute the actual wrapper in an isolated VM. These selector probes do not
// qualify any native executable, including Windows.
function launch(input: {
  platform?: string
  arch?: string
  avx2?: boolean
  musl?: boolean
  alpine?: boolean
  glibcVersionRuntime?: string
  reportError?: boolean
  ldd?: { status: number | null; stdout: string; stderr?: string; error?: string; signal?: string }
  lddThrows?: boolean
  cached?: boolean
  available?: string[]
  override?: string
}) {
  const platform = input.platform ?? "linux"
  const arch = input.arch ?? "x64"
  const attempted: string[] = []
  const probes: { command: string; timeout: number | undefined; maxBuffer: number | undefined }[] = []
  const result: { target?: string; args?: string[]; code?: number; error?: string } = {}
  const stopped = new Error("VM process stopped")
  const modules = {
    path: posix,
    os: { platform: () => platform, arch: () => arch },
    fs: {
      realpathSync: () => "/work/node_modules/@humanguardrail/cli/bin/orchestra.cjs",
      readFileSync: () => input.avx2 ? "flags: avx avx2 sse" : "flags: avx sse",
      existsSync: (path: string) => {
        if (path === "/etc/alpine-release") return input.alpine ?? false
        if (path === "/work/node_modules/@humanguardrail/cli/bin/.orchestra") return input.cached ?? false
        if (path === "/work/node_modules") return true
        const name = /^\/work\/node_modules\/@humanguardrail\/(cli-[^/]+)\/bin\/orchestra(?:\.exe)?$/.exec(path)?.[1]
        if (!name) return false
        attempted.push(name)
        return input.available?.includes(name) ?? false
      },
    },
    child_process: {
      spawnSync: (command: string, _args: string[], options: { timeout?: number; maxBuffer?: number }) => {
        probes.push({ command, timeout: options.timeout, maxBuffer: options.maxBuffer })
        if (command === "ldd" && input.lddThrows) throw new Error("ldd unavailable")
        if (command === "ldd" && input.ldd) return input.ldd
        return { status: 0, stdout: command === "ldd" ? input.musl ? "musl libc" : "ldd (GNU libc)" : command === "sysctl" ? input.avx2 ? "1" : "0" : input.avx2 ? "True" : "False", stderr: "" }
      },
      spawn: (target: string, args: string[]) => {
        result.target = target; result.args = args
        return { on: (event: string, callback: (code: number, signal: null) => void) => {
          if (event === "exit") callback(23, null)
        }, kill: () => {} }
      },
    },
  }
  try {
    runInNewContext(source, {
      require: (name: keyof typeof modules) => modules[name], __filename: "/wrapper/orchestra.cjs",
      console: { error: (message: string) => { result.error = message } },
      process: { argv: ["node", "orchestra", "--version"], env: { ORCHESTRA_BIN_PATH: input.override },
        report: { getReport: () => {
          if (input.reportError) throw new Error("report unavailable")
          return { header: { glibcVersionRuntime: input.glibcVersionRuntime } }
        } },
        on: () => {}, removeListener: () => {}, exit: (code: number) => { result.code = code; throw stopped } },
    })
  } catch (error) { if (error !== stopped) throw error }
  return { ...result, attempted, probes }
}

for (const row of [
  { platform: "linux", arch: "x64", avx2: false, musl: false, names: ["cli-linux-x64-baseline"] },
  { platform: "linux", arch: "x64", avx2: true, musl: false, names: ["cli-linux-x64", "cli-linux-x64-baseline"] },
  { platform: "linux", arch: "x64", avx2: false, musl: true, names: ["cli-linux-x64-baseline-musl"] },
  { platform: "linux", arch: "x64", avx2: true, musl: true, names: ["cli-linux-x64-musl", "cli-linux-x64-baseline-musl"] },
  { platform: "linux", arch: "arm64", avx2: false, musl: false, names: ["cli-linux-arm64"] },
  { platform: "linux", arch: "arm64", avx2: false, musl: true, names: ["cli-linux-arm64-musl"] },
  { platform: "darwin", arch: "x64", avx2: false, musl: false, names: ["cli-darwin-x64-baseline"] },
  { platform: "darwin", arch: "x64", avx2: true, musl: false, names: ["cli-darwin-x64", "cli-darwin-x64-baseline"] },
  { platform: "win32", arch: "x64", avx2: false, musl: false, names: ["cli-windows-x64-baseline"] },
  { platform: "win32", arch: "x64", avx2: true, musl: false, names: ["cli-windows-x64", "cli-windows-x64-baseline"] },
]) {
  test(`wrapper candidates: ${row.platform}/${row.arch} AVX2=${row.avx2} musl=${row.musl} (VM only)`, () => {
    const result = launch(row)
    expect(result.attempted).toEqual(row.names)
    expect(result.code).toBe(1)
    expect(result.target).toBeUndefined()
    if (row.platform === "linux") expect(result.probes.find((probe) => probe.command === "ldd")?.timeout).toBe(1500)
    for (const name of row.names) {
      const selected = launch({ ...row, available: [name] })
      expect(selected.target).toBe(`/work/node_modules/@humanguardrail/${name}/bin/orchestra${row.platform === "win32" ? ".exe" : ""}`)
      expect(selected.args).toEqual(["--version"])
      expect(selected.code).toBe(23)
    }
  })
}

test("installed incompatible packages never become fallbacks", () => {
  for (const input of [
    { avx2: false, musl: false, available: ["cli-linux-x64", "cli-linux-x64-baseline-musl"] },
    { avx2: false, musl: true, available: ["cli-linux-x64-musl", "cli-linux-x64-baseline"] },
    { avx2: true, musl: true, available: ["cli-linux-x64", "cli-linux-x64-baseline"] },
    { avx2: true, musl: false, available: ["cli-linux-x64-musl", "cli-linux-x64-baseline-musl"] },
  ]) {
    expect(launch(input).code).toBe(1)
    expect(launch(input).target).toBeUndefined()
  }
})

const unknownLdd = [
  { name: "ENOENT", ldd: { status: null, stdout: "", error: "ENOENT" } },
  { name: "timeout with glibc output", ldd: { status: null, stdout: "ldd (GNU libc)", error: "ETIMEDOUT", signal: "SIGTERM" } },
  { name: "timeout with musl output", ldd: { status: null, stdout: "", stderr: "musl libc", error: "ETIMEDOUT", signal: "SIGTERM" } },
  { name: "failed with glibc output", ldd: { status: 1, stdout: "ldd (GNU libc)" } },
  { name: "failed without output", ldd: { status: 1, stdout: "" } },
  { name: "empty output", ldd: { status: 0, stdout: "" } },
  { name: "unrecognized output", ldd: { status: 0, stdout: "ldd version 1.0" } },
  { name: "thrown probe", lddThrows: true },
]

for (const row of unknownLdd) {
  test(`unknown libc refuses automatic selection: ${row.name} (VM only)`, () => {
    for (const arch of ["x64", "arm64"]) {
      for (const cached of [false, true]) {
        const result = launch({
          ...row, arch, cached, avx2: true,
          available: [`cli-linux-${arch}`, `cli-linux-${arch}-baseline`, `cli-linux-${arch}-musl`, `cli-linux-${arch}-baseline-musl`],
        })
        expect(result.code).toBe(1)
        expect(result.target).toBeUndefined()
        expect(result.attempted).toEqual([])
        expect(result.error).toContain("Cannot determine Linux libc (glibc or musl)")
        expect(result.error).toContain("refusing automatic orchestra CLI binary selection")
        expect(result.error).toContain("ORCHESTRA_BIN_PATH")
        expect(result.probes).toEqual([{ command: "ldd", timeout: 1500, maxBuffer: 64 * 1024 }])
      }
    }
    const override = launch({ ...row, override: "/explicit path/orchestra" })
    expect(override.target).toBe("/explicit path/orchestra")
    expect(override.args).toEqual(["--version"])
    expect(override.code).toBe(23)
    expect(override.attempted).toEqual([])
    expect(override.probes).toEqual([])
  })
}

test("Node report positively selects glibc without invoking ldd (VM only)", () => {
  for (const avx2 of [false, true]) {
    const name = avx2 ? "cli-linux-x64" : "cli-linux-x64-baseline"
    const result = launch({ glibcVersionRuntime: "2.39", avx2, lddThrows: true, available: [name, "cli-linux-x64-baseline-musl"] })
    expect(result.target).toBe(`/work/node_modules/@humanguardrail/${name}/bin/orchestra`)
    expect(result.code).toBe(23)
    expect(result.attempted).toEqual([name])
    expect(result.probes).toEqual([])
    const incompatible = launch({ glibcVersionRuntime: "2.39", avx2, available: ["cli-linux-x64-musl", "cli-linux-x64-baseline-musl"] })
    expect(incompatible.code).toBe(1)
    expect(incompatible.target).toBeUndefined()
  }
})

test("Alpine marker positively selects musl without invoking ldd (VM only)", () => {
  const result = launch({ alpine: true, lddThrows: true, available: ["cli-linux-x64-baseline-musl", "cli-linux-x64-baseline"] })
  expect(result.target).toBe("/work/node_modules/@humanguardrail/cli-linux-x64-baseline-musl/bin/orchestra")
  expect(result.code).toBe(23)
  expect(result.probes).toEqual([])
})

test("explicit ldd libc evidence works across stdout and stderr (VM only)", () => {
  for (const row of [
    { ldd: { status: 0, stdout: "ldd (Ubuntu GLIBC 2.39)" }, name: "cli-linux-x64-baseline" },
    { ldd: { status: 0, stdout: "", stderr: "ldd (GNU C Library) 2.39" }, name: "cli-linux-x64-baseline" },
    { ldd: { status: 1, stdout: "", stderr: "musl libc (x86_64)\nVersion 1.2.5" }, name: "cli-linux-x64-baseline-musl" },
  ]) {
    const result = launch({ ...row, reportError: true, available: [row.name] })
    expect(result.target).toBe(`/work/node_modules/@humanguardrail/${row.name}/bin/orchestra`)
    expect(result.code).toBe(23)
  }
})

test("empty or unrecognized report headers do not imply glibc (VM only)", () => {
  for (const glibcVersionRuntime of ["", "unknown"]) {
    const result = launch({ glibcVersionRuntime, ldd: { status: 0, stdout: "" }, available: ["cli-linux-x64-baseline"] })
    expect(result.code).toBe(1)
    expect(result.target).toBeUndefined()
    expect(result.error).toContain("Cannot determine Linux libc")
  }
})

test("explicit ORCHESTRA_BIN_PATH keeps exact target, arguments and child exit code", () => {
  const result = launch({ override: "/explicit path/orchestra", available: ["cli-linux-x64-baseline"] })
  expect(result.target).toBe("/explicit path/orchestra")
  expect(result.args).toEqual(["--version"])
  expect(result.code).toBe(23)
  expect(result.attempted).toEqual([])
  expect(result.probes).toEqual([])
})

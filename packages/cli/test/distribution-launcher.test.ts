import { expect, test } from "bun:test"
import { posix } from "node:path"
import { runInNewContext } from "node:vm"

const source = await Bun.file(new URL("../bin/orchestra.cjs", import.meta.url)).text()

// Execute the actual wrapper in an isolated VM. These selector probes do not
// qualify any native executable, including Windows.
function launch(input: { platform?: string; arch?: string; avx2?: boolean; musl?: boolean; available?: string[]; override?: string }) {
  const platform = input.platform ?? "linux"
  const arch = input.arch ?? "x64"
  const attempted: string[] = []
  const probes: { command: string; timeout: number | undefined }[] = []
  const result: { target?: string; args?: string[]; code?: number; error?: string } = {}
  const stopped = new Error("VM process stopped")
  const modules = {
    path: posix,
    os: { platform: () => platform, arch: () => arch },
    fs: {
      realpathSync: () => "/work/node_modules/@orchestra/cli/bin/orchestra.cjs",
      readFileSync: () => input.avx2 ? "flags: avx avx2 sse" : "flags: avx sse",
      existsSync: (path: string) => {
        if (path === "/work/node_modules") return true
        const name = /^\/work\/node_modules\/@orchestra\/(cli-[^/]+)\/bin\/orchestra(?:\.exe)?$/.exec(path)?.[1]
        if (!name) return false
        attempted.push(name)
        return input.available?.includes(name) ?? false
      },
    },
    child_process: {
      spawnSync: (command: string, _args: string[], options: { timeout?: number }) => {
        probes.push({ command, timeout: options.timeout })
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
      expect(selected.target).toBe(`/work/node_modules/@orchestra/${name}/bin/orchestra${row.platform === "win32" ? ".exe" : ""}`)
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

test("explicit ORCHESTRA_BIN_PATH keeps exact target, arguments and child exit code", () => {
  const result = launch({ override: "/explicit path/orchestra", available: ["cli-linux-x64-baseline"] })
  expect(result.target).toBe("/explicit path/orchestra")
  expect(result.args).toEqual(["--version"])
  expect(result.code).toBe(23)
  expect(result.attempted).toEqual([])
})

// Bootstrap uses only Bun/process built-ins. Root/SDK admission must complete
// before importing test registrations, producer helpers, or native bindings.
const lane = process.env.ORCHESTRA_ARTIFACT_NATIVE_LANE
if (
  !lane ||
  ![
    "darwin-x64",
    "darwin-arm64",
    "linux-musl-x64",
    "linux-musl-arm64",
    "linux-glibc-musl-x64",
    "linux-glibc-musl-arm64",
  ].includes(lane)
)
  throw new Error("Required ORCHESTRA_ARTIFACT_NATIVE_LANE: native Darwin, musl, or glibc-with-musl lane")
if (!process.env.RUNNER_OS || Bun.version !== "1.3.14")
  throw new Error("Hosted Actions artifact lane requires Bun 1.3.14")
if (!process.env.ORCHESTRA_ARTIFACT_BUNFIG || (await Bun.file(process.env.ORCHESTRA_ARTIFACT_BUNFIG).text()).trim())
  throw new Error("Native artifact lane requires ORCHESTRA_ARTIFACT_BUNFIG naming the empty runner config")
if (process.platform !== (lane.startsWith("darwin-") ? "darwin" : "linux") || process.arch !== lane.split("-").at(-1))
  throw new Error(`Native artifact lane host mismatch: ${lane} vs ${process.platform}/${process.arch}`)

if (lane.startsWith("darwin-")) {
  const root = process.env.ORCHESTRA_ARTIFACT_TEST_ROOT
  if (!root) throw new Error("Native Darwin artifact lane requires ORCHESTRA_ARTIFACT_TEST_ROOT mountpoint")
  const plist = Bun.spawnSync(["/usr/sbin/diskutil", "info", "-plist", root], { stdout: "pipe", stderr: "pipe" })
  if (plist.exitCode !== 0) throw new Error("Native Darwin artifact mountpoint inspection failed")
  const json = Bun.spawnSync(["/usr/bin/plutil", "-convert", "json", "-o", "-", "--", "-"], {
    stdin: plist.stdout,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (json.exitCode !== 0) throw new Error("Native Darwin artifact mountpoint descriptor decode failed")
  const info: unknown = JSON.parse(json.stdout.toString())
  // diskutil supplies the actual mountpoint, not a caller's lexical path model.
  // A nested path, symlink spelling, or unmounted volume does not satisfy this.
  if (
    !info ||
    typeof info !== "object" ||
    !("FilesystemType" in info) ||
    info.FilesystemType !== "apfs" ||
    !("MountPoint" in info) ||
    info.MountPoint !== root ||
    !("Mounted" in info) ||
    info.Mounted !== true
  )
    throw new Error("Native Darwin artifact test root must be the actual mounted APFS root")
  const sdk = process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
  if (!sdk) throw new Error("Native Darwin artifact lane requires ORCHESTRA_ARTIFACT_DARWIN_SDK")
  await Promise.all(
    ["fcntl.h", "sys/types.h", "sys/cdefs.h"].map(async (header) => {
      if (!(await Bun.file(`${sdk}/usr/include/${header}`).exists()))
        throw new Error(`Native Darwin artifact SDK header missing: ${header}`)
    }),
  )
}

const { expect, test } = await import("bun:test")
if (lane.startsWith("linux-")) {
  const { artifactLinuxRuntime } = await import("../script/artifact-elf")
  const runtime = await artifactLinuxRuntime()
  if (lane.startsWith("linux-glibc-musl-")) {
    const foreign = `/lib/ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`
    if (runtime.kind !== "glibc" || !(await Bun.file(foreign).exists()))
      throw new Error("Native mixed-libc control requires running glibc Bun plus installed foreign musl")
    // Probe foreign loader in its own process, never load its TCB into glibc Bun.
    const probe = Bun.spawnSync([foreign], { stdout: "pipe", stderr: "pipe" })
    const banner = `${probe.stdout.toString()}${probe.stderr.toString()}`
    if (!banner.includes("musl libc") || !banner.includes("\nVersion "))
      throw new Error("Native mixed-libc control requires executable actual foreign musl loader")
    test("native glibc with installed musl selects its running ELF libc", () =>
      expect(runtime.library).toBe("libc.so.6"))
  }
  if (lane.startsWith("linux-musl-")) {
    if (runtime.kind !== "musl") throw new Error(`Native musl lane interpreter mismatch: ${runtime.interpreter}`)
    const loader = runtime.interpreter
    const version = Bun.spawnSync([loader], { stdout: "pipe", stderr: "pipe" })
    if (!`${version.stdout.toString()}${version.stderr.toString()}`.includes("Version 1.2.5\n"))
      throw new Error("Native musl regression lane requires actual musl 1.2.5")
    test("native musl old renameat2 symbol binding fails while exported syscall is available", async () => {
      const { dlopen } = await import("bun:ffi")
      const available = dlopen(loader, {
        syscall: { args: ["i64", "i64", "ptr", "i64", "ptr", "i64", "i64"], returns: "i64" },
      })
      expect(typeof available.symbols.syscall).toBe("function")
      available.close()
      expect(() => {
        const legacy = dlopen(loader, { renameat2: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" } })
        legacy.close()
      }).toThrow()
    })
  }
}

test("required native artifact lane reports actual OS CPU Bun and libc gate", () => {
  expect(process.platform).toBe(lane.startsWith("darwin-") ? "darwin" : "linux")
  expect(Bun.version).toBe("1.3.14")
})

await import("./artifact-fs.test")
await import("./export-artifacts.test")
await import("./artifact-abi.test")
await import("./artifact-posix-race.test")
if (lane.startsWith("darwin-")) await import("./artifact-case-alias.test")

export {}

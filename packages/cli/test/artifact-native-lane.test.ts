import { expect, test } from "bun:test"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname } from "node:path"
import { artifactLinuxRuntime } from "../script/artifact-elf"

// Explicit entry for lead-owned hosted lanes. No skipping, emulated platform
// flags, local runner, or glibc binary in an Alpine container counts as proof.
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
if (!process.env.ORCHESTRA_ARTIFACT_BUNFIG || (await readFile(process.env.ORCHESTRA_ARTIFACT_BUNFIG, "utf8")).trim())
  throw new Error("Native artifact lane requires ORCHESTRA_ARTIFACT_BUNFIG naming the empty runner config")
if (process.platform !== (lane.startsWith("darwin-") ? "darwin" : "linux") || process.arch !== lane.split("-").at(-1))
  throw new Error(`Native artifact lane host mismatch: ${lane} vs ${process.platform}/${process.arch}`)

if (lane.startsWith("darwin-")) {
  const root = process.env.ORCHESTRA_ARTIFACT_TEST_ROOT
  if (!root) throw new Error("Native Darwin artifact lane requires ORCHESTRA_ARTIFACT_TEST_ROOT mountpoint")
  if (
    (await realpath(root)) !== root ||
    !(await lstat(root)).isDirectory() ||
    (await lstat(root, { bigint: true })).dev === (await lstat(dirname(root), { bigint: true })).dev
  )
    throw new Error("Native Darwin artifact test root must be an actual canonical mountpoint root")
  const plist = Bun.spawnSync(["/usr/sbin/diskutil", "info", "-plist", root], { stdout: "pipe", stderr: "pipe" })
  if (plist.exitCode !== 0) throw new Error("Native Darwin artifact mountpoint inspection failed")
  const json = Bun.spawnSync(["/usr/bin/plutil", "-convert", "json", "-o", "-", "--", "-"], {
    stdin: plist.stdout,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (json.exitCode !== 0) throw new Error("Native Darwin artifact mountpoint descriptor decode failed")
  const info = JSON.parse(json.stdout.toString())
  if (info.FilesystemType !== "apfs" || info.MountPoint !== root)
    throw new Error("Native Darwin artifact test root must be the provisioned APFS mountpoint")
  if (!process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK)
    throw new Error("Native Darwin artifact lane requires ORCHESTRA_ARTIFACT_DARWIN_SDK")
}

if (lane.startsWith("linux-glibc-musl-")) {
  const runtime = await artifactLinuxRuntime()
  if (
    runtime.kind !== "glibc" ||
    !(await Bun.file(`/lib/ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`).exists())
  )
    throw new Error("Native mixed-libc control requires running glibc Bun plus installed foreign musl")
  test("native glibc with installed musl selects its running ELF libc", () => expect(runtime.library).toBe("libc.so.6"))
}

if (lane.startsWith("linux-musl-")) {
  const runtime = await artifactLinuxRuntime()
  if (runtime.kind !== "musl") throw new Error(`Native musl lane interpreter mismatch: ${runtime.interpreter}`)
  const loader = runtime.interpreter
  const version = Bun.spawnSync([loader], { stdout: "pipe", stderr: "pipe" })
  if (!`${version.stdout.toString()}${version.stderr.toString()}`.includes("Version 1.2.5\n"))
    throw new Error("Native musl regression lane requires actual musl 1.2.5")
  test("native musl old renameat2 symbol binding fails while exported syscall is available", async () => {
    const { dlopen } = await import("bun:ffi")
    // Positive symbol control distinguishes a missing wrapper from a bad loader.
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

test("required native artifact lane reports actual OS CPU Bun and libc gate", () => {
  expect(process.platform).toBe(lane.startsWith("darwin-") ? "darwin" : "linux")
  expect(Bun.version).toBe("1.3.14")
})

await import("./artifact-fs.test")
await import("./export-artifacts.test")
await import("./artifact-abi.test")
await import("./artifact-posix-race.test")
if (lane.startsWith("darwin-")) await import("./artifact-case-alias.test")

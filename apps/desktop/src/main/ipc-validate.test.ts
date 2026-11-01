import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, normalize } from "node:path"
import { LINUX_OPEN_APPS, MAC_OPEN_APPS, WINDOWS_OPEN_APPS } from "@orchestra/app/open-apps"
import { absoluteTargetPath, defaultServerKey, isLaunchableTarget, isOpenApp, rendererStoreName } from "./ipc-validate"

describe("desktop IPC trust: store names", () => {
  test("accepts the .dat stores the renderer's persist layer names", () => {
    for (const name of [
      "default.dat",
      "orchestra.global.dat",
      "orchestra.workspace.my-repo.12ab.dat",
      "orchestra.draft.abc.9.dat",
      "orchestra.window.win_1.dat",
    ])
      expect(rendererStoreName(name)).toBe(name)
  })

  test("rejects traversal, separators, absolute paths and main-owned stores", () => {
    for (const name of [
      "../../x.dat",
      "..",
      "a..b.dat",
      "../x",
      "sub/x.dat",
      "sub\\x.dat",
      "/etc/passwd",
      "C:\\x.dat",
      ".hidden.dat",
      "orchestra.settings",
      "orchestra.updater",
      "orchestra.janitor",
      "x.dat\0",
      "",
      "a".repeat(201) + ".dat",
      42,
      null,
      undefined,
      { toString: () => "x.dat" },
    ])
      expect(() => rendererStoreName(name)).toThrow("Invalid store name")
  })
})

describe("desktop IPC trust: default server", () => {
  test("accepts http(s) URLs, the fixed connection keys and null", () => {
    for (const value of [
      "http://localhost:4096",
      "https://orchestra.example.com/base",
      "sidecar",
      "wsl:Ubuntu-22.04",
      "ssh:dev@host.example.com",
    ])
      expect(defaultServerKey(value)).toBe(value)
    expect(defaultServerKey(null)).toBeNull()
  })

  test("rejects other schemes and malformed values", () => {
    for (const value of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,<script>1</script>",
      "ftp://host",
      "wsl:",
      "wsl:../x",
      "ssh: host",
      "not a url",
      "",
      "http://" + "a".repeat(2050),
      undefined,
      {},
      42,
    ])
      expect(() => defaultServerKey(value)).toThrow("Invalid server URL")
  })
})

describe("desktop IPC trust: open-in apps", () => {
  test("only the names the open-in list offers for the platform are apps", () => {
    for (const item of MAC_OPEN_APPS) expect(isOpenApp(item.openWith, "darwin")).toBe(true)
    for (const item of WINDOWS_OPEN_APPS) expect(isOpenApp(item.openWith, "win32")).toBe(true)
    for (const item of LINUX_OPEN_APPS) expect(isOpenApp(item.openWith, "linux")).toBe(true)
  })

  test("rejects paths, options, unlisted commands and non-strings", () => {
    for (const platform of ["darwin", "win32", "linux"] as const)
      for (const app of [
        "/bin/sh",
        "/Applications/Calculator.app",
        "C:\\Windows\\System32\\cmd.exe",
        "cmd",
        "sh",
        "-a",
        "--args",
        "code --reuse-window",
        "../code",
        "",
        1,
        null,
        undefined,
      ])
        expect(isOpenApp(app, platform)).toBe(false)
  })
})

describe("desktop IPC trust: target paths", () => {
  test("requires an absolute path and normalizes it", () => {
    expect(absoluteTargetPath("/tmp/a/../b")).toBe(normalize("/tmp/b"))
    for (const value of ["-a", "--args", "-rf", "relative", "./x", "../x", "", "/tmp/x\0", "/tmp/\nx", 5, null])
      expect(absoluteTargetPath(value)).toBeUndefined()
  })

  test("launchable targets are recognised by extension and by execute bit", async () => {
    const root = await mkdtemp(join(tmpdir(), "orchestra-launchable-"))
    try {
      for (const name of ["a.command", "a.EXE", "a.ps1", "a.sh", "Foo.app", "a.desktop", "a.jar"])
        expect(await isLaunchableTarget(join(root, name))).toBe(true)
      await writeFile(join(root, "notes.md"), "x")
      await writeFile(join(root, "tool"), "#!/bin/sh\n")
      expect(await isLaunchableTarget(join(root, "notes.md"))).toBe(false)
      expect(await isLaunchableTarget(join(root, "missing.txt"))).toBe(false)
      if (process.platform === "win32") return
      await chmod(join(root, "tool"), 0o755)
      expect(await isLaunchableTarget(join(root, "tool"))).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

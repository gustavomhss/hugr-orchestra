import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Flag, omniSpawner } from "@opencode-ai/core/flag/flag"
import { Omni } from "@opencode-ai/core/omni"
import { Shell } from "@opencode-ai/core/shell"
import { alive, gone, reap, sweep, tree } from "./fixture/process-tree"

describe("OPENCODE_EXPERIMENTAL_OMNI_SPAWNER parser", () => {
  test("unset, empty and 0 are off; 1 is on; strict is strict", () => {
    expect(omniSpawner(undefined)).toBe("off")
    expect(omniSpawner("")).toBe("off")
    expect(omniSpawner("0")).toBe("off")
    expect(omniSpawner("1")).toBe("on")
    expect(omniSpawner("strict")).toBe("strict")
  })

  test("anything else is off, not truthy()", () => {
    for (const value of ["true", "TRUE", "yes", "on", "Strict", "2", " 1"]) expect(omniSpawner(value)).toBe("off")
  })

  test("the flag reads the variable at access time and ignores OPENCODE_EXPERIMENTAL", () => {
    const saved = { omni: process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER, all: process.env.OPENCODE_EXPERIMENTAL }
    try {
      delete process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
      process.env.OPENCODE_EXPERIMENTAL = "true"
      expect(Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER).toBe("off")
      process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER = "strict"
      expect(Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER).toBe("strict")
    } finally {
      restore("OPENCODE_EXPERIMENTAL_OMNI_SPAWNER", saved.omni)
      restore("OPENCODE_EXPERIMENTAL", saved.all)
    }
  })
})

describe("Omni counters and the positive control", () => {
  test("count() adds to the snapshot, which is a copy", () => {
    const before = Omni.snapshot()
    Omni.count("spawns")
    Omni.count("spawns")
    Omni.count("delegations")
    const after = Omni.snapshot()
    expect(after).toEqual({ spawns: before.spawns + 2, delegations: before.delegations + 1 })
    after.spawns = -1
    expect(Omni.snapshot().spawns).toBe(before.spawns + 2)
    Omni.count("spawns", -2)
    Omni.count("delegations", -1)
    expect(Omni.snapshot()).toEqual(before)
  })

  test("verdict: off never fails; on needs a spawn; strict needs a spawn and no delegation", () => {
    expect(Omni.verdict("off", { spawns: 0, delegations: 9 })).toBeUndefined()
    expect(Omni.verdict("on", { spawns: 0, delegations: 0 })).toContain("no omni spawn")
    expect(Omni.verdict("on", { spawns: 1, delegations: 5 })).toBeUndefined()
    expect(Omni.verdict("strict", { spawns: 0, delegations: 0 })).toContain("no omni spawn")
    expect(Omni.verdict("strict", { spawns: 3, delegations: 1 })).toContain("delegated 1")
    expect(Omni.verdict("strict", { spawns: 3, delegations: 0 })).toBeUndefined()
  })
})

describe("Omni.childEnv", () => {
  test("merges process.env and extra, drops undefined, strips HUGR_OMNI_* from the result", () => {
    const saved = { addon: process.env.HUGR_OMNI_ADDON, keep: process.env.OMNI_TEST_KEEP }
    try {
      process.env.HUGR_OMNI_ADDON = "/somewhere/addon.node"
      process.env.OMNI_TEST_KEEP = "base"
      const env = Omni.childEnv({
        OMNI_TEST_KEEP: "extra",
        OMNI_TEST_NEW: "new",
        OMNI_TEST_GONE: undefined,
        HUGR_OMNI_X: "1",
      })
      expect(env.OMNI_TEST_KEEP).toBe("extra")
      expect(env.OMNI_TEST_NEW).toBe("new")
      expect("OMNI_TEST_GONE" in env).toBe(false)
      expect(Object.keys(env).filter((key) => key.toUpperCase().startsWith("HUGR_OMNI_"))).toEqual([])
      expect(Object.values(env).every((value) => typeof value === "string")).toBe(true)
      expect(Omni.childEnv({ OMNI_TEST_KEEP: undefined }).OMNI_TEST_KEEP).toBeUndefined()
    } finally {
      restore("HUGR_OMNI_ADDON", saved.addon)
      restore("OMNI_TEST_KEEP", saved.keep)
    }
  })

  test.if(process.platform === "win32")("on Windows a later Path replaces PATH and only one key survives", () => {
    const env = Omni.childEnv({ Path: "C:\\later", hugr_omni_lower: "x" })
    expect(Object.keys(env).filter((key) => key.toUpperCase() === "PATH")).toEqual(["Path"])
    expect(env.Path).toBe("C:\\later")
    expect(Object.keys(env).some((key) => key.toUpperCase() === "HUGR_OMNI_LOWER")).toBe(false)
  })

  test.if(process.platform !== "win32")("elsewhere names are case-sensitive", () => {
    const env = Omni.childEnv({ Path: "/later" })
    expect(env.Path).toBe("/later")
    expect(env.PATH).toBe(process.env.PATH ?? "")
  })
})

describe("Omni.locate", () => {
  test("configured paths win, and a configured file that does not exist fails loudly", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "omni-locate-"))
    const files = { addon: path.join(dir, "hugr_omni.node"), supervisor: path.join(dir, "hugr-omni-supervisor") }
    await writeFile(files.addon, "")
    await writeFile(files.supervisor, "")
    // locate() takes the paths configure() would hold, so this test never configures the loader other tests use
    // (configure() is refused once anything in this process has loaded omni).
    expect(() => Omni.locate({ addon: path.join(dir, "missing.node"), supervisor: files.supervisor })).toThrow(
      "missing.node does not exist",
    )
    expect(Omni.locate(files)).toEqual(files)
  })
})

describe("Shell.invocation", () => {
  test.if(process.platform !== "win32")("true is /bin/sh -c with the command and args joined like Node", () => {
    expect(Shell.invocation(true, "echo", ["a b", "$HOME"])).toEqual({
      file: "/bin/sh",
      args: ["-c", "echo a b $HOME"],
    })
  })

  test.if(process.platform === "win32")("true on Windows is cmd.exe, so the caller delegates", () => {
    expect(Shell.invocation(true, "echo", ["hi"])).toBeUndefined()
  })

  test("a shell path gets -c, PowerShell gets -NoProfile -Command, never Shell.args' wrapping", () => {
    const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash"
    expect(Shell.invocation(bash, "ls", ["-la"])).toEqual({ file: bash, args: ["-c", "ls -la"] })
    const pwsh = process.platform === "win32" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : "/usr/bin/pwsh"
    expect(Shell.invocation(pwsh, "Get-Item", ["."])).toEqual({
      file: pwsh,
      args: ["-NoProfile", "-Command", "Get-Item ."],
    })
    expect(Shell.invocation("/bin/zsh", "x", [])).toEqual({ file: "/bin/zsh", args: ["-c", "x"] })
  })

  test.if(process.platform === "win32")("cmd.exe gives undefined", () => {
    expect(Shell.invocation("C:\\Windows\\System32\\cmd.exe", "dir", [])).toBeUndefined()
    expect(Shell.invocation("cmd", "dir", [])).toBeUndefined()
  })
})

// The oracle's own positive control: it must see a live tree, then see it gone.
describe("process-tree fixture", () => {
  test("the nonce oracle sees every process of a live tree and none after the tree is killed", async () => {
    const fixture = tree(2)
    const child = spawn(fixture.command, fixture.args, {
      stdio: ["ignore", "pipe", "inherit"],
      detached: process.platform !== "win32",
      windowsHide: true,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        let text = ""
        child.stdout.on("data", (data) => {
          text += String(data)
          if (text.includes(fixture.ready)) resolve()
        })
        child.once("exit", (code) => reject(new Error(`the tree root exited (${code}) before ready`)))
      })
      expect(await alive(fixture.nonce)).toBe(fixture.size)
      expect((await sweep(fixture.nonce)).length).toBe(fixture.size)
      await Shell.killTree(child)
      expect(await gone(fixture.nonce)).toBe(0)
      expect(await sweep(fixture.nonce)).toEqual([])
    } finally {
      await reap(fixture.nonce)
    }
  }, 60_000)
})

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

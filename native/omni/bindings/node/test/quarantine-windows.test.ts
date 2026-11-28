import { test, expect } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

const quarantine: {
  quarantineIdentity(path: string): Promise<string>
  quarantineInspect(path: string): Promise<string | null>
  quarantineRename(source: string, destination: string, identity: string): Promise<string>
} = createRequire(import.meta.url)("../index.js")

test.skipIf(process.platform !== "win32")("quarantine pins identity and refuses collisions and reparse components", async () => {
  const root = await mkdtemp(join(tmpdir(), "omni-quarantine-"))
  try {
    const source = join(root, "source")
    const target = join(root, "target")
    await writeFile(source, "source")
    await writeFile(target, "existing")
    const identity = await quarantine.quarantineIdentity(source)
    expect(identity).toMatch(/^[0-9a-f]{48}$/)
    expect(await quarantine.quarantineInspect(source)).toBe(identity)
    expect(await quarantine.quarantineInspect(join(root, "absent"))).toBeNull()
    await expect(quarantine.quarantineInspect(join(root, "missing-parent", "absent"))).rejects.toThrow()
    await expect(quarantine.quarantineRename(source, target, identity)).rejects.toThrow()
    expect(await readFile(target, "utf8")).toBe("existing")
    await expect(quarantine.quarantineRename(source, join(root, "wrong"), "0".repeat(48))).rejects.toThrow()
    await mkdir(join(root, "real"))
    await symlink(join(root, "real"), join(root, "link"), "junction")
    await expect(quarantine.quarantineRename(source, join(root, "link", "target"), identity)).rejects.toThrow()
    await expect(quarantine.quarantineInspect(join(root, "link", "absent"))).rejects.toThrow()
    await rm(target)
    expect(await quarantine.quarantineRename(source, target, identity)).toBe(identity)
    expect(await quarantine.quarantineIdentity(target)).toBe(identity)
    expect(await readFile(target, "utf8")).toBe("source")
    const directory = join(root, "directory")
    const movedDirectory = join(root, "moved-directory")
    await mkdir(directory)
    const directoryIdentity = await quarantine.quarantineIdentity(directory)
    expect(await quarantine.quarantineRename(directory, movedDirectory, directoryIdentity)).toBe(directoryIdentity)
    expect(await quarantine.quarantineInspect(movedDirectory)).toBe(directoryIdentity)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

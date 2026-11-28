import { test, expect } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { quarantineIdentity, quarantineInspect, quarantineRename } from "../index.js"

test.skipIf(process.platform !== "win32")("quarantine pins identity and refuses collisions and reparse components", async () => {
  const root = await mkdtemp(join(tmpdir(), "omni-quarantine-"))
  try {
    const source = join(root, "source")
    const target = join(root, "target")
    await writeFile(source, "source")
    await writeFile(target, "existing")
    const identity = await quarantineIdentity(source)
    expect(identity).toMatch(/^[0-9a-f]{48}$/)
    expect(await quarantineInspect(source)).toBe(identity)
    expect(await quarantineInspect(join(root, "absent"))).toBeNull()
    await expect(quarantineInspect(join(root, "missing-parent", "absent"))).rejects.toThrow()
    await expect(quarantineRename(source, target, identity)).rejects.toThrow()
    expect(await readFile(target, "utf8")).toBe("existing")
    await expect(quarantineRename(source, join(root, "wrong"), "0".repeat(48))).rejects.toThrow()
    await mkdir(join(root, "real"))
    await symlink(join(root, "real"), join(root, "link"), "junction")
    await expect(quarantineRename(source, join(root, "link", "target"), identity)).rejects.toThrow()
    await expect(quarantineInspect(join(root, "link", "absent"))).rejects.toThrow()
    await rm(target)
    expect(await quarantineRename(source, target, identity)).toBe(identity)
    expect(await quarantineIdentity(target)).toBe(identity)
    expect(await readFile(target, "utf8")).toBe("source")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

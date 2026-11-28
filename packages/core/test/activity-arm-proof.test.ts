import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, symlink, writeFile, link } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ActivityArmProof } from "../src/activity-arm-proof"

test("rejects links within a candidate copy", async () => {
  const worktree = await mkdtemp(path.join(tmpdir(), "activity-proof-"))
  try {
    await mkdir(path.join(worktree, ".turbo"))
    await symlink(worktree, path.join(worktree, ".turbo", "link"))
    expect(await ActivityArmProof.inspect({ worktree, name: ".turbo" })).toBeUndefined()
    await rm(path.join(worktree, ".turbo", "link"))
    await writeFile(path.join(worktree, "source"), "data")
    await link(path.join(worktree, "source"), path.join(worktree, ".turbo", "linked"))
    expect(await ActivityArmProof.inspect({ worktree, name: ".turbo" })).toBeUndefined()
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

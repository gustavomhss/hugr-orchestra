import { expect, test } from "bun:test"
import path from "node:path"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { archiveInventory } from "../../../script/archive-inventory"

test("captures immutable tracked blobs, modes and byte lengths at a pinned commit", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "archive-inventory-"))
  try {
    await git(directory, ["init", "-q"])
    await mkdir(path.join(directory, "scope"))
    await Bun.write(path.join(directory, "scope", "with space.txt"), "pinned\n")
    await Bun.write(path.join(directory, "scope", "run.sh"), "#!/bin/sh\n")
    await chmod(path.join(directory, "scope", "run.sh"), 0o755)
    await git(directory, ["add", "."])
    const blob = await git(directory, ["hash-object", "-w", "scope/with space.txt"])
    await git(directory, ["-c", "core.protectNTFS=false", "update-index", "--add", "--cacheinfo", `100644,${blob},scope/with space\tname.txt`])
    await git(directory, ["update-index", "--chmod=+x", "scope/run.sh"])
    await git(directory, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"], {
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    })
    const result = await archiveInventory(directory, "HEAD", [{ path: "scope", disposition: "review-history", owner: "fixture", readers: ["reader"] }])
    expect(result.format).toBe(1)
    expect(result.source.revision).toMatch(/^[0-9a-f]{40,64}$/)
    expect(result.scopes[0]?.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "scope/with space\tname.txt", bytes: 7, mode: "100644" }),
      expect.objectContaining({ path: "scope/run.sh", bytes: 10, mode: "100755" }),
    ]))
    await expect(archiveInventory(directory, result.source.revision, [{ path: "absent", disposition: "review-history", owner: "fixture", readers: ["reader"] }]))
      .rejects.toThrow("ARCHIVE_SCOPE_EMPTY")
    await Bun.write(path.join(directory, "scope", "with space.txt"), "working tree changed")
    expect((await archiveInventory(directory, result.source.revision, [{ path: "scope", disposition: "review-history", owner: "fixture", readers: ["reader"] }])).scopes[0]?.files)
      .toEqual(result.scopes[0]?.files)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects unresolved revisions, empty scopes, unsafe paths and overlapping scopes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "archive-inventory-invalid-"))
  try {
    await git(directory, ["init", "-q"])
    await mkdir(path.join(directory, "scope"))
    const valid = { path: "scope", disposition: "review-history" as const, owner: "fixture", readers: ["reader"] }
    await expect(archiveInventory(directory, "missing-revision", [valid])).rejects.toThrow("ARCHIVE_GIT_FAILED")
    await expect(archiveInventory(directory, "HEAD", [])).rejects.toThrow("ARCHIVE_SCOPES_EMPTY")
    await expect(archiveInventory(directory, "HEAD", [{ ...valid, path: "../scope" }])).rejects.toThrow("ARCHIVE_SCOPE_PATH_INVALID")
    await expect(archiveInventory(directory, "HEAD", [valid, { ...valid, path: "scope/nested" }])).rejects.toThrow("ARCHIVE_SCOPE_OVERLAP")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects sparse reader declarations before reading Git", async () => {
  const readers: string[] = []
  readers.length = 1
  await expect(archiveInventory(".", "HEAD", [{ path: "scope", disposition: "review-history", owner: "fixture", readers }]))
    .rejects.toThrow("ARCHIVE_SCOPE_INVALID")
})

async function git(directory: string, args: string[], env: Record<string, string> = {}) {
  const process = Bun.spawn(["git", "-C", directory, ...args], { env: { ...processEnv(), ...env }, stdout: "pipe", stderr: "pipe" })
  const [output, error, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  if (exitCode !== 0) throw new Error(`FIXTURE_GIT_FAILED:${error}:${output}`)
  return output.trim()
}

function processEnv() {
  return { PATH: Bun.env.PATH ?? "", HOME: Bun.env.HOME ?? "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }
}

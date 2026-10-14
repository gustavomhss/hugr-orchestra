import { expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createRecoveryBundle, restoreRecoveryBundle } from "../../../script/recovery-bundle.ts"
import { type Scope } from "../../../script/archive-inventory.ts"

const scopes: Scope[] = [{ path: "scope", disposition: "retain-recovery", owner: "fixture", readers: ["restore-fixture"], uncertainty: "fixture only" }]

test("recovery bundle pins Git bytes, deduplicates payloads and restores executable modes", async () => {
  const fixture = await makeFixture()
  try {
    await Bun.write(path.join(fixture.repository, "replacement"), "replacement blob")
    await git(fixture.repository, ["replace", await git(fixture.repository, ["rev-parse", "HEAD:scope/binary"]), await git(fixture.repository, ["hash-object", "-w", "replacement"])])
    await mkdir(fixture.bundle)
    const manifest = await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
    expect(manifest.source.revision).toBe(await git(fixture.repository, ["rev-parse", "HEAD"]))
    expect(manifest.source.tree).toBe(await git(fixture.repository, ["rev-parse", "HEAD^{tree}"]))
    expect(manifest.scopes).toEqual(scopes)
    expect(await readdir(path.join(fixture.bundle, "blobs"))).toHaveLength(2)
    await Bun.write(path.join(fixture.repository, "scope", "binary"), "changed working tree")
    await mkdir(fixture.restored)
    expect(await restoreRecoveryBundle(fixture.bundle, fixture.restored)).toEqual(manifest)
    expect(new Uint8Array(await Bun.file(path.join(fixture.restored, "scope", "binary")).arrayBuffer())).toEqual(new Uint8Array([0, 255, 13, 10]))
    expect(await Bun.file(path.join(fixture.restored, "scope", "run.sh")).text()).toBe("#!/bin/sh\n")
    if (process.platform !== "win32") {
      expect((await lstat(path.join(fixture.restored, "scope", "run.sh"))).mode & 0o777).toBe(0o755)
      expect((await lstat(path.join(fixture.restored, "scope", "binary"))).mode & 0o777).toBe(0o644)
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("creation refuses repository overlap, nonempty output and absent scopes", async () => {
  const fixture = await makeFixture()
  try {
    await expect(createRecoveryBundle(fixture.repository, "HEAD", path.join(fixture.repository, "output"), scopes)).rejects.toThrow("RECOVERY_DESTINATION_OVERLAP")
    await mkdir(fixture.bundle)
    await Bun.write(path.join(fixture.bundle, "keep"), "retained")
    await expect(createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)).rejects.toThrow("RECOVERY_DESTINATION_NOT_EMPTY")
    expect(await Bun.file(path.join(fixture.bundle, "keep")).text()).toBe("retained")
    await expect(createRecoveryBundle(fixture.repository, "HEAD", fixture.restored, [{ path: "absent", disposition: "retain-recovery", owner: "fixture", readers: ["restore-fixture"] }])).rejects.toThrow("ARCHIVE_SCOPE_EMPTY:absent")
    await expect(lstat(fixture.restored)).rejects.toThrow()
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

for (const failure of ["corrupt", "missing", "extra", "checksum", "manifest", "checksum-missing"] as const) {
  test(`restore rejects ${failure} input before creating output`, async () => {
    const fixture = await makeFixture()
    try {
      const manifest = await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
      const file = manifest.files[0]
      if (!file) throw new Error("FIXTURE_MEMBER_MISSING")
      const blob = path.join(fixture.bundle, "blobs", file.sha256)
      if (failure === "corrupt") await Bun.write(blob, "bad payload")
      if (failure === "missing") await rm(blob)
      if (failure === "extra") await Bun.write(path.join(fixture.bundle, "blobs", "unexpected"), "extra")
      if (failure === "checksum") await Bun.write(path.join(fixture.bundle, "manifest.sha256"), "0".repeat(64) + "\n")
      if (failure === "manifest") await rm(path.join(fixture.bundle, "manifest.json"))
      if (failure === "checksum-missing") await rm(path.join(fixture.bundle, "manifest.sha256"))
      const expected = failure === "corrupt" ? `RECOVERY_BLOB_INVALID:${file.path}` : failure === "missing" ? file.sha256 : failure === "extra" ? "RECOVERY_UNEXPECTED_BLOB:unexpected" : failure === "checksum" ? "RECOVERY_MANIFEST_CHECKSUM_INVALID" : failure === "manifest" ? "manifest.json" : "manifest.sha256"
      await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow(expected)
      await expect(lstat(fixture.restored)).rejects.toThrow()
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  })
}

for (const failure of ["path", "mode", "duplicate", "empty-scope", "empty-files", "size", "hash", "git-blob", "git-blob-mismatch", "format", "json"] as const) {
  test(`restore rejects checksum-valid invalid ${failure} manifest`, async () => {
    const fixture = await makeFixture()
    try {
      const manifest = await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
      const file = manifest.files[0]
      if (!file) throw new Error("FIXTURE_MEMBER_MISSING")
      if (failure === "path") file.path = "../escaped"
      if (failure === "mode") file.mode = "120000"
      if (failure === "duplicate") manifest.files.push({ ...file })
      if (failure === "empty-scope") manifest.scopes.push({ path: "absent", disposition: "retain-recovery", owner: "fixture", readers: ["reader"] })
      if (failure === "empty-files") manifest.files.length = 0
      if (failure === "size") file.bytes += 1
      if (failure === "hash") file.sha256 = "../invalid"
      if (failure === "git-blob") file.gitBlob = "invalid"
      if (failure === "git-blob-mismatch") file.gitBlob = "0".repeat(40)
      const bytes = failure === "json" ? "{" : JSON.stringify(failure === "format" ? { ...manifest, format: 2 } : manifest)
      await Bun.write(path.join(fixture.bundle, "manifest.json"), bytes)
      await Bun.write(path.join(fixture.bundle, "manifest.sha256"), createHash("sha256").update(bytes).digest("hex") + "\n")
      await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow("RECOVERY_")
      await expect(lstat(fixture.restored)).rejects.toThrow()
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  })
}

test("restore rejects overlapping, checkout and nonempty destinations", async () => {
  const fixture = await makeFixture()
  try {
    await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
    await expect(restoreRecoveryBundle(fixture.bundle, path.join(fixture.bundle, "output"))).rejects.toThrow("RECOVERY_DESTINATION_OVERLAP")
    await expect(restoreRecoveryBundle(fixture.bundle, fixture.root)).rejects.toThrow("RECOVERY_DESTINATION_OVERLAP")
    await expect(restoreRecoveryBundle(fixture.bundle, path.join(fixture.repository, "output"))).rejects.toThrow("RECOVERY_DESTINATION_REPOSITORY")
    await mkdir(fixture.restored)
    await Bun.write(path.join(fixture.restored, "keep"), "retained")
    await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow("RECOVERY_DESTINATION_NOT_EMPTY")
    expect(await readdir(fixture.restored)).toEqual(["keep"])
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test.skipIf(process.platform === "win32")("restore rejects symlink payload, manifest and destination", async () => {
  const fixture = await makeFixture()
  try {
    await symlink(fixture.repository, path.join(fixture.root, "source-alias"))
    await expect(createRecoveryBundle(fixture.repository, "HEAD", path.join(fixture.root, "source-alias", "output"), scopes)).rejects.toThrow("RECOVERY_DESTINATION_OVERLAP")
    const manifest = await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
    const file = manifest.files[0]
    if (!file) throw new Error("FIXTURE_MEMBER_MISSING")
    const blob = path.join(fixture.bundle, "blobs", file.sha256)
    await Bun.write(path.join(fixture.root, "external"), await Bun.file(blob).arrayBuffer())
    await rm(blob)
    await symlink(path.join(fixture.root, "external"), blob)
    await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow("RECOVERY_INPUT_INVALID")
    await rm(blob)
    await Bun.write(blob, await Bun.file(path.join(fixture.root, "external")).arrayBuffer())
    await mkdir(path.join(fixture.root, "empty"))
    await symlink(path.join(fixture.root, "empty"), fixture.restored)
    await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow("RECOVERY_DESTINATION_INVALID")
    await Bun.write(path.join(fixture.root, "manifest"), await Bun.file(path.join(fixture.bundle, "manifest.json")).arrayBuffer())
    await rm(path.join(fixture.bundle, "manifest.json"))
    await symlink(path.join(fixture.root, "manifest"), path.join(fixture.bundle, "manifest.json"))
    await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow("RECOVERY_INPUT_INVALID")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "recovery-bundle-"))
  const repository = path.join(root, "repository")
  await mkdir(path.join(repository, "scope"), { recursive: true })
  await git(repository, ["init", "-q"])
  await Bun.write(path.join(repository, "scope", "binary"), new Uint8Array([0, 255, 13, 10]))
  await Bun.write(path.join(repository, "scope", "copy"), new Uint8Array([0, 255, 13, 10]))
  await Bun.write(path.join(repository, "scope", "run.sh"), "#!/bin/sh\n")
  await chmod(path.join(repository, "scope", "run.sh"), 0o755)
  await git(repository, ["add", "scope"])
  await git(repository, ["update-index", "--chmod=+x", "scope/run.sh"])
  await git(repository, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"])
  return { root, repository, bundle: path.join(root, "bundle"), restored: path.join(root, "restored") }
}

async function git(repository: string, args: string[]) {
  const child = Bun.spawn(["git", "--no-replace-objects", "-C", repository, ...args], { env: { PATH: Bun.env.PATH ?? "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }, stdout: "pipe", stderr: "pipe" })
  const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (status !== 0) throw new Error(`FIXTURE_GIT_FAILED:${error}`)
  return output.trim()
}

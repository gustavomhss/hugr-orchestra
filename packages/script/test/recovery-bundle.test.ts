import { expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { mkdirSync, symlinkSync } from "node:fs"
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

test("restore rejects portable forbidden names and normalized aliases before destination writes", async () => {
  const fixture = await makeFixture()
  try {
    const original = await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
    const scope = original.scopes[0]
    if (!scope) throw new Error("FIXTURE_SCOPE_MISSING")
    for (const invalid of ["?", "*", "<", ">", '"', "|", "unicode-member", "unicode-scope"]) {
      const manifest = structuredClone(original)
      const file = manifest.files[0]
      if (!file) throw new Error("FIXTURE_MEMBER_MISSING")
      if (invalid === "unicode-member") {
        file.path = "scope/é"
        manifest.files.push({ ...file, path: "scope/e\u0301" })
      }
      if (invalid === "unicode-scope") {
        manifest.scopes = scopes.map((scope) => ({ ...scope, path: "scopé" }))
        manifest.scopes.push({ ...scope, path: "scope\u0301" })
      }
      if (!invalid.startsWith("unicode-")) file.path = `scope/bad${invalid}.txt`
      const bytes = JSON.stringify(manifest)
      await Bun.write(path.join(fixture.bundle, "manifest.json"), bytes)
      await Bun.write(path.join(fixture.bundle, "manifest.sha256"), createHash("sha256").update(bytes).digest("hex") + "\n")
      const expected = invalid === "unicode-member" ? "RECOVERY_MEMBER_OVERLAP" : invalid === "unicode-scope" ? "RECOVERY_SCOPE_OVERLAP" : "RECOVERY_PATH_INVALID"
      await expect(restoreRecoveryBundle(fixture.bundle, fixture.restored)).rejects.toThrow(expected)
      await expect(lstat(fixture.restored)).rejects.toThrow()
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("concurrent disjoint restores publish exactly one complete bundle", async () => {
  const first = await makeFixture()
  const second = await makeFixture()
  try {
    await git(second.repository, ["mv", "scope", "second-scope"])
    await git(second.repository, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "disjoint scope"])
    await createRecoveryBundle(first.repository, "HEAD", first.bundle, scopes)
    await createRecoveryBundle(second.repository, "HEAD", second.bundle, scopes.map((scope) => ({ ...scope, path: "second-scope" })))
    await mkdir(first.restored)
    const results = await Promise.allSettled([
      restoreRecoveryBundle(first.bundle, first.restored), restoreRecoveryBundle(second.bundle, first.restored),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    const winner = results.find((result) => result.status === "fulfilled")
    if (!winner || winner.status !== "fulfilled") throw new Error("FIXTURE_RESTORE_WINNER_MISSING")
    const scope = winner.value.scopes[0]
    if (!scope) throw new Error("FIXTURE_SCOPE_MISSING")
    expect(await readdir(first.restored)).toEqual(winner.value.scopes.map((scope) => scope.path))
    expect((await readdir(path.join(first.restored, scope.path))).sort()).toEqual(["binary", "copy", "run.sh"])
  } finally {
    await rm(first.root, { recursive: true, force: true })
    await rm(second.root, { recursive: true, force: true })
  }
})

test.each(["symlink", "empty-present", "empty-absent"] as const)("destination %s injection cannot replace private restore publication", async (variant) => {
  const fixture = await makeFixture()
  const external = path.join(fixture.root, "external-destination")
  try {
    await Promise.all(Array.from({ length: 32 }, (_, index) => Bun.write(path.join(fixture.repository, "scope", `witness-${index}`), "small member")))
    await git(fixture.repository, ["add", "scope"])
    await git(fixture.repository, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "race witness members"])
    await createRecoveryBundle(fixture.repository, "HEAD", fixture.bundle, scopes)
    if (variant !== "empty-absent") await mkdir(fixture.restored)
    const original = variant !== "empty-absent" ? await lstat(fixture.restored) : undefined
    await mkdir(external)
    await Bun.write(path.join(external, "keep"), "retained")
    const observed = { swapped: false, settled: false }
    const identities: { dev: number; ino: number }[] = []
    const pending = restoreRecoveryBundle(fixture.bundle, fixture.restored).then(
      (manifest) => ({ status: "fulfilled" as const, manifest }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => { observed.settled = true })
    const deadline = Date.now() + 5000
    while (!observed.swapped && !observed.settled && Date.now() < deadline) {
      const scratch = (await readdir(fixture.root)).find((name) => name.startsWith(".orchestra-recovery-"))
      if (!scratch) continue
      const claimed = await lstat(path.join(fixture.root, scratch, variant === "empty-absent" ? "snapshot" : "previous-slot"))
        .catch(() => undefined)
      if (!claimed?.isDirectory()) continue
      if (original) {
        expect(claimed.dev).toBe(original.dev)
        expect(claimed.ino).toBe(original.ino)
      }
      mkdirSync(fixture.restored)
      if (variant === "symlink") symlinkSync(external, path.join(fixture.restored, "scope"), "junction")
      identities.push(await lstat(fixture.restored))
      observed.swapped = true
    }
    const result = await pending
    expect(observed.swapped).toBe(true)
    expect(result.status).toBe("rejected")
    if (result.status !== "rejected") throw new Error("FIXTURE_RESTORE_ACCEPTED_CHANGED_DESTINATION")
    expect(String(result.error)).toContain("RECOVERY_DESTINATION_PUBLISH_FAILED")
    const current = await lstat(fixture.restored)
    expect(identities).toHaveLength(1)
    const identity = identities[0]
    if (!identity) throw new Error("FIXTURE_COMPETING_SLOT_NOT_OBSERVED")
    expect(current.dev).toBe(identity.dev)
    expect(current.ino).toBe(identity.ino)
    expect(await readdir(fixture.restored)).toEqual(variant === "symlink" ? ["scope"] : [])
    expect(await readdir(external)).toEqual(["keep"])
    expect(await Bun.file(path.join(external, "keep")).text()).toBe("retained")
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
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

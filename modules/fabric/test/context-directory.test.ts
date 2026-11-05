import { afterAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inspect } from "node:util"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect, Exit, Schema } from "effect"
import { FabricContextDirectory } from "../src/context-directory"

const temporary = await mkdtemp(path.join(os.tmpdir(), "orchestra-context-directory-"))
afterAll(() => rm(temporary, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))
const sample = async () => {
  const folder = await mkdtemp(path.join(temporary, "case-"))
  return { folder, root: AbsolutePath.make(path.join(folder, "contexts")),
    record: { id: FabricContext.ID.create(), nonce: randomBytes(32).toString("base64url") } }
}
const marker = (directory: string) => path.join(directory, ".orchestra-fabric-context")

async function rejected(effect: Effect.Effect<unknown, FabricContext.Failure>, hidden: readonly string[]) {
  const exit = await Effect.runPromise(Effect.exit(effect))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected a typed directory refusal")
  expect(exit.cause.reasons).toHaveLength(1)
  const reason = exit.cause.reasons[0]
  if (reason?._tag !== "Fail" || !(reason.error instanceof FabricContext.Failure))
    throw new Error("Expected canonical failure, not an import, defect or interruption")
  expect(reason.error.code).toBe("unavailable")
  expect(reason.error.message).toBe("Fabric context directory is unavailable")
  expect(Object.hasOwn(reason.error, "cause")).toBe(false)
  expect(Object.getOwnPropertyNames(reason.error).filter((key) =>
    !["stack", "name", "message", "code", "_tag"].includes(key))).toEqual([])
  expect(Object.keys(Schema.encodeSync(FabricContext.Failure)(reason.error)).sort()).toEqual(["_tag", "code", "message"])
  const text = `${reason.error.message}\n${JSON.stringify(reason.error)}\n${inspect(reason.error, { showHidden: true, customInspect: false })}`
  for (const value of hidden) expect(text).not.toContain(value)
}

test("FSD01 real private directories bind exact markers and resume without replacing files", async () => {
  const f = await sample()
  const directory = await Effect.runPromise(FabricContextDirectory.make(f.root))
  expect(directory.root).toBe(AbsolutePath.make(await realpath(f.root)))
  expect((await stat(directory.root)).mode & 0o777).toBe(0o700)
  expect(await readdir(directory.root)).toEqual([])
  const prepared = await Effect.runPromise(directory.prepare(f.record))
  expect(prepared).toBe(AbsolutePath.make(path.join(directory.root, f.record.id)))
  expect((await stat(prepared)).mode & 0o777).toBe(0o700)
  expect((await stat(marker(prepared))).mode & 0o777).toBe(0o600)
  const body = await readFile(marker(prepared), "utf8")
  const decoded = Schema.decodeUnknownSync(Schema.Struct({ id: FabricContext.ID, nonce: Schema.NonEmptyString })
    .annotate({ parseOptions: { onExcessProperty: "error" } }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(body))
  expect(decoded.id === f.record.id && decoded.nonce === f.record.nonce).toBe(true)
  expect(await Effect.runPromise(directory.observe(f.record))).toBe(prepared)
  await writeFile(path.join(prepared, "owned-sentinel"), "synthetic owned data")
  const before = await stat(marker(prepared))
  const fresh = await Effect.runPromise(FabricContextDirectory.make(f.root))
  expect(await Effect.runPromise(fresh.prepare(f.record))).toBe(prepared)
  expect(await Effect.runPromise(fresh.observe(f.record))).toBe(prepared)
  expect((await readFile(marker(prepared), "utf8")) === body).toBe(true)
  expect((await stat(marker(prepared))).ino).toBe(before.ino)
  expect(await readFile(path.join(prepared, "owned-sentinel"), "utf8")).toBe("synthetic owned data")
  // The format permits up to and including 1024 bytes, not merely smaller JSON.
  const boundary = body + " ".repeat(1024 - Buffer.byteLength(body))
  expect(Buffer.byteLength(boundary)).toBe(1024)
  await writeFile(marker(prepared), boundary)
  expect(await Effect.runPromise(fresh.observe(f.record))).toBe(prepared)
  expect(await Effect.runPromise(fresh.prepare(f.record))).toBe(prepared)
  expect((await readFile(marker(prepared), "utf8")) === boundary).toBe(true)
})

test("FSD02 mismatched and unmarked directories are refused without repair or content leakage", async () => {
  for (const kind of ["missing", "unmarked", "wrong-id", "wrong-nonce", "extra", "malformed"] as const) {
    const f = await sample()
    const directory = await Effect.runPromise(FabricContextDirectory.make(f.root))
    const target = path.join(directory.root, f.record.id)
    const secret = "SYNTHETIC_PRIVATE_DIRECTORY_SENTINEL"
    const body = kind === "wrong-id" ? JSON.stringify({ ...f.record, id: FabricContext.ID.create() })
      : kind === "wrong-nonce" ? JSON.stringify({ ...f.record, nonce: secret })
      : kind === "extra" ? JSON.stringify({ ...f.record, extra: secret }) : secret
    if (kind !== "missing") {
      await mkdir(target, { mode: 0o700 })
      await writeFile(path.join(target, "sentinel"), secret)
      if (kind !== "unmarked") await writeFile(marker(target), body, { mode: 0o600 })
    }
    const before = kind === "missing" ? [] : (await readdir(target)).sort()
    await rejected(directory.observe(f.record), [secret, f.record.nonce, body])
    // Missing is the valid creation case, but observation must never create it.
    if (kind === "missing") {
      expect(await readdir(directory.root)).toEqual([])
      expect(await Effect.runPromise(directory.prepare(f.record))).toBe(AbsolutePath.make(target))
      continue
    }
    expect((await readdir(target)).sort()).toEqual(before)
    expect(await readFile(path.join(target, "sentinel"), "utf8")).toBe(secret)
    if (kind !== "unmarked") expect((await readFile(marker(target), "utf8")) === body).toBe(true)
    await rejected(directory.prepare(f.record), [secret, f.record.nonce, body])
    expect((await readdir(target)).sort()).toEqual(before)
    expect(await readFile(path.join(target, "sentinel"), "utf8")).toBe(secret)
    if (kind !== "unmarked") expect((await readFile(marker(target), "utf8")) === body).toBe(true)
  }
})

test("FSD03 valid symlink targets and oversized valid JSON cannot bypass the directory boundary", async () => {
  for (const kind of ["directory-link", "marker-link", "oversized"] as const) {
    const f = await sample()
    const directory = await Effect.runPromise(FabricContextDirectory.make(f.root))
    const target = path.join(directory.root, f.record.id)
    const external = path.join(f.folder, "external")
    const body = JSON.stringify(f.record)
    const oversized = body + " ".repeat(1025 - Buffer.byteLength(body))
    await mkdir(external, { mode: 0o700 })
    await writeFile(path.join(external, "sentinel"), "synthetic external data")
    if (kind === "directory-link") {
      await writeFile(marker(external), body, { mode: 0o600 })
      await symlink(external, target, "dir")
    }
    if (kind !== "directory-link") await mkdir(target, { mode: 0o700 })
    if (kind === "marker-link") {
      await writeFile(marker(external), body, { mode: 0o600 })
      await symlink(marker(external), marker(target), "file")
    }
    if (kind === "oversized") await writeFile(marker(target), oversized, { mode: 0o600 })
    const before = (await readdir(directory.root)).sort()
    await rejected(directory.observe(f.record), [f.record.nonce, body])
    await rejected(directory.prepare(f.record), [f.record.nonce, body])
    expect((await readdir(directory.root)).sort()).toEqual(before)
    expect(await readFile(path.join(external, "sentinel"), "utf8")).toBe("synthetic external data")
    if (kind === "directory-link") expect((await lstat(target)).isSymbolicLink()).toBe(true)
    if (kind === "marker-link") expect((await lstat(marker(target))).isSymbolicLink()).toBe(true)
    if (kind !== "oversized") expect((await readFile(marker(external), "utf8")) === body).toBe(true)
    if (kind === "oversized") expect((await readFile(marker(target), "utf8")) === oversized).toBe(true)
  }
  const f = await sample()
  await writeFile(f.root, "synthetic non-directory root")
  await rejected(FabricContextDirectory.make(f.root), ["synthetic non-directory root", f.root])
  expect(await readFile(f.root, "utf8")).toBe("synthetic non-directory root")
})

test("FSD04 preexisting permissive roots and children cannot be adopted or repaired", async () => {
  const root = await sample()
  await mkdir(root.root, { mode: 0o755 })
  await chmod(root.root, 0o755)
  await writeFile(path.join(root.root, "sentinel"), "synthetic root mode sentinel")
  await rejected(FabricContextDirectory.make(root.root), [root.root, "synthetic root mode sentinel"])
  expect((await stat(root.root)).mode & 0o777).toBe(0o755)
  expect(await readdir(root.root)).toEqual(["sentinel"])
  expect(await readFile(path.join(root.root, "sentinel"), "utf8")).toBe("synthetic root mode sentinel")
  const child = await sample()
  const directory = await Effect.runPromise(FabricContextDirectory.make(child.root))
  const target = path.join(directory.root, child.record.id)
  await mkdir(target, { mode: 0o755 })
  await chmod(target, 0o755)
  const body = JSON.stringify(child.record)
  await writeFile(marker(target), body, { mode: 0o600 })
  await writeFile(path.join(target, "sentinel"), "synthetic child mode sentinel")
  const before = (await readdir(target)).sort()
  await rejected(directory.observe(child.record), [body, child.record.nonce])
  expect((await stat(target)).mode & 0o777).toBe(0o755)
  expect((await readdir(target)).sort()).toEqual(before)
  await rejected(directory.prepare(child.record), [body, child.record.nonce])
  expect((await stat(target)).mode & 0o777).toBe(0o755)
  expect((await readdir(target)).sort()).toEqual(before)
  expect((await readFile(marker(target), "utf8")) === body).toBe(true)
  expect(await readFile(path.join(target, "sentinel"), "utf8")).toBe("synthetic child mode sentinel")
})

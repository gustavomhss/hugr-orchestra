import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { admit, listSources } from "../src/admit"
import { digest, memoryStore, placed, withStore } from "../src/context"

const locationId = "loc"
const inside = "/location/loc/notes.txt"

test("A76 — With no admit call, the location inventory contains zero sources, no chunk, no embedding vector, and no write under `.atlas/`. A path that was not successfully admitted is never listed.", async () => {
  const store = memoryStore({ projectRoot: "/repo" })
  await withStore(store, async () => {
    expect(await listSources(locationId)).toEqual([])
    expect(store.sources()).toEqual([])
    expect(store.chunks()).toEqual([])
    expect(store.pipeline(locationId).embedding).toBe(false)
    expect(store.atlasWrites).toBe(0)
    const refused = await admit({ locationId, path: "/tmp/../repo/src/main.ts" })
    expect(refused).toEqual({ refused: "atlas" })
    expect(await listSources(locationId)).toEqual([])
    expect(store.sources()).toEqual([])
    expect(store.chunks()).toEqual([])
    expect(store.atlasWrites).toBe(0)
  })
})

test("a redundant slash in the location root still admits a file inside that location", async () => {
  const file = "/location/loc/studio/work/corpus/note.txt"
  const store = memoryStore({
    projectRoot: "/",
    locationRoot: "/location/loc//studio/work",
    files: { [file]: "The harbor light is blue." },
  })
  await withStore(store, async () => {
    const admitted = await admit({ locationId: "/location/loc//studio/work", path: file })
    expect("id" in admitted).toBe(true)
    if (!("id" in admitted)) return
    expect(admitted.path).toBe(file)
    expect(admitted.status).toBe("not_yet_read")
  })
})

test("the same file through a symlink is one source", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rag-place-"))
  const real = path.join(root, "real")
  const link = path.join(root, "link")
  fs.mkdirSync(real)
  fs.symlinkSync(real, link)
  const file = path.join(real, "note.txt")
  fs.writeFileSync(file, "The harbor light is blue.")
  const viaLink = path.join(link, "note.txt")
  const stored = placed(file)
  const soon = path.join(link, "soon.txt")
  const store = memoryStore({
    projectRoot: path.parse(root).root,
    locationRoot: link,
    files: { [stored]: "The harbor light is blue.", [placed(soon)]: "soon" },
  })
  await withStore(store, async () => {
    const first = await admit({ locationId: link, path: viaLink })
    const second = await admit({ locationId: link, path: file })
    const created = await admit({ locationId: link, path: soon })
    expect("id" in first && "id" in second && "id" in created).toBe(true)
    if (!("id" in first) || !("id" in second) || !("id" in created)) return
    expect(first.id).toBe(second.id)
    expect(first.path).toBe(stored)
    expect(store.sources()).toHaveLength(2)
    const gone = path.join(link, "gone", "note.txt")
    expect(placed(gone)).toBe(path.join(fs.realpathSync(link), "gone", "note.txt").split(path.sep).join("/"))
  })
})

test("A01 — Admitting a file inside the location, and outside the project source tree, creates one source with a stable id and a content hash. Editing the bytes keeps the same id and changes the hash.", async () => {
  const store = memoryStore({
    projectRoot: "/repo",
    files: { [inside]: "alpha" },
  })
  await withStore(store, async () => {
    const admitted = await admit({ locationId, path: inside })
    const id = `src_${digest(locationId + "\0" + inside).slice(0, 12)}`
    expect(admitted).toEqual({
      id,
      locationId,
      path: inside,
      contentHash: digest("alpha"),
      status: "not_yet_read",
    })
    expect(store.sources()).toHaveLength(1)
    expect(store.chunks()).toEqual([])
    expect(store.atlasWrites).toBe(0)
    if (!("id" in admitted)) throw new Error("admit")
    expect(await listSources(locationId)).toEqual([admitted])
    store.writeFile(inside, "beta")
    const edited = await admit({ locationId, path: inside })
    expect(edited).toEqual({
      id,
      locationId,
      path: inside,
      contentHash: digest("beta"),
      status: "not_yet_read",
    })
    expect(edited).not.toEqual(admitted)
    expect(store.sources()).toHaveLength(1)
    expect(store.sources()[0]?.text).toBe("beta")
    expect(store.chunks()).toEqual([])
    expect(store.atlasWrites).toBe(0)
    store.writeFile("/location/loc/a.txt", "alpha")
    await admit({ locationId, path: "/location/loc/a.txt" })
    expect((await listSources(locationId)).map((source) => source.path)).toEqual(["/location/loc/a.txt", inside])
  })
})

test("A02 — Admitting the same path again does not create a second source.", async () => {
  const store = memoryStore({
    projectRoot: "/repo",
    files: { [inside]: "alpha" },
  })
  await withStore(store, async () => {
    const first = await admit({ locationId, path: inside })
    const second = await admit({ locationId, path: inside })
    expect(second).toEqual(first)
    expect(store.sources()).toHaveLength(1)
    if (!("id" in first)) throw new Error("admit")
    expect(await listSources(locationId)).toEqual([first])
    const stored = store.sources()[0]
    if (!stored) throw new Error("rejected")
    store.putSource({ ...stored, status: "read" })
    const reread = await admit({ locationId, path: inside })
    expect(reread).toEqual({
      id: stored.id,
      locationId,
      path: inside,
      contentHash: digest("alpha"),
      status: "read",
    })
    expect(store.sources()).toHaveLength(1)
    expect(store.sources()[0]?.status).toBe("read")
  })
})

test("A03 — A path outside the location is refused until external-directory permission exists. No source row is written.", async () => {
  const closed = memoryStore({
    projectRoot: "/repo",
    allowExternal: () => false,
  })
  await withStore(closed, async () => {
    const refused = await admit({ locationId, path: "/outside/secret.txt" })
    expect(refused).toEqual({ refused: "permission" })
    expect(closed.sources()).toEqual([])
    expect(closed.chunks()).toEqual([])
    expect(await listSources(locationId)).toEqual([])
    expect(closed.atlasWrites).toBe(0)
  })
  const open = memoryStore({
    projectRoot: "/repo",
    allowExternal: (_locationId, file) => file === "/outside/secret.txt",
    files: { "/outside/secret.txt": "alpha" },
  })
  await withStore(open, async () => {
    const admitted = await admit({ locationId, path: "/outside/secret.txt" })
    expect(admitted).toEqual({
      id: `src_${digest(locationId + "\0" + "/outside/secret.txt").slice(0, 12)}`,
      locationId,
      path: "/outside/secret.txt",
      contentHash: digest("alpha"),
      status: "not_yet_read",
    })
    expect(open.sources()).toHaveLength(1)
    if (!("id" in admitted)) throw new Error("admit")
    expect(await listSources(locationId)).toEqual([admitted])
    expect(open.chunks()).toEqual([])
    expect(open.atlasWrites).toBe(0)
  })
})

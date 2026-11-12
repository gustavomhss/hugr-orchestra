import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, parse, relative, sep } from "node:path"
import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { RagPipelineTable, RagSourceTable } from "@orchestra/core/rag-studio/sql"
import { admit, canonical, listSources, memoryStore, placed, readPipeline, withStore } from "@orchestra/rag-studio"
import { extract } from "@orchestra/rag-studio/extract"
import { Context, Effect, Layer } from "effect"
import { admitFile, session } from "../src/handlers/rag-studio-session"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/core/schema"

test("opening the folder as a symlink and as its real path is one corpus", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-loc-")))
  const linkParent = await mkdtemp(join(tmpdir(), "rag-loc-link-"))
  const link = join(linkParent, "open")
  await symlink(root, link)
  const project = join(root, "project")
  const corpus = join(root, "corpus")
  await mkdir(project)
  await mkdir(corpus)
  const file = join(corpus, "note.txt")
  await writeFile(file, "The harbor light is blue.")
  try {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = Context.get(
            yield* Layer.build(Database.layerFromPath(join(root, "orchestra.sqlite"))),
            Database.Service,
          )
          const opened = (directory: string) =>
            Location.Service.of({
              directory,
              project: { directory: project, id: "prj" },
            } as unknown as Location.Interface)
          yield* database.db
            .insert(RagSourceTable)
            .values({
              id: "src_old",
              location_id: link,
              path: placed(file),
              content_hash: "old",
              status: "read",
            })
            .run()
          const admitted = yield* session(database.db, async (store, locationId) => {
            const read = await extract(file)
            const path = placed(file)
            if ("text" in read) store.writeFile(path, read.text)
            return { locationId, source: await admit({ locationId, path }) }
          }).pipe(Effect.provideService(Location.Service, opened(link)))
          const listed = yield* session(database.db, async (_store, locationId) => {
            return { locationId, sources: await listSources(locationId) }
          }).pipe(Effect.provideService(Location.Service, opened(root)))
          const stored = yield* database.db.select().from(RagSourceTable).all()
          return { admitted, listed, stored }
        }),
      ),
    )
    expect(result.admitted.locationId).toBe(placed(link))
    expect(result.listed.locationId).toBe(result.admitted.locationId)
    expect("id" in result.admitted.source).toBe(true)
    if (!("id" in result.admitted.source)) return
    expect(result.admitted.source.id).toBe("src_old")
    expect(result.listed.sources.map((row) => row.id)).toEqual(["src_old"])
    expect(result.stored.map((row) => row.location_id)).toEqual([placed(link)])
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(linkParent, { recursive: true, force: true })
  }
})

test("a named model on the old spelling survives a default pipeline on the real path", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-pipe-")))
  const linkParent = await mkdtemp(join(tmpdir(), "rag-pipe-link-"))
  const link = join(linkParent, "open")
  await symlink(root, link)
  const project = join(root, "project")
  await mkdir(project)
  const model = "nvidia/nemotron-3-embed-1b:free"
  try {
    const pipeline = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = Context.get(
            yield* Layer.build(Database.layerFromPath(join(root, "orchestra.sqlite"))),
            Database.Service,
          )
          const row = {
            parser: "plain",
            boundary: "document",
            tokenizer: "utf16",
            k: 4,
          }
          yield* database.db
            .insert(RagPipelineTable)
            .values({ ...row, location_id: root, embedding_model: "" })
            .run()
          yield* database.db
            .insert(RagPipelineTable)
            .values({ ...row, location_id: link, embedding_model: model })
            .run()
          const opened = Location.Service.of({
            directory: root,
            project: { directory: project, id: "prj" },
          } as unknown as Location.Interface)
          return yield* session(database.db, async (_store, locationId) => readPipeline(locationId)).pipe(
            Effect.provideService(Location.Service, opened),
          )
        }),
      ),
    )
    expect(pipeline.embeddingModel).toBe(model)
    expect(pipeline.embedding).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(linkParent, { recursive: true, force: true })
  }
})


test("native paths admit location children and still refuse project and neighboring paths", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-native-")))
  try {
    const location = join(root, "corpus")
    const project = join(location, "project")
    const file = join(location, "note.txt")
    const neighbor = join(root, "corpus-other", "note.txt")
    await mkdir(project, { recursive: true })
    await writeFile(file, "location text")
    const store = memoryStore({ projectRoot: project, locationRoot: location, files: { [placed(file)]: "location text" } })
    await withStore(store, async () => {
      expect("id" in await admit({ locationId: placed(location), path: file })).toBe(true)
      expect(await admit({ locationId: placed(location), path: join(project, "private.txt") })).toEqual({ refused: "atlas" })
      expect(await admit({ locationId: placed(location), path: neighbor })).toEqual({ refused: "permission" })
      expect(placed(join(location, "missing", "future.txt"))).toBe(`${placed(location)}/missing/future.txt`)
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test("logical location paths stay lexical while native separators preserve their platform meaning", async () => {
  const store = memoryStore({ projectRoot: "/repo", locationRoot: "/location/loc", files: { "/location/loc/note.txt": "logical" } })
  await withStore(store, async () => {
    expect(placed("/location/loc/note.txt")).toBe("/location/loc/note.txt")
    expect("id" in await admit({ locationId: "loc", path: "/location/loc/note.txt" })).toBe(true)
    expect(await admit({ locationId: "loc", path: "/repo/private.txt" })).toEqual({ refused: "atlas" })
  })
  expect(canonical("note\\part.txt")).toBe(process.platform === "win32" ? "note/part.txt" : "note\\part.txt")
  if (process.platform === "win32") expect(canonical("\\\\server\\share\\note.txt")).toBe("//server/share/note.txt")
})


test("a native store refuses root-relative project paths even with external permission", async () => {
  const root = await realpath(await mkdtemp(join(process.cwd(), ".rag-project-")))
  try {
    const project = join(root, "project")
    await mkdir(project)
    const file = join(sep, relative(parse(project).root, project), "private.txt")
    const store = memoryStore({
      projectRoot: project,
      locationRoot: join(root, "corpus"),
      allowExternal: () => true,
      files: { [canonical(file)]: "project source" },
    })
    await withStore(store, async () => {
      expect(await admit({ locationId: placed(join(root, "corpus")), path: file })).toEqual({ refused: "atlas" })
      expect(store.sources()).toEqual([])
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a filesystem-root project refuses corpus children before external permission", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-root-")))
  try {
    const file = join(root, "private.txt")
    const store = memoryStore({
      projectRoot: parse(file).root,
      locationRoot: root,
      allowExternal: () => true,
      files: { [placed(file)]: "project source" },
    })
    await withStore(store, async () => {
      expect(await admit({ locationId: placed(root), path: file })).toEqual({ refused: "atlas" })
      expect(store.sources()).toEqual([])
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test("a non-project global location keeps a corpus despite its filesystem-root placeholder", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-global-")))
  const file = join(root, "note.txt")
  await writeFile(file, "global corpus")
  try {
    const source = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = Context.get(yield* Layer.build(Database.layerFromPath(join(root, "global.sqlite"))), Database.Service)
      return yield* session(database.db, (store, locationId) => admitFile(store, locationId, file)).pipe(
        Effect.provideService(Location.Service, Location.Service.of({
          directory: AbsolutePath.make(root),
          project: { id: Project.ID.global, directory: AbsolutePath.make(parse(root).root) },
        })),
      )
    })))
    expect("id" in source).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("native root-relative corpus reads use the same canonical path for admission and bytes", async () => {
  const root = await realpath(await mkdtemp(join(process.cwd(), ".rag-corpus-")))
  const file = join(root, "note.txt")
  await writeFile(file, "corpus bytes")
  try {
    const store = memoryStore({ projectRoot: join(root, "project"), locationRoot: root })
    await withStore(store, async () => {
      const source = await admitFile(store, placed(root), join(sep, relative(parse(file).root, file)))
      expect("id" in source).toBe(true)
      if ("id" in source) expect(source.path).toBe(placed(file))
      expect(store.sources()).toHaveLength(1)
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test.each(["worktree", "filesystem root"])("an unidentified Git %s still excludes project source", async (placement) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rag-unidentified-")))
  const file = join(root, "private.txt")
  await writeFile(file, "project source")
  try {
    const source = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = Context.get(yield* Layer.build(Database.layerFromPath(join(root, "project.sqlite"))), Database.Service)
      return yield* session(database.db, (store, locationId) => admitFile(store, locationId, file)).pipe(
        Effect.provideService(Location.Service, Location.Service.of({
          directory: AbsolutePath.make(root),
          project: { id: Project.ID.global, directory: AbsolutePath.make(placement === "worktree" ? root : parse(root).root) },
          vcs: { type: "git", store: AbsolutePath.make(join(root, ".git")) },
        })),
      )
    })))
    expect(source).toEqual({ refused: "atlas" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

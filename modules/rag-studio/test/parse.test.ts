import { expect, test } from "bun:test"
import { digest, memoryStore, withStore } from "../src/context"
import { parseSource } from "../src/parse"

function admitted(id: string, file: string, body: string | { failed: "no_text_layer"; bytes: string }) {
  const store = memoryStore({ projectRoot: "/project" })
  store.writeFile(file, body)
  store.putSource({
    id,
    locationId: "loc_1",
    path: file,
    contentHash: "",
    status: "not_yet_read",
    text: "",
  })
  return store
}

test("A05 — A newly admitted file is `not_yet_read` until a parse pass finishes. It is not `read` and not `failed`.", async () => {
  const store = admitted("src_a05", "/location/loc_1/a05.txt", "admitted before parse")
  const before = store.sources().find((item) => item.id === "src_a05")
  expect(before?.status).toBe("not_yet_read")
  expect(before?.status).not.toBe("read")
  expect(before?.status).not.toBe("failed")
  const parsed = await withStore(store, () => parseSource("src_a05"))
  expect(parsed.status).not.toBe("not_yet_read")
  expect(parsed.status).not.toBe(before?.status)
})

test("A51 — After the parse pass finishes on a plain-text file, that source's status is `read`.", async () => {
  const sourceText = "plain text"
  const store = admitted("src_a51", "/location/loc_1/a51.txt", sourceText)
  const parsed = await withStore(store, () => parseSource("src_a51"))
  expect(parsed.status).toBe("read")
  expect(store.sources().find((item) => item.id === "src_a51")?.status).toBe("read")
  expect(parsed.contentHash).toBe(digest(sourceText))
})

test("A07 — A PDF page with no text layer is `failed`, not an empty successful read.", async () => {
  const bytes = "%PDF-1.7"
  const store = admitted("src_a07", "/location/loc_1/a07.pdf", { failed: "no_text_layer", bytes })
  store.putChunk({
    id: "chk_old",
    sourceId: "src_a07",
    start: 0,
    end: 0,
    text: "",
    sourceHash: "old",
  })
  const parsed = await withStore(store, () => parseSource("src_a07"))
  expect(parsed.status).toBe("failed")
  expect(store.chunks().filter((chunk) => chunk.sourceId === "src_a07")).toHaveLength(0)
  expect(store.sources().find((item) => item.id === "src_a07")?.text).toBe("")
  expect(parsed.contentHash).toBe(digest(bytes))
})

test("A08 — For a plain-text or markdown file, each chunk's stored text equals the admitted string from `start` to `end`.", async () => {
  const sourceText = "# title\n\nbody line"
  const store = admitted("src_a08", "/location/loc_1/a08.md", sourceText)
  store.putChunk({
    id: "chk_stale",
    sourceId: "src_a08",
    start: 1,
    end: 2,
    text: "NO",
    sourceHash: "stale",
  })
  await withStore(store, () => parseSource("src_a08"))
  const chunks = store.chunks().filter((chunk) => chunk.sourceId === "src_a08")
  expect(chunks.length).toBeGreaterThan(0)
  chunks.forEach((chunk) => {
    expect(chunk.text === sourceText.slice(chunk.start, chunk.end)).toBe(true)
  })
})

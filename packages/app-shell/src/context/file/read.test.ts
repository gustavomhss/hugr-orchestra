import { describe, expect, test } from "bun:test"
import { createPathHelpers } from "./path"
import { readFileContent } from "./read"

// The V2 server serves raw bytes; images keep them as base64 with a MIME type so the media viewers can preview them.
const v2 = (bytes: Uint8Array) =>
  ({
    ready: Promise.resolve(),
    directory: "/repo",
    api: { file: { read: async () => bytes } },
  }) as unknown as Parameters<typeof readFileContent>[0]

describe("readFileContent on V2", () => {
  test("returns an image as base64 with its MIME type", async () => {
    expect(await readFileContent(v2(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0])), "logo.PNG")).toEqual({
      type: "binary",
      content: "iVBORwA=",
      encoding: "base64",
      mimeType: "image/png",
    })
  })

  test("keeps SVG as text with its MIME type and other NUL content as an empty binary", async () => {
    expect(await readFileContent(v2(new TextEncoder().encode("<svg/>")), "icon.svg")).toEqual({
      type: "text",
      content: "<svg/>",
      mimeType: "image/svg+xml",
    })
    expect(await readFileContent(v2(new Uint8Array([1, 0, 2])), "data.bin")).toEqual({ type: "binary", content: "" })
  })
})

test("tab selection reads the exact literal filename rather than its similar neighbour", async () => {
  const path = createPathHelpers(() => "/repo")
  const files = new Map([
    ["notes#review.md", "hash"],
    ["notes?review.md", "query"],
    ["a%20b.txt", "percent"],
    ["notes", "wrong"],
    ["a b.txt", "wrong"],
  ])
  const reads: string[] = []
  const sdk = {
    directory: "/repo",
    api: {
      file: {
        read: async (input: { path: string }) => {
          reads.push(input.path)
          return new TextEncoder().encode(files.get(input.path))
        },
      },
    },
  } as unknown as Parameters<typeof readFileContent>[0]
  for (const [name, expected] of [...files].slice(0, 3)) {
    const selected = path.pathFromTab(path.tab(name))!
    expect(await readFileContent(sdk, path.normalize(selected))).toEqual({ type: "text", content: expected })
  }
  expect(reads).toEqual(["notes#review.md", "notes?review.md", "a%20b.txt"])
})

import { describe, expect, test } from "bun:test"
import { readFileContent } from "./read"

// The V2 server serves raw bytes; images keep them as base64 with a MIME type so the media viewers can preview them.
const v2 = (bytes: Uint8Array) =>
  ({
    protocol: Promise.resolve("v2"),
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

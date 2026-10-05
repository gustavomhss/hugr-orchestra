import { describe, expect, test } from "bun:test"
import { collectPatches, joinPatches } from "./review-export"

describe("collectPatches", () => {
  test("loads only summarized patches, at most the limit at once, and keeps the listed order", async () => {
    let running = 0
    let peak = 0
    const diffs = Array.from({ length: 20 }, (_, index) => ({
      file: `src/${index}.ts`,
      patch: index % 2 ? `@@ listed ${index}\n` : undefined,
    }))
    const result = await collectPatches({
      diffs,
      needsLoad: (diff) => !diff.patch,
      load: async (diff) => {
        running++
        peak = Math.max(peak, running)
        await Bun.sleep(1)
        running--
        return `@@ loaded ${diff.file}\n`
      },
      limit: 8,
    })
    expect(peak).toBe(8)
    expect(result.patches).toHaveLength(20)
    expect(result.patches[0]).toBe("@@ loaded src/0.ts\n")
    expect(result.patches[1]).toBe("@@ listed 1\n")
    expect(result.skipped).toEqual([])
  })

  test("keeps binary and rename-only headers and reports files with no patch text", async () => {
    const result = await collectPatches({
      diffs: [
        { file: "logo.png", patch: "diff --git a/logo.png b/logo.png\nBinary files differ\n" },
        { file: "new.ts", patch: "diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts\n" },
        { file: "gone.ts", patch: "" },
        { file: "failed.ts" },
      ],
      needsLoad: (diff) => diff.file === "failed.ts",
      load: async () => {
        throw new Error("load failed")
      },
    })
    expect(result.patches).toEqual([
      "diff --git a/logo.png b/logo.png\nBinary files differ\n",
      "diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts\n",
    ])
    expect(result.skipped).toEqual(["gone.ts", "failed.ts"])
  })
})

describe("joinPatches", () => {
  test("ends every patch on its own line without adding blank lines", () => {
    expect(joinPatches(["@@ a\n+1\n", "@@ b\n+2"])).toBe("@@ a\n+1\n@@ b\n+2\n")
  })
})

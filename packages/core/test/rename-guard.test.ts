// Repo-wide guard for the opencode -> Orchestra rename. Every tracked text file, and every tracked path, must be free of
// "opencode" in any case, except kept paths and protected strings from script/rename-ledger.ts, which the rename
// codemod (script/rename-codemod.ts) reads too. It replaces the per-area checks that model-visible prompts and tool
// descriptions never name the upstream product: those texts live in tracked files, so this guard covers them.
import { describe, expect, test } from "bun:test"
import path from "node:path"
import { kept, keptPaths, oldNames, protectedStrings } from "../../../script/rename-ledger"

const root = path.resolve(import.meta.dir, "../../..")
const listing = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root })
if (listing.exitCode !== 0) throw new Error(`rename guard: git ls-files failed: ${listing.stderr.toString().trim()}`)
const tracked = listing.stdout.toString().split("\0").filter(Boolean)
if (!tracked.length) throw new Error("rename guard: git ls-files returned no tracked files")
const decoder = new TextDecoder()

async function scanned() {
  const files: { file: string; text: string }[] = []
  for (const file of tracked) {
    if (kept(file)) continue
    const bytes = await Bun.file(path.join(root, file)).bytes()
    // Binary contents are skipped, but their paths are checked below.
    if (bytes.subarray(0, 8000).includes(0)) continue
    files.push({ file, text: decoder.decode(bytes) })
  }
  return files
}

describe("rename guard", () => {
  test("no tracked file or path names opencode outside the rename ledger", async () => {
    const files = await scanned()
    // A broken listing would scan nothing and pass.
    expect(tracked.length).toBeGreaterThan(5000)
    expect(files.length).toBeGreaterThan(5000)
    expect(tracked.filter((file) => !kept(file)).flatMap((file) => oldNames(file, ""))).toEqual([])
    expect(files.flatMap((entry) => oldNames(entry.file, entry.text))).toEqual([])
  })

  test("every ledger entry still matches something, so the ledger cannot outlive its reasons", async () => {
    const files = await scanned()
    expect(
      keptPaths
        .filter((entry) => !entry.requires || tracked.some((file) => file.startsWith(`${entry.requires}/`)))
        .filter((entry) => !tracked.some((file) => entry.path.test(file)))
        .map((entry) => entry.reason),
    ).toEqual([])
    expect(
      protectedStrings
        .filter(
          (entry) =>
            !files.some(
              (file) =>
                (!entry.paths || entry.paths.test(file.file)) && [...file.text.matchAll(entry.pattern)].length > 0,
            ),
        )
        .map((entry) => `${entry.pattern.source} (${entry.reason})`),
    ).toEqual([])
  })

  test("flags an unprotected old name in text and in a path, and lets protected strings through", () => {
    expect(oldNames("packages/x/src/a.ts", 'const name = "OpenCode"\nconst seal = "opencode:event-seal:v1"')).toEqual([
      'packages/x/src/a.ts:1: const name = "OpenCode"',
    ])
    expect(oldNames("packages/opencode/src/a.ts", "")).toEqual(["packages/opencode/src/a.ts: path"])
    expect(oldNames("packages/x/src/a.ts", 'fetch("https://models.opencode.ai/api.json")')).toEqual([])
    expect(oldNames("packages/codemode/test/openapi.test.ts", 'Bun.file("./fixtures/opencode-v2-openapi.json")')).toEqual([])
    expect(oldNames("packages/x/src/a.ts", 'Bun.file("./fixtures/opencode-v2-openapi.json")')).toEqual([
      'packages/x/src/a.ts:1: Bun.file("./fixtures/opencode-v2-openapi.json")',
    ])
  })
})

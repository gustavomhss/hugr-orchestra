// Preload that stands in for a compiled build: it provides the generated skill file map (script/build.ts) with the
// authored files in place of Bun's embedded copies. Load it after test/preload.ts, which isolates the cache dir.
import { plugin } from "bun"
import fs from "node:fs/promises"
import path from "node:path"

const source = path.resolve(import.meta.dir, "../../../../charlie/skills")
const files = (await fs.readdir(source, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))

plugin({
  name: "charlie-embedded-skills",
  setup(build) {
    build.module("opencode-charlie-skills.gen.ts", () => ({
      loader: "object",
      exports: {
        default: Object.fromEntries(files.map((file) => [path.relative(source, file).split(path.sep).join("/"), file])),
      },
    }))
  },
})

const { CharlieSkillRoot } = await import("../../../src/maestro/charlie-skill-root")
const extracted = (await fs.readdir(CharlieSkillRoot.root, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(CharlieSkillRoot.root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  .toSorted()
console.log(JSON.stringify({ charlieEmbedded: { root: CharlieSkillRoot.root, source: CharlieSkillRoot.source, extracted } }))

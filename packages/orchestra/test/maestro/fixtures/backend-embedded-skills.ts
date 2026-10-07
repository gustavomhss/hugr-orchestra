// Preload that stands in for a compiled build: it provides the generated skill module (script/backend-skills.ts),
// path -> text of the authored files. Load it after test/preload.ts, which isolates the cache dir.
import { plugin } from "bun"
import fs from "node:fs/promises"
import path from "node:path"

const source = path.resolve(import.meta.dir, "../../../../backend-specialist/skills")
const files = (await fs.readdir(source, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))

const contents = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [path.relative(source, file).split(path.sep).join("/"), await fs.readFile(file, "utf8")]),
  ),
)

plugin({
  name: "backend-embedded-skills",
  setup(build) {
    build.module("orchestra-backend-skills.gen.ts", () => ({
      loader: "object",
      exports: {
        default: contents,
      },
    }))
  },
})

const { BackendSkillRoot } = await import("../../../src/maestro/backend-skill-root")
const extracted = (await fs.readdir(BackendSkillRoot.root, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(BackendSkillRoot.root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  .toSorted()
console.log(JSON.stringify({ backendEmbedded: { root: BackendSkillRoot.root, source: BackendSkillRoot.source, extracted } }))

// Preload that stands in for a compiled build. Use the real generator; load after test/preload.ts isolates the cache.
import { plugin } from "bun"
import fs from "node:fs/promises"
import path from "node:path"

const source = path.resolve(import.meta.dir, "../../../../backend-specialist/skills")
const { seatSkillsModule } = await import("../../../script/seat-skills")
const contents = await seatSkillsModule()

plugin({
  name: "seat-embedded-skills",
  setup(build) {
    build.module("opencode-seat-skills.gen.ts", () => ({ loader: "js", contents }))
  },
})

const { SeatSkillRoot } = await import("../../../src/maestro/seat-skill-root")
const root = SeatSkillRoot.roots.backend
const extracted = (await fs.readdir(root, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  .toSorted()
console.log(JSON.stringify({ backendEmbedded: { root, source, extracted } }))

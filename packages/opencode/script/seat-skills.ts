import path from "path"
import fs from "node:fs/promises"
import matter from "gray-matter"
import { Seats } from "../src/maestro/seats"

// Every seat's packaged skills (F6.12) as one generated module: seat id -> tree-relative path -> file text. Both the
// Bun binary (script/build.ts) and the desktop Node sidecar (script/build-node.ts) embed it; src/maestro/seat-skill-root.ts
// extracts each tree to a real directory at runtime.
export async function seatSkillsModule() {
  const trees = await Promise.all(
    Object.values(Seats.all)
      .filter((seat) => seat.skills.length > 0)
      .map(async (seat) => {
        const root = Seats.skillSource(seat.id)
         const tree = await fs.readdir(root, { recursive: true, withFileTypes: true })
         if (tree.some((entry) => !entry.isDirectory() && !entry.isFile())) throw new Error(`Non-file in seat skill tree: ${seat.id}`)
         const files = tree.filter((entry) => entry.isFile())
           .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).toSorted()
         if (files.length === 0) throw new Error(`Empty seat skill tree: ${seat.id}`)
         const authored = files.filter((file) => file.endsWith("/SKILL.md")).map((file) => file.slice(0, -"/SKILL.md".length)).toSorted()
         if (JSON.stringify(authored) !== JSON.stringify(seat.skills.toSorted())) throw new Error(`Seat entry skills differ from directories: ${seat.id}`)
         await Promise.all(seat.skills.map(async (name) => {
           if (matter(await Bun.file(path.join(root, name, "SKILL.md")).text()).data.name !== name)
             throw new Error(`Seat skill name mismatch: ${seat.id}/${name}`)
         }))
        const entries = await Promise.all(
          files.map(async (file) => `    ${JSON.stringify(file)}: ${JSON.stringify(await Bun.file(path.join(root, file)).text())},`),
        )
        return [`  ${JSON.stringify(seat.id)}: {`, ...entries, "  },"]
      }),
  )
  return ["export default {", ...trees.flat(), "}"].join("\n")
}

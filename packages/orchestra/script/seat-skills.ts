import { Seats } from "../src/maestro/seats"
import { SeatSkillContent } from "../src/maestro/seat-skill-content"

// Every seat's packaged skills (F6.12) as one generated module: seat id -> tree-relative path -> file text. Both the
// Bun binary (script/build.ts) and the desktop Node sidecar (script/build-node.ts) embed it; src/maestro/seat-skill-root.ts
// extracts each tree to a real directory at runtime.
export async function seatSkillsModule() {
  const trees = await Promise.all(
    Object.values(Seats.all)
      .filter((seat) => seat.skills.length > 0)
      .map(async (seat) => {
        const root = Seats.skillSource(seat.id)
        const files = await SeatSkillContent.read(seat.id, root, seat.skills)
        const entries = Object.keys(files).toSorted().map((file) => `    [${JSON.stringify(file)}]: ${JSON.stringify(files[file])},`)
        return [`  ${JSON.stringify(seat.id)}: {`, ...entries, "  },"]
      }),
  )
  return ["export default {", ...trees.flat(), "}"].join("\n")
}

/** The exact virtual files map shared by both production build lanes and their proofs. */
export async function seatSkillsFiles() {
  return { "orchestra-seat-skills.gen.ts": await seatSkillsModule() }
}

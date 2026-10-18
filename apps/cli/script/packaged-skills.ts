import { Seats } from "../../../modules/maestro/coordination/src/seats"
import { SeatSkillContent } from "../../../modules/maestro/coordination/src/seat-skill-content"
import { PackagedSkills } from "@orchestra/core/packaged-skills"

/** Build-time only: the canonical roster and reader own every entry and reference byte. */
export async function packagedSkills() {
  const trees = Object.fromEntries(
    await Promise.all(
      Object.values(Seats.all)
        .filter((seat) => seat.skills.length > 0)
        .map(async (seat) => [
          seat.id,
          await SeatSkillContent.read(seat.id, Seats.skillSource(seat.id), seat.skills),
        ] as const),
    ),
  )
  // Use the runtime admission rules too; an empty build or unextractable path is a build failure.
  PackagedSkills.digest(trees)
  return trees
}

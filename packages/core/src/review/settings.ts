export * as ReviewSettings from "./settings"

import type { Board } from "@orchestra/schema/board"

// A project's review settings (design §5.3, plan §9 R2): the tier the owner pinned and the review lanes or checks the
// owner accepts as unavailable. Ids stay open strings; the tier catalog and the lanes validate them where they are used.

export type Input = {
  readonly review?: {
    readonly tier?: string | null
    readonly acceptedUnavailable?: readonly string[] | null
  } | null
}

export type Settings = {
  readonly tier?: string
  readonly acceptedUnavailable: readonly string[]
}

/** The review settings a board project stores in `review_tier` and `review_accepted_unavailable`. */
export function fromProject(project: Pick<Board.Project, "reviewTier" | "reviewAcceptedUnavailable">): Input {
  return { review: { tier: project.reviewTier, acceptedUnavailable: project.reviewAcceptedUnavailable } }
}

/** Reads the review settings from a project's settings; blank ids are dropped and repeats kept once. */
export function read(project: Input): Settings {
  const tier = project.review?.tier?.trim()
  const acceptedUnavailable = Array.from(
    new Set((project.review?.acceptedUnavailable ?? []).map((id) => id.trim()).filter((id) => id.length > 0)),
  )
  if (tier) return { tier, acceptedUnavailable }
  return { acceptedUnavailable }
}

/** Whether the owner accepted `check` as unavailable, so §6.6 may APPROVE with it reported `check-unavailable`. */
export function accepted(settings: Settings, check: string) {
  return settings.acceptedUnavailable.includes(check.trim())
}

export * as Seats from "."

import backend from "./backend"
import archie from "./archie"
import patty from "./patty"
import lucy from "./lucy"
import billy from "./billy"
import jimmy from "./jimmy"
import rosie from "./rosie"
import frankie from "./frankie"
import live from "./live"
import type { Seat } from "./seat"
// seat-imports:end

export type { Seat } from "./seat"
export { skillSource, sharedSource } from "./seat"

// One import and one entry per seat, keyed by its id, in roster order; `script/seat.ts add` writes both.
export const all: Readonly<Record<string, Seat>> = Object.freeze({
  [backend.id]: backend,
  [archie.id]: archie,
  [patty.id]: patty,
  [lucy.id]: lucy,
  [billy.id]: billy,
  [jimmy.id]: jimmy,
  [rosie.id]: rosie,
  [frankie.id]: frankie,
  [live.id]: live,
  // seat-entries:end
})

for (const role of ["research", "planner", "approves"] as const) {
  if (Object.values(all).filter((seat) => seat[role]).length > 1) throw new Error(`At most one native seat may set ${role}`)
}

/** Whether Maestro's team list counts the seat as ready to take work. */
export function staffed(seat: Seat) {
  return seat.staffed !== false
}

/** The seat investigation goes to, when one is staffed. */
export function research() {
  return Object.values(all).find((seat) => seat.research && staffed(seat))
}

/** The seat plans and decompositions go to, when one is staffed. */
export function planner() {
  return Object.values(all).find((seat) => seat.planner && staffed(seat))
}

/** The seat whose review verdict gates shipping, when one is staffed. */
export function approver() {
  return Object.values(all).find((seat) => seat.approves && staffed(seat))
}

/** The seat definition for an exact agent or member id; legacy ids are canonicalized by the caller. */
export function find(id: string | undefined): Seat | undefined {
  return Object.values(all).find((seat) => seat.id === id)
}

/** The shared roots (`team-*`) some seat declares; they live once in the `team` tree (`sharedSource`). */
export function shared() {
  return [...new Set(Object.values(all).flatMap((seat) => seat.skills.filter((skill) => skill.startsWith("team-"))))]
}

export * as Seats from "."

import backend from "./backend"
import patty from "./patty"
import lucy from "./lucy"
import bobby from "./bobby"
import billy from "./billy"
import jimmy from "./jimmy"
import rosie from "./rosie"
import frankie from "./frankie"
import type { Seat } from "./seat"
// seat-imports:end

export type { Seat } from "./seat"
export { skillSource } from "./seat"

// One import and one entry per seat, keyed by its id, in roster order; `script/seat.ts add` writes both.
export const all: Readonly<Record<string, Seat>> = Object.freeze({
  [backend.id]: backend,
  [patty.id]: patty,
  [lucy.id]: lucy,
  [bobby.id]: bobby,
  [billy.id]: billy,
  [jimmy.id]: jimmy,
  [rosie.id]: rosie,
  [frankie.id]: frankie,
  // seat-entries:end
})

/** The seat definition for an exact agent or member id; legacy ids are canonicalized by the caller. */
export function find(id: string | undefined): Seat | undefined {
  return Object.values(all).find((seat) => seat.id === id)
}

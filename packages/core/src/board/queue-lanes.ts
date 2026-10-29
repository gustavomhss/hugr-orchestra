// Section 7.2 of docs/specs/maestro-lead/merge-queue.md: which queued cards may be cut, and into which lanes. Lanes
// are not stored; they are recomputed at every cut from each card's affected set. Pure: no database, git or turbo.

/** A card's affected set: package names, or null for a card with a global path, which overlaps everything. */
export type Affected = ReadonlyArray<string> | null

export type Card<Id> = {
  readonly id: Id
  readonly affected: Affected
  /** False for a card on hold, `held`, conflicting or waiting on an unshipped dependency: it neither goes nor blocks. */
  readonly bundleable: boolean
  readonly urgent: boolean
  readonly order: number | null
  readonly queuedAt: number
}

export type Lane<Id> = { readonly ids: ReadonlyArray<Id>; readonly packages: Affected }

/**
 * The lanes to cut now, earliest first. Rule 1: a card goes only when it overlaps no bundle in flight. Rule 2: it never
 * goes ahead of an earlier bundleable card that overlaps it and waits. A global card goes only alone or with other
 * global cards, so once the bundles in flight land it runs the whole suite; every card behind it waits. The cards that
 * go are grouped into connected components of overlapping sets, and at most `room` lanes are returned.
 */
export function lanes<Id>(cards: ReadonlyArray<Card<Id>>, flight: ReadonlyArray<Affected>, room = Infinity) {
  const sorted = cards.filter((card) => card.bundleable).toSorted(earlier)
  const going = sorted.reduce(
    (acc, card) => {
      const free =
        !flight.some((other) => overlaps(other, card.affected)) &&
        !acc.waiting.some((other) => overlaps(other, card.affected)) &&
        (card.affected === null
          ? acc.going.every((other) => other.affected === null)
          : !acc.going.some((other) => other.affected === null))
      if (free) return { going: [...acc.going, card], waiting: acc.waiting }
      return { going: acc.going, waiting: [...acc.waiting, card.affected] }
    },
    { going: [] as Array<Card<Id>>, waiting: [] as Affected[] },
  ).going
  // Cards with no affected package share one lane instead of one each.
  const linked = (a: Affected, b: Affected) => overlaps(a, b) || (a?.length === 0 && b?.length === 0)
  const first = (group: ReadonlyArray<Card<Id>>) => Math.min(...group.map((card) => sorted.indexOf(card)))
  return going
    .reduce(
      (groups, card) => {
        const joined = groups.filter((group) => group.some((member) => linked(member.affected, card.affected)))
        return [...groups.filter((group) => !joined.includes(group)), [...joined.flat(), card]]
      },
      [] as Array<Array<Card<Id>>>,
    )
    .toSorted((a, b) => first(a) - first(b))
    .slice(0, Math.max(0, room))
    .map(
      (group): Lane<Id> => ({
        ids: group.toSorted((a, b) => sorted.indexOf(a) - sorted.indexOf(b)).map((card) => card.id),
        packages: group.some((card) => card.affected === null)
          ? null
          : [...new Set(group.flatMap((card) => card.affected ?? []))].toSorted(),
      }),
    )
}

/** Earlier means urgent first, then `order` when both cards have one, then time queued (spec section 4.4). */
export function earlier<Id>(a: Card<Id>, b: Card<Id>) {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order
  return a.queuedAt - b.queuedAt
}

export function overlaps(a: Affected, b: Affected) {
  if (a === null || b === null) return true
  return a.some((name) => b.includes(name))
}

/** Whether a diff touches a global path: a changed file that matches one of the contract's `lanes.global` globs. */
export function global(files: ReadonlyArray<string>, globs: ReadonlyArray<string>) {
  const patterns = globs.map((glob) => new Bun.Glob(glob))
  return files.some((file) => patterns.some((pattern) => pattern.match(file)))
}

/** Section 7.5: at most floor(budget.jobs / J) lanes in flight, J the jobs one lane gate uses; uncapped when either is unknown. */
export function capacity(budget: number | null, jobs: number | null) {
  if (budget === null || jobs === null) return Infinity
  return Math.max(1, Math.floor(budget / jobs))
}

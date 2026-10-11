export * as ScheduledTaskCapabilityModel from "./capability-model"

import type { CapabilityScheduleContract } from "../capability/schedule/contract"

// Pure timing for capability schedules. Legacy-browser tasks keep model.ts unchanged.
export type Timing = Readonly<{
  cadence: CapabilityScheduleContract.Cadence
  /** IANA zone; daily/weekly/cron wall-clock fields are read in it. */
  timezone: string
  /** Epoch ms of the slot currently owed (the persisted `next`). */
  next: number
  enabled: boolean
  catchUp: "latest" | "skip"
}>

/** `skipped` counts slots that will never run because of this plan. */
export type Plan =
  | { readonly type: "wait" }
  | { readonly type: "run"; readonly slot: number; readonly skipped: number }
  | { readonly type: "skip"; readonly skipped: number }

export type Cron = Readonly<{ minutes: ReadonlySet<number>; hours: ReadonlySet<number>; days: ReadonlySet<number>;
  months: ReadonlySet<number>; weekdays: ReadonlySet<number>; dayRestricted: boolean; weekdayRestricted: boolean }>

/** Frozen signatures; the model author replaces the bodies. */
export function parseCron(_expression: string): Cron | undefined {
  throw new Error("ScheduledTaskCapabilityModel.parseCron is not implemented")
}

/** First slot strictly after `after`; DST gaps resolve to the next valid local instant; undefined for a past once. */
export function nextAfter(_timing: Timing, _after: number): number | undefined {
  throw new Error("ScheduledTaskCapabilityModel.nextAfter is not implemented")
}

/** What a capability schedule owes at `now`. A once slot more than 24h late is skipped. */
export function plan(_timing: Timing, _now: number): Plan {
  throw new Error("ScheduledTaskCapabilityModel.plan is not implemented")
}

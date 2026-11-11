export * as ActivityCPU from "./activity-cpu"

import os from "node:os"

type Sample = {
  cpus: readonly Pick<os.CpuInfo, "model" | "times">[]
  monotonic: number
  sampledAt: number
}
const modes = ["user", "nice", "sys", "idle", "irq"] as const
const MIN_WINDOW_MS = 250

/** The fraction of reported logical-CPU time spent outside idle; never per-session usage or pressure. */
export function reading(previous: Sample | undefined, current: Sample) {
  if (!previous || !current.cpus.length || previous.cpus.length !== current.cpus.length) return
  const windowMs = current.monotonic - previous.monotonic
  if (!Number.isFinite(windowMs) || windowMs < MIN_WINDOW_MS) return
  const deltas = current.cpus.flatMap((cpu, index) => {
    const before = previous.cpus[index]
    if (!before || cpu.model !== before.model) return []
    const values = modes.map((mode) => cpu.times[mode] - before.times[mode])
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return []
    if (
      modes.some(
        (mode) =>
          !Number.isFinite(cpu.times[mode]) ||
          !Number.isFinite(before.times[mode]) ||
          cpu.times[mode] < 0 ||
          before.times[mode] < 0,
      )
    )
      return []
    return [{ total: values.reduce((sum, value) => sum + value, 0), idle: cpu.times.idle - before.times.idle }]
  })
  if (deltas.length !== current.cpus.length) return
  const total = deltas.reduce((sum, cpu) => sum + cpu.total, 0)
  if (!Number.isFinite(total) || total <= 0) return
  const idle = deltas.reduce((sum, cpu) => sum + cpu.idle, 0)
  if (!Number.isFinite(idle) || idle > total) return
  return {
    source: "node.os.cpus" as const,
    percent: 100 * ((total - idle) / total),
    windowMs: Math.round(windowMs),
    sampledAt: current.sampledAt,
  }
}

/** Server-owned sampling cadence floor; concurrent readers cannot shrink a measurement window. */
export function make(
  read: () => Sample = () => ({ cpus: os.cpus(), monotonic: performance.now(), sampledAt: Date.now() }),
) {
  const state = { previous: undefined as Sample | undefined, last: undefined as ReturnType<typeof reading> }
  return () => {
    const current = read()
    if (state.previous && current.monotonic - state.previous.monotonic < MIN_WINDOW_MS) return state.last
    state.last = reading(state.previous, current) ?? state.last
    state.previous = current
    return state.last
  }
}

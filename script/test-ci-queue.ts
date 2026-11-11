export const RUNNER_QUEUE_WAIT_MS = 30 * 60_000

export function shouldWaitForRunners(queue: unknown, now = Date.now()) {
  if (!queue || typeof queue !== "object" || !("total_count" in queue) || !("workflow_runs" in queue)) return true
  const count = queue.total_count
  const runs = queue.workflow_runs
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return true
  if (!Array.isArray(runs) || runs.length !== count || !Number.isFinite(now)) return true
  return runs.some((run) => {
    if (!run || typeof run !== "object") return true
    const stamps = [run.created_at, run.updated_at].filter((stamp) => stamp !== undefined)
    if (stamps.length === 0) return true
    const times = stamps.map((stamp) => (typeof stamp === "string" ? Date.parse(stamp) : NaN))
    return times.some((time) => !Number.isFinite(time)) || now - Math.max(...times) < RUNNER_QUEUE_WAIT_MS
  })
}

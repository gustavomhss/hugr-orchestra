// Existing dispatch behavior, extracted so stale-queue regressions can be reproduced remotely.
export function shouldWaitForRunners(queue: unknown, _now = Date.now()) {
  return (queue as { total_count: number }).total_count > 0
}

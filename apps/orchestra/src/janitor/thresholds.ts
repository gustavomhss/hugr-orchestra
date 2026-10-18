export const Thresholds = {
  diskWarn: 0.8,
  diskUrgent: 0.9,
  diskFullDays: 7,
  cpuPercent: 80,
  cpuMinutes: 5,
  idleMinutes: 60,
  worktreeStaleDays: 14,
  worktreeUrgentDays: 30,
  branchMergedDays: 7,
  stashDays: 30,
  untrackedBytes: 500 * 1024 * 1024,
  cacheBytes: 1024 * 1024 * 1024,
  logBytes: 500 * 1024 * 1024,
  swapBytes: 2 * 1024 * 1024 * 1024,
  dockerUnusedDays: 30,
} as const

export type Severity = "ok" | "attention" | "urgent"

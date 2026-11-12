type MinePhase =
  | "scan"
  | "rank-history"
  | "history-count"
  | "history-shallow"
  | "history-concentration"
  | "history-frontier"
  | "history-signals"
  | "model-site"
  | "model-batch"

/** Opt-in operational evidence only. Fixed labels/numbers keep source, model output and credentials out. */
export function createMineProgress(
  env: NodeJS.ProcessEnv,
  emit: (line: string) => void = (line) => void process.stderr.write(`${line}\n`),
  now: () => number = () => performance.now(),
) {
  const enabled = env.ATLAS_MINE_PROGRESS === "1"
  return {
    pool: (parallel: boolean) => {
      if (enabled) emit(`atlas-progress ${JSON.stringify({ pool: parallel ? "parallel" : "sequential" })}`)
    },
    run: <T>(phase: MinePhase, work: () => T, sites?: number): T => {
      if (!enabled) return work()
      const start = now()
      emit(`atlas-progress ${JSON.stringify({ phase, event: "start", sites })}`)
      let completed = false
      try {
        const result = work()
        completed = true
        return result
      } finally {
        emit(
          `atlas-progress ${JSON.stringify({ phase, event: completed ? "end" : "failed", sites, elapsedMs: now() - start })}`,
        )
      }
    },
  }
}

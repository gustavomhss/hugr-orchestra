export type Plan = {
  repo: string
  sourceHead?: string
  harnessSha256?: string
  inputs?: readonly { id: string; path: string; sha256: string; bytes: number }[]
  demand?: string
  out: string
  scratch: string
  project: string
  packet: string
  model: string
  port: number
  seed: string
  seedTree: string
  before: Record<string, string>
  env: Record<string, string>
  removedEnvNames: string[]
  deadlineMs: number
  prompt: string
}

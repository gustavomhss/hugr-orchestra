import { expect, test } from "bun:test"
import { YAML } from "bun"
import path from "node:path"
import { fileURLToPath } from "node:url"

// The omni producer admission refuses a supervisor without the Unix execute bit (packages/script/src/omni.ts),
// and that admission is right for a file the producer built. A file that came back through
// actions/download-artifact lost the mode on the way, so the consumer restores it: the artifact bytes are the
// producer's, the execute bit is what the download cannot carry. Every workflow that builds a CLI from a
// downloaded omni artifact has to restore it, the way .github/actions/omni-binaries does, and it has to restore
// it BEFORE the build: a restore that runs after the build leaves the build refusing the supervisor again.

const root = fileURLToPath(new URL("../../../", import.meta.url))
const workflows = path.join(root, ".github/workflows")

type Step = { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, unknown> }
type Job = { steps?: Step[]; env?: Record<string, unknown> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readStep(value: unknown): Step | undefined {
  if (!isRecord(value)) return undefined
  return {
    uses: typeof value.uses === "string" ? value.uses : undefined,
    run: typeof value.run === "string" ? value.run : undefined,
    with: isRecord(value.with) ? value.with : undefined,
    env: isRecord(value.env) ? value.env : undefined,
  }
}

function readJob(value: unknown): Job {
  if (!isRecord(value)) return {}
  const steps = Array.isArray(value.steps) ? value.steps.map(readStep).filter((step): step is Step => step !== undefined) : undefined
  return { steps, env: isRecord(value.env) ? value.env : undefined }
}

function readWorkflow(text: string): Record<string, Job> {
  const parsed: unknown = YAML.parse(text)
  if (!isRecord(parsed)) return {}
  const jobs = parsed.jobs
  if (!isRecord(jobs)) return {}
  return Object.fromEntries(Object.entries(jobs).map(([name, job]) => [name, readJob(job)]))
}

function targets(run: string) {
  return [...run.matchAll(/--target[= ]+(\S+)/g)].map((match) => match[1]!)
}

// The omni artifact path: the directory the producer's artifacts land in. The guard reads the path the
// download writes to, not the artifact's name, so renaming an artifact cannot blind it.
function isOmniArtifactPath(path: string) {
  return path.split("/").some((segment) => segment === "omni" || segment === "omni-artifacts")
}

// The directories the job reads the supervisor from, as OMNI_ARTIFACTS declares them.
function omniRoots(job: Job, steps: Step[]) {
  const roots = new Set<string>()
  const add = (env: Record<string, unknown> | undefined) => {
    const value = env?.OMNI_ARTIFACTS
    if (typeof value === "string" && value !== "") roots.add(value)
  }
  add(job.env)
  for (const step of steps) add(step.env)
  return [...roots]
}

function isOmniDownload(step: Step, roots: string[]) {
  if (!step.uses?.startsWith("actions/download-artifact")) return false
  const path = typeof step.with?.path === "string" ? step.with.path : ""
  if (isOmniArtifactPath(path)) return true
  return roots.some((root) => path.startsWith(root))
}

// Where a step's script does the thing, as (step index, character offset in that step's script).
type Position = { step: number; offset: number }

function restoreOffset(step: Step) {
  const run = step.run
  if (!run?.includes("chmod +x") || !run.includes("hugr-omni-supervisor")) return undefined
  return run.indexOf("chmod +x")
}

function buildOffset(step: Step) {
  const run = step.run
  if (!run?.includes("build.ts") || !run.includes("--target")) return undefined
  return run.indexOf("build.ts")
}

function firstPosition(steps: Step[], offset: (step: Step) => number | undefined) {
  for (const [index, step] of steps.entries()) {
    const at = offset(step)
    if (at === undefined) continue
    return { step: index, offset: at }
  }
  return undefined
}

function precedes(restore: Position, build: Position) {
  if (restore.step !== build.step) return restore.step < build.step
  return restore.offset < build.offset
}

test("every workflow that builds a CLI from a downloaded omni artifact restores the supervisor's execute bit before the build", async () => {
  const offenders: string[] = []
  for (const file of [...new Bun.Glob("*.yml").scanSync({ cwd: workflows })].sort()) {
    const workflow = readWorkflow(await Bun.file(path.join(workflows, file)).text())
    for (const [name, job] of Object.entries(workflow)) {
      const steps = job.steps ?? []
      const roots = omniRoots(job, steps)
      if (!steps.some((step) => isOmniDownload(step, roots))) continue
      const builds = steps.filter((step) => buildOffset(step) !== undefined)
      if (builds.length === 0) continue
      // A Windows target's admission skips the mode (NTFS stores no Unix execute bit), so it needs no restore.
      const windowsOnly = builds.every((step) => {
        const built = targets(step.run!)
        return built.length > 0 && built.every((target) => target.startsWith("windows"))
      })
      if (windowsOnly) continue
      const restore = firstPosition(steps, restoreOffset)
      const build = firstPosition(steps, buildOffset)
      if (!restore || !build || !precedes(restore, build)) offenders.push(`${file}:${name}`)
    }
  }
  expect(offenders).toEqual([])
})

test("the restore the workflows use is the mode a download cannot carry", async () => {
  const action = await Bun.file(path.join(root, ".github/actions/omni-binaries/action.yml")).text()
  expect(action).toContain('chmod +x "$dir/$supervisor"')
  expect(action).toContain('[ -x "$dir/$supervisor" ]')
})

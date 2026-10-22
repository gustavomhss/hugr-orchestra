import { expect, test } from "bun:test"
import { YAML } from "bun"
import path from "node:path"
import { fileURLToPath } from "node:url"

// The omni producer admission refuses a supervisor without the Unix execute bit (packages/script/src/omni.ts),
// and that admission is right for a file the producer built. A file that came back through
// actions/download-artifact lost the mode on the way, so the consumer restores it: the artifact bytes are the
// producer's, the execute bit is what the download cannot carry. Every workflow that builds a CLI from a
// downloaded omni artifact has to restore it, the way .github/actions/omni-binaries does.

const root = fileURLToPath(new URL("../../../", import.meta.url))
const workflows = path.join(root, ".github/workflows")

type Step = { uses?: string; run?: string; with?: Record<string, unknown> }
type Job = { steps?: Step[] }

function targets(run: string) {
  return [...run.matchAll(/--target[= ]+(\S+)/g)].map((match) => match[1]!)
}

test("every workflow that builds a CLI from a downloaded omni artifact restores the supervisor's execute bit", async () => {
  const offenders: string[] = []
  for (const file of [...new Bun.Glob("*.yml").scanSync({ cwd: workflows })].sort()) {
    const workflow = YAML.parse(await Bun.file(path.join(workflows, file)).text()) as { jobs?: Record<string, Job> }
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const steps = job.steps ?? []
      const downloadsOmni = steps.some((step) => step.uses?.startsWith("actions/download-artifact") &&
        ["name", "pattern"].some((key) => typeof step.with?.[key] === "string" && String(step.with?.[key]).includes("omni")))
      if (!downloadsOmni) continue
      const builds = steps.filter((step) => step.run?.includes("build.ts") && step.run.includes("--target"))
      if (builds.length === 0) continue
      // A Windows target's admission skips the mode (NTFS stores no Unix execute bit), so it needs no restore.
      const windowsOnly = builds.every((step) => {
        const built = targets(step.run!)
        return built.length > 0 && built.every((target) => target.startsWith("windows"))
      })
      if (windowsOnly) continue
      const restores = steps.some((step) => step.run?.includes("chmod +x") && step.run.includes("hugr-omni-supervisor"))
      if (!restores) offenders.push(`${file}:${name}`)
    }
  }
  expect(offenders).toEqual([])
})

test("the restore the workflows use is the mode a download cannot carry", async () => {
  const action = await Bun.file(path.join(root, ".github/actions/omni-binaries/action.yml")).text()
  expect(action).toContain('chmod +x "$dir/$supervisor"')
  expect(action).toContain('[ -x "$dir/$supervisor" ]')
})

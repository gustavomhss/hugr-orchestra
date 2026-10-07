// V9 runs copied shipped binaries, never source CLI or a bare binding. A usable checkout fallback is planted in temp.
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v9-broken-artifacts.ts [--mutation] [--diagnose]
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cleanup, cli, isolated, win } from "./lib.ts"
import { authorized, deliveryEnv, evidence, execute, record } from "./delivery-fixtures.ts"

type Observation = Awaited<ReturnType<typeof execute>>
type Cell = Observation & { cell: string; bin: string; addon: string; supervisor: string; pass: boolean }

/** Missing/corrupt artifact must be named, normal nonzero exit, <=2s, and no successful tree/fallback. */
export function rejectsArtifact(result: Observation, artifact: string) {
  const text = result.stdout + result.stderr
  return !result.timedOut && !result.error && result.signal === null && result.code !== null && result.code !== 0 &&
    result.ms <= 2000 && text.includes(artifact) && /not found|does not exist|failed|error|dlopen/i.test(text) &&
    !text.includes("nonce tree: ok") && !text.includes("path: legacy")
}

export async function run(options: { mutation?: boolean; diagnose?: boolean } = {}) {
  authorized()
  const scratch = isolated("v9", {})
  const cells: Cell[] = []
  try {
    const source = realpathSync(cli())
    const names = { addon: "hugr_omni.node", supervisor: `hugr-omni-supervisor${win ? ".exe" : ""}` }
    const env: Record<string, string> = { ...deliveryEnv(scratch.env), OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: "1" }
    // Strip Bun mode and Node resolution escape hatches from the actual child environment.
    for (const key of Object.keys(env))
      if (/^(BUN_BE_BUN|BUN_OPTIONS|NODE_OPTIONS|NODE_PATH|OMNI_|HUGR_OMNI_)/i.test(key)) delete env[key]
    // Make the binding's real checkoutBuild() fallback usable, without touching a checkout or shipped artifact.
    const target = path.join(scratch.home, "checkout-bait", "target")
    mkdirSync(path.join(target, "debug"), { recursive: true })
    const bait = {
      addon: path.join(target, "debug", win ? "hugr_omni_node.dll" : process.platform === "darwin" ? "libhugr_omni_node.dylib" : "libhugr_omni_node.so"),
      supervisor: path.join(target, "debug", names.supervisor),
    }
    copyFileSync(path.join(path.dirname(source), names.addon), bait.addon)
    copyFileSync(path.join(path.dirname(source), names.supervisor), bait.supervisor)
    chmodSync(bait.supervisor, 0o755)
    env.CARGO_TARGET_DIR = target
    for (const cell of ["intact", "addon-missing", "addon-corrupt", "supervisor-missing"]) {
      const dir = path.join(scratch.home, cell, "bin")
      mkdirSync(dir, { recursive: true })
      const bin = path.join(dir, path.basename(source))
      const addon = path.join(dir, names.addon)
      const supervisor = path.join(dir, names.supervisor)
      copyFileSync(source, bin)
      copyFileSync(path.join(path.dirname(source), names.addon), addon)
      copyFileSync(path.join(path.dirname(source), names.supervisor), supervisor)
      chmodSync(bin, 0o755)
      chmodSync(supervisor, 0o755)
      if (cell === "addon-missing") unlinkSync(addon)
      if (cell === "addon-corrupt") writeFileSync(addon, "V9 deliberately corrupt native addon\n")
      if (cell === "supervisor-missing") unlinkSync(supervisor)
      const observed = await execute(bin, ["debug", "omni"], env, scratch.project, cell === "intact" ? 30_000 : 2100)
      const text = observed.stdout + observed.stderr
      const pass = cell === "intact"
        ? !observed.timedOut && !observed.error && observed.code === 0 && observed.signal === null &&
          text.includes("path: omni") && text.includes(`addon: ${addon}`) && text.includes(`supervisor: ${supervisor}`) &&
          text.includes("nonce tree: ok") && /counters: spawns=[1-9]\d* delegations=0/.test(text)
        : rejectsArtifact(observed, cell === "supervisor-missing" ? supervisor : addon)
      const diagnostic = options.diagnose && observed.timedOut
        ? await execute(bin, ["debug", "omni"], env, scratch.project, 25_000)
        : undefined
      cells.push({ cell, bin, addon, supervisor, ...observed, pass, ...(diagnostic ? { diagnostic } : {}) })
    }
    // Mutate resolution to substitute the checkout bait for the missing addon (real binary, real fallback success).
    // The negative gate must go red. Only this invocation gets those paths; the broken copy remains broken.
    const mutation = options.mutation ? await (async () => {
      const target = cells.find((cell) => cell.cell === "addon-missing")
      if (!target) throw new Error("V9 missing negative-control cell")
      const observed = await execute(target.bin, ["debug", "omni"], {
        ...env, HUGR_OMNI_ADDON: bait.addon, HUGR_OMNI_SUPERVISOR: bait.supervisor,
      }, scratch.project, 30_000)
      const rejected = rejectsArtifact(observed, target.addon)
      const success = observed.code === 0 && observed.stdout.includes("nonce tree: ok") && !observed.timedOut
      const restored = await execute(target.bin, ["debug", "omni"], env, scratch.project, 2100)
      return { kind: "fallback-path-substitution", ...observed, gatePass: rejected,
        detected: success && !rejected, restored, missingArtifactPreserved: !existsSync(target.addon) }
    })() : undefined
    const log = evidence("v9-cells", { source, home: scratch.home, checkoutFallbackBait: bait, cells, mutation })
    return record("v9-broken-artifacts", { pass: cells.length === 4 && cells.every((cell) => cell.pass) &&
      (!options.mutation || mutation?.detected === true && mutation.missingArtifactPreserved &&
        rejectsArtifact(mutation.restored, cells.find((cell) => cell.cell === "addon-missing")?.addon ?? "")),
      cells, mutation, evidence: log })
  } catch (error) {
    return record("v9-broken-artifacts", { pass: false, cells, error: String(error),
      evidence: evidence("v9-failure", { cells, error: String(error) }) })
  } finally {
    await cleanup(scratch.home, [])
  }
}

if (import.meta.main) {
  const result = await run({ mutation: process.argv.includes("--mutation"), diagnose: process.argv.includes("--diagnose") })
  process.exit(result.pass ? 0 : 1)
}

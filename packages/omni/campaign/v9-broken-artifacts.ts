// V9 runs copied shipped binaries, never source CLI or a bare binding. A usable checkout fallback is planted in temp.
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v9-broken-artifacts.ts --quiet [--mutation] [--diagnose]
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { OPENCODE, ROOT, cleanup, cli, isolated, load, win } from "./lib.ts"
import { authorized, deliveryEnv, evidence, execute, record } from "./delivery-fixtures.ts"

type Observation = Awaited<ReturnType<typeof execute>>
type Cell = Observation & { cell: string; bin: string; addon: string; supervisor: string; pass: boolean }

/** Missing/corrupt artifact must be named, normal nonzero exit, <=2s, and no successful tree/fallback. */
export function rejectsArtifact(result: Observation, artifact: string, kind: "addon" | "supervisor") {
  const configured = result.stderr.includes(`hugr-omni: the configured ${kind} ${artifact} does not exist`)
  const load = kind === "addon" && result.stderr.includes(`hugr-omni could not load its native addon ${artifact}:`)
  return !result.timedOut && !result.error && result.signal === null && result.code === 1 && result.ms <= 2000 &&
    result.stdout === "" && result.stderr.startsWith("hugr-omni CLI preflight failed: ") && (configured || load) &&
    result.stderr.includes("Reinstall this CLI with its addon and supervisor")
}

export async function run(options: { mutation?: boolean; diagnose?: boolean; quiet?: boolean } = {}) {
  authorized()
  const quiet = () => win || os.loadavg()[0] <= os.availableParallelism() * 0.5
  if (!options.quiet || !quiet()) return record("v9-broken-artifacts", {
    pass: false, status: "unrun", reason: `V9 acceptance requires --quiet and load1 <= 0.5 * CPUs; current load=${load()}`,
  })
  const scratch = isolated("v9", {})
  const cells: Cell[] = []
  const controls: { name: string; pass: boolean; result: Observation }[] = []
  try {
    const source = realpathSync(cli())
    const names = { addon: "hugr_omni.node", supervisor: `hugr-omni-supervisor${win ? ".exe" : ""}` }
    const env: Record<string, string> = { ...deliveryEnv(scratch.env), OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: "1" }
    // Strip Bun mode and Node resolution escape hatches from the actual child environment.
    for (const key of Object.keys(env))
      if (/^(BUN_BE_BUN|BUN_OPTIONS|NODE_OPTIONS|NODE_PATH|OMNI_|HUGR_OMNI_)/i.test(key)) delete env[key]
    // Make the binding's real checkoutBuild() fallback usable, without touching a checkout or shipped artifact.
    const resources = path.join(scratch.home, "checkout-bait")
    const target = path.join(resources, "target")
    mkdirSync(path.join(target, "debug"), { recursive: true })
    const bait = {
      addon: path.join(target, "debug", win ? "hugr_omni_node.dll" : process.platform === "darwin" ? "libhugr_omni_node.dylib" : "libhugr_omni_node.so"),
      supervisor: path.join(target, "debug", names.supervisor),
    }
    copyFileSync(path.join(path.dirname(source), names.addon), bait.addon)
    copyFileSync(path.join(path.dirname(source), names.supervisor), bait.supervisor)
    chmodSync(bait.supervisor, 0o755)
    env.CARGO_TARGET_DIR = target
    mkdirSync(path.join(resources, "omni"))
    copyFileSync(bait.addon, path.join(resources, "omni", names.addon))
    copyFileSync(bait.supervisor, path.join(resources, "omni", names.supervisor))
    chmodSync(path.join(resources, "omni", names.supervisor), 0o755)
    for (const cell of ["intact", "addon-missing", "addon-corrupt", "supervisor-missing"]) {
      if (!quiet()) throw new Error(`V9 machine became busy before ${cell}: ${load()}`)
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
      const beforeLoad = load()
      const observed = await execute(bin, ["debug", "omni"], env, scratch.project, cell === "intact" ? 30_000 : 2000, [scratch.home])
      const text = observed.stdout + observed.stderr
      const pass = cell === "intact"
        ? !observed.timedOut && !observed.error && observed.code === 0 && observed.signal === null &&
          text.includes("path: omni") && text.includes(`addon: ${addon}`) && text.includes(`supervisor: ${supervisor}`) &&
          text.includes("nonce tree: ok") && /counters: spawns=[1-9]\d* delegations=0/.test(text)
        : rejectsArtifact(observed, cell === "supervisor-missing" ? supervisor : addon, cell === "supervisor-missing" ? "supervisor" : "addon")
      const diagnostic = options.diagnose && observed.timedOut
        ? await execute(bin, ["debug", "omni"], env, scratch.project, 25_000, [scratch.home])
        : undefined
      cells.push({ cell, bin, addon, supervisor, ...observed, pass: pass && quiet(), ...{ beforeLoad, afterLoad: load() }, ...(diagnostic ? { diagnostic } : {}) })
    }
    const corrupt = cells.find((cell) => cell.cell === "addon-corrupt")
    const missing = cells.find((cell) => cell.cell === "addon-missing")
    if (!corrupt || !missing) throw new Error("V9 did not construct both guard controls")
    for (const mode of ["0", "unset"]) {
      const off = { ...env }
      if (mode === "unset") delete off.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
      if (mode === "0") off.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER = "0"
      const result = await execute(corrupt.bin, ["--version"], off, scratch.project, 5000, [scratch.home])
      controls.push({ name: `legacy-${mode}-stays-lazy`, result, pass: result.code === 0 && !result.timedOut &&
        /^\d+\.\d+\.\d+/.test(result.stdout) && !result.stderr.includes("hugr-omni CLI preflight") })
    }
    if (!quiet()) throw new Error(`V9 machine became busy before strict control: ${load()}`)
    const strict = await execute(missing.bin, ["debug", "omni"], { ...env, OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: "strict" }, scratch.project, 2000, [scratch.home])
    controls.push({ name: "strict-preflights", result: strict, pass: rejectsArtifact(strict, missing.addon, "addon") && quiet() })
    // Compile a fixture variant of the actual preflight with shipped configure() removed. Its loader really selects
    // an implicit resources candidate. No HUGR_OMNI_* override: this exercises the forbidden fallback seam.
    const mutation = options.mutation ? await (async () => {
      const target = cells.find((cell) => cell.cell === "addon-missing")
      if (!target) throw new Error("V9 missing negative-control cell")
      const entry = await Bun.file(path.join(OPENCODE, "src/cli/omni-entry.ts")).text()
      const start = entry.indexOf("    Omni.configure({")
      const end = entry.indexOf("    await Omni.load()", start)
      const app = entry.indexOf('await import("../index")')
      if (start < 0 || end <= start || app <= end) throw new Error("Mutation could not identify the actual preflight configure boundary")
      const fixture = path.join(scratch.home, "implicit-fallback-mutant.ts")
      const loader = JSON.stringify(path.join(ROOT, "packages/core/src/omni.ts"))
      await Bun.write(fixture, `Object.defineProperty(process, "resourcesPath", { value: ${JSON.stringify(resources)} });\n` +
        (entry.slice(0, start) + entry.slice(end, app)).replace('"@opencode-ai/core/omni"', loader) + `
const { Omni } = await import(${loader});
const binding = await Omni.load();
const result = await binding.run("git", ["-c", ${JSON.stringify(`orchestra.campaignnonce=${scratch.home}`)}, "rev-parse", "HEAD"], { cwd: ${JSON.stringify(ROOT)}, inheritEnv: false, env: Omni.childEnv(), timeoutMs: 5000 });
if (!result.success || !/^[0-9a-f]{40}\\n$/.test(result.stdout)) process.exit(1);
console.log("MUTATION_IMPLICIT_FALLBACK_OK " + JSON.stringify(Omni.locate()));
process.exit(0);
`)
      const mutant = path.join(path.dirname(target.bin), win ? "mutant.exe" : "mutant")
      const compiled = await Bun.build({ entrypoints: [fixture], target: "bun", define: { OMNI_ENABLED: "true" },
        compile: { outfile: mutant, autoloadBunfig: false, autoloadDotenv: false }, minify: true })
      if (!compiled.success) throw new Error(`Mutation compile failed: ${compiled.logs.join("\n")}`)
      const observed = await execute(mutant, [], env, scratch.project, 30_000, [scratch.home])
      const rejected = rejectsArtifact(observed, target.addon, "addon")
      const marker = "MUTATION_IMPLICIT_FALLBACK_OK "
      const line = observed.stdout.split("\n").find((line) => line.startsWith(marker))
      const selected = line ? JSON.parse(line.slice(marker.length)) as { addon: string; supervisor: string } : undefined
      const success = observed.code === 0 && !observed.timedOut &&
        selected?.addon === path.join(resources, "omni", names.addon) && selected.supervisor === path.join(resources, "omni", names.supervisor)
      const restored = await execute(target.bin, ["debug", "omni"], env, scratch.project, 2000, [scratch.home])
      return { kind: "compiled-preflight-configure-bypass", ...observed, selected, gatePass: rejected,
        detected: success && !rejected, restored, missingArtifactPreserved: !existsSync(target.addon) }
    })() : undefined
    const log = evidence("v9-cells", { source, home: scratch.home, checkoutFallbackBait: bait, cells, controls, mutation })
    return record("v9-broken-artifacts", { pass: cells.length === 4 && cells.every((cell) => cell.pass) && controls.length === 3 && controls.every((control) => control.pass) &&
      (!options.mutation || mutation?.detected === true && mutation.missingArtifactPreserved &&
        rejectsArtifact(mutation.restored, cells.find((cell) => cell.cell === "addon-missing")?.addon ?? "", "addon")),
      cells, controls, mutation, evidence: log })
  } catch (error) {
    return record("v9-broken-artifacts", { pass: false, cells, controls, error: String(error),
      evidence: evidence("v9-failure", { cells, controls, error: String(error) }) })
  } finally {
    await cleanup(scratch.home, [])
  }
}

if (import.meta.main) {
  const result = await run({ mutation: process.argv.includes("--mutation"), diagnose: process.argv.includes("--diagnose"), quiet: process.argv.includes("--quiet") })
  process.exit(result.pass ? 0 : 1)
}

// Hosted actual packaged desktop: Resources/cli/ripgrep-<target>/ holds the pinned rg for this OS and CPU (signed by
// staging on macOS), the packaging check refuses the app once it is moved away (mutant, then restored), and the
// packaged CLI searches with it and never downloads one: pointed at it the way main points the server
// (ORCHESTRA_RIPGREP_DIR), and as the copy main installs for its background CLI (ripgrep/ beside it).
// packages/cli/script/ripgrep-proof.ts does the CLI runs, each with its own mutant.
import { mkdtemp, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ROOT } from "../../../omni/campaign/lib"
import { verifyPackagedCli } from "../../scripts/cli-packaging"
import { nativeCliTarget, signatureCheck } from "../../src/main/cli-artifacts"
import { installCliArtifact } from "../../src/main/cli-install"
import { provenance } from "./build"

if (!process.env.CI) throw new Error("packaged desktop proof requires hosted CI")
const resources = provenance().resources
const target = nativeCliTarget(process.platform, process.arch)
const ripgrep = path.join(resources, "cli", `ripgrep-${target}`)
const supervisor = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`
const version = (await Bun.file(path.join(resources, "cli", "manifest.json")).json()).version as string
const signature = async (file: string) => {
  const check = signatureCheck(target, file)
  if (!check) return false
  const child = Bun.spawn([check.command, ...check.args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
  return code === 0 && check.valid(stdout)
}
const checks = { signature: (file: string) => signature(file) }

await verifyPackagedCli(path.join(resources, "cli"), process.platform, process.arch, version, checks)
console.log(
  `PACKAGED_RIPGREP ${JSON.stringify({ directory: ripgrep, manifest: await Bun.file(path.join(ripgrep, "manifest.json")).json() })}`,
)
await rename(ripgrep, `${ripgrep}.away`)
const refused = await verifyPackagedCli(path.join(resources, "cli"), process.platform, process.arch, version, checks)
  .then(
    () => undefined,
    (error: Error) => error.message,
  )
  .finally(() => rename(`${ripgrep}.away`, ripgrep))
if (!refused) throw new Error("MUTANT_SURVIVED: the packaging check accepted a CLI bundle without its rg")
console.log(`PACKAGED_RIPGREP_MUTANT_KILLED ${JSON.stringify({ refused })}`)

const omni = [
  `HUGR_OMNI_ADDON=${path.join(resources, "omni", "hugr_omni.node")}`,
  `HUGR_OMNI_SUPERVISOR=${path.join(resources, "omni", supervisor)}`,
]
const proof = async (binary: string, directory: string, env: string[]) => {
  const child = Bun.spawn(
    [
      process.execPath,
      path.join(ROOT, "packages/cli/script/ripgrep-proof.ts"),
      "--target",
      target,
      "--binary",
      binary,
      "--ripgrep",
      directory,
      "--mutate",
      ...env.flatMap((pair) => ["--env", pair]),
    ],
    { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
  )
  if ((await child.exited) !== 0) throw new Error(`ripgrep proof failed for ${binary}`)
}

await proof(path.join(resources, "cli", `orchestra-${target}${process.platform === "win32" ? ".exe" : ""}`), ripgrep, [
  `ORCHESTRA_RIPGREP_DIR=${ripgrep}`,
  ...omni,
])
const installed = await installCliArtifact(
  path.join(resources, "cli"),
  target,
  await mkdtemp(path.join(tmpdir(), "orchestra-installed-cli-")),
  checks,
)
await proof(installed.path, path.join(path.dirname(installed.path), "ripgrep"), omni)

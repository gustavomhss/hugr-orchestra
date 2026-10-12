// Hosted actual packaged desktop: Resources/ripgrep holds the pinned rg for this OS and CPU, the packaging check
// refuses the app once it is moved away (mutant, then restored), and the packaged CLI searches with it and never
// downloads one, run both from Resources/cli (../ripgrep) and as the copy the desktop installs for its background CLI
// (ripgrep/ beside it). packages/cli/script/ripgrep-proof.ts does the CLI runs, each with its own mutant.
import { mkdtemp, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ROOT } from "../../../omni/campaign/lib"
import { verifyPackagedRipgrep } from "../../scripts/cli-packaging"
import { nativeCliTarget } from "../../src/main/cli-artifacts"
import { installCliArtifact } from "../../src/main/cli-install"
import { provenance } from "./build"

if (!process.env.CI) throw new Error("packaged desktop proof requires hosted CI")
const resources = provenance().resources
const ripgrep = path.join(resources, "ripgrep")
const target = nativeCliTarget(process.platform, process.arch)
const supervisor = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`

// An unsigned --dir build: rg must be the pinned archive's bytes.
const manifest = await verifyPackagedRipgrep(ripgrep, process.platform, process.arch, false)
console.log(`PACKAGED_RIPGREP ${JSON.stringify({ resources, archive: manifest?.archive, executable: manifest?.executable })}`)
await rename(ripgrep, `${ripgrep}.away`)
const refused = await verifyPackagedRipgrep(ripgrep, process.platform, process.arch, false)
  .then(() => undefined, (error: Error) => error.message)
  .finally(() => rename(`${ripgrep}.away`, ripgrep))
if (!refused) throw new Error("MUTANT_SURVIVED: the packaging check accepted Resources without ripgrep")
console.log(`PACKAGED_RIPGREP_MUTANT_KILLED ${JSON.stringify({ refused })}`)

const proof = async (binary: string, directory: string, env: string[] = []) => {
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

await proof(path.join(resources, "cli", `orchestra-${target}${process.platform === "win32" ? ".exe" : ""}`), ripgrep)
const installed = await installCliArtifact(
  path.join(resources, "cli"),
  target,
  await mkdtemp(path.join(tmpdir(), "orchestra-installed-cli-")),
  ripgrep,
)
// The installed copy has no omni beside it; it gets the app's own pair, as the packaged app's environment would.
await proof(installed.path, path.join(path.dirname(installed.path), "ripgrep"), [
  `HUGR_OMNI_ADDON=${path.join(resources, "omni", "hugr_omni.node")}`,
  `HUGR_OMNI_SUPERVISOR=${path.join(resources, "omni", supervisor)}`,
])

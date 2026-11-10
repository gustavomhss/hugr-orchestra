import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { GitCli } from "@orchestra/core/git-cli"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"

export const projectID = Project.ID.make("prj_governed_checks")

export const runGit = (directory: string, args: string[]) =>
  Effect.gen(function* () {
    const cli = yield* GitCli.Service
    const result = yield* cli.run(["-c", "user.email=chain@example.com", "-c", "user.name=Chain", "-c", "commit.gpgsign=false", ...args], { cwd: directory })
    if (result.exitCode !== 0) return yield* Effect.die(new Error(result.stderr.toString()))
    return result.text().trim()
  }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>))

export async function ownDirectory() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-governed-checks-")))
  const git = (args: string[]) => Effect.runPromise(runGit(directory, args))
  await fs.mkdir(path.join(directory, "src"), { recursive: true })
  await fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1\n")
  await fs.writeFile(path.join(directory, "src/beta.ts"), "export const beta = 2\n")
  await git(["init", "-q", "-b", "main"])
  await git(["add", "src"])
  await git(["commit", "-q", "-m", "source fixture"])
  const revision = await git(["rev-parse", "HEAD"])
  const blobs = (await git(["hash-object", "--no-filters", "--", "src/alpha.ts", "src/beta.ts"])).split(/\r?\n/)
  const units = ["packages/alpha/shared", "packages/beta/shared"]
  const sources = ["src/alpha.ts", "src/beta.ts"]
  const snapshot = parseOwnSnapshot(JSON.stringify({
    schemaVersion: 1, snapshot: "genesis-fixture", sourceRevision: revision,
    units: units.map((unit, index) => ({
      unit: { level: "module", id: unit, grounding: null },
      sourceBlobs: { [sources[index]]: blobs[index] },
      pack: {
        unit: `${unit} owns bounded behavior.`,
        invariants: [{ nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" }],
        shape: { contents: [sources[index]], owner: "atlas", tier: "T1" },
        edges: { dependents: [], dependencies: [] }, gotchas: [], memory: null,
        drill: { finer: [], refresh: { pull: `poke:${unit}` }, complement: { pull: `relate:${unit}` } },
        grounding: { source: "tree" }, tokenEstimate: 20, manifest: { pointers: [], truncated: false },
        pullReachable: [], advisory: [], advisoryDropped: 0,
      },
    })),
  }))
  if (!snapshot) throw new Error("canonical fixture refused")
  await fs.writeFile(path.join(directory, "TERRITORY-CATALOG.json"), JSON.stringify(publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }])))
  await fs.writeFile(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  const output = materializeStaticOwnSnapshot(snapshot)
  await Promise.all([...output.skills, output.coverage].map(async (file) => {
    await fs.mkdir(path.dirname(path.join(directory, file.path)), { recursive: true })
    await fs.writeFile(path.join(directory, file.path), file.content)
  }))
  await git(["add", "-A"])
  await git(["commit", "-q", "-m", "own artifacts"])
  await git(["checkout", "-q", "-b", "work"])
  await fs.mkdir(path.join(directory, "docs"), { recursive: true })
  await fs.writeFile(path.join(directory, "docs/export.md"), "# CSV export\n\nThe report downloads as CSV.\n")
  await git(["add", "docs"])
  await git(["commit", "-q", "-m", "spec the export"])
  return AbsolutePath.make(directory)
}

export const directory = await ownDirectory()

export const restoreAlpha = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => fs.readFile(path.join(directory, "src/alpha.ts"))),
    () => body,
    (bytes) => Effect.promise(() => fs.writeFile(path.join(directory, "src/alpha.ts"), bytes)),
  )

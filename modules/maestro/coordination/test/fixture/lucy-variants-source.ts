import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { outsidePath, type Fixture } from "./lucy-engagement"
import { fullSearch, type VariantCandidate, type VariantGeneration } from "./lucy-variants"

export const lineagePath = "src/lineage.ts"
export const hiddenPath = "src/hidden.ts"
export const liveMarker = "LIVE_VARIANT_SOURCE_MUST_NOT_APPEAR"
export const outsideMarker = "VARIANT_SEED_OUTSIDE_AUTHORITY"

export function candidate(file: string, line: number, quote: string,
  severity: VariantCandidate["severity"] = "P1"): VariantCandidate {
  return { path: file, line, endLine: line, severity, quote,
    trigger: "The same captured invariant fails at this distinct primary source location." }
}

/** Real tracked files and one real commit. No Git, CODE, analyzer or provider result is fabricated. */
export const installSources = (root: Fixture, files: Readonly<Record<string, string>>) => Effect.gen(function* () {
  yield* Effect.forEach(Object.entries(files), ([file, content]) => Effect.promise(async () => {
    await fs.mkdir(path.dirname(path.join(root.directory, file)), { recursive: true })
    await fs.writeFile(path.join(root.directory, file), content)
  }), { discard: true })
  // The hidden positive is deliberately tracked despite an admitted ignore file.
  yield* root.git("add", "-f", "--", ...Object.keys(files))
  yield* root.git("commit", "-q", "-m", "real-variant-source")
  return yield* root.git("rev-parse", "HEAD")
})

export const lineageSource = (root: Fixture) => Effect.gen(function* () {
  const seeds = [
    'export const primarySeed = "VARIANT_SEED_PRIMARY";',
    'export const secondarySeed = "VARIANT_SEED_SECONDARY";',
    'export const support = "CAPTURED SUPPORTING RANGE ONLY";',
  ]
  const files: Record<string, string> = {
    [lineagePath]: seeds.join("\n") + "\n",
    "src/.gitignore": "hidden.ts\n",
    [outsidePath]: `export const outside = "${outsideMarker}";\n`,
  }
  const generations: VariantGeneration[] = []
  for (const ordinal of [1, 2, 3]) {
    const name = `src/generation-${ordinal}.ts`
    const lines = [1, 2, 3].map((number) => `export const g${ordinal}v${number} = "VARIANT_G${ordinal}_${number}";`)
    files[name] = (ordinal === 1 ? lines.slice(0, 2) : lines).join("\n") + "\n"
    if (ordinal === 1) files[hiddenPath] = lines[2] + "\n"
    const candidates = lines.map((line, index) => candidate(
      ordinal === 1 && index === 2 ? hiddenPath : name,
      ordinal === 1 && index === 2 ? 1 : index + 1,
      line, index === 0 ? "P1" : index === 1 ? "P2" : "P3",
    ))
    generations.push({
      search: fullSearch(`VARIANT_(SEED|G[1-${ordinal}])`), candidates,
      dispositions: candidates.map((item, index) => ({ path: item.path, line: item.line,
        state: index === 2 ? "noise" as const : "confirmed" as const })),
    })
  }
  const initial: VariantCandidate[] = [
    { ...candidate(lineagePath, 1, seeds[0]), support: { path: lineagePath, startLine: 3, endLine: 3 } },
    candidate(lineagePath, 2, seeds[1], "P2"),
  ]
  return { revision: yield* installSources(root, files), files, initial, generations, support: seeds[2] }
})

export const pairSource = (root: Fixture) => Effect.gen(function* () {
  const file = "src/pair.ts"
  const lines = ['export const firstVariant = "PAIR_VARIANT_A";', 'export const secondVariant = "PAIR_VARIANT_B";']
  const candidates = lines.map((line, index) => candidate(file, index + 1, line, index === 0 ? "P1" : "P2"))
  return { revision: yield* installSources(root, { [file]: lines.join("\n") + "\n" }), candidates,
    search: fullSearch("sharedValue|PAIR_VARIANT") }
})

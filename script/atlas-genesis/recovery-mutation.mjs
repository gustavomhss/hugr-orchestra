// Remote recovery controls. Mutate ONE production expression, then require a named test assertion to fail.
// No processes or providers are started here; the workflow owns test execution and restoration.
import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const cases = {
  signals: {
    file: "modules/atlas/packages/genesis/src/rank.ts",
    needle: "return signals ??= deps.history.signals(c.site)",
    replacement: "return { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }",
    title: "defers all reads, memoizes each candidate, and preserves the exact unvisited tail",
  },
  age: {
    file: "modules/atlas/packages/adapter-io/src/git-history.ts",
    needle: "-Math.max(0, revisionSeconds - committerSeconds(timestamp))",
    replacement: "0",
    title: "hotspot — pinned committer age decays single commits and shared histories with exact goldens",
  },
  authors: {
    file: "modules/atlas/packages/adapter-io/src/open-questions-source.ts",
    needle: "authorsOf: (unit) => minedAuthors(repoPath, facts, unit),",
    replacement: "authorsOf: () => [],",
    title: "offers only distinct sorted authors of the unit's fact files and changes only options as authors change",
  },
  "szz-cap": {
    file: "modules/atlas/packages/adapter-io/src/git-history.ts",
    needle: ".slice(0, SZZ_MAX_FIX_COMMITS)",
    replacement: ".slice(0)",
    title: "applies the newest-200-fix cap globally BEFORE selecting a requested path",
  },
  metrics: {
    file: "modules/atlas/packages/cli/src/mine-render.ts",
    needle: "modelCalls: r.modelCalls ?? null",
    replacement: "modelCalls: r.llmCalls",
    title: "renders issued calls and staged writes separately from used calls and admitted facts",
  },
  "evidence-plan": {
    file: "modules/atlas/packages/cli/src/mine.ts",
    needle: "watch?.onPlan?.(sites)",
    replacement: "void sites",
    title: "writes the exact full four-site plan before proposer entry without hydrating the ceiling tail",
  },
  "evidence-report": {
    file: "modules/atlas/packages/cli/src/mine.ts",
    needle: "evidence.report(report)",
    replacement: "void report",
    title: "preserves two seeded facts and the third-site identity before rethrowing the original ModelCommandError",
  },
  "evidence-fault": {
    file: "modules/atlas/packages/cli/src/mine.ts",
    needle: "throw failure // Preserve the established run fault even when receipt persistence fails.",
    replacement: "throw error",
    title: "preserves the original model fault when a report-only file already exists",
  },
  "claim-store": {
    file: "modules/atlas/packages/cli/src/mine-decide.ts",
    needle: "      ...evidence,",
    replacement: "      // mutation: omit individual claim receipts",
    title: "one intrinsic place row retains both individually resolvable claims/derivations and one shared answer receipt",
  },
  "claim-union": {
    file: "modules/atlas/packages/knowledge/src/write/upsert.ts",
    needle: "replaces ? undefined : prior.claimEvidenceByClaim",
    replacement: "undefined",
    title: "same-tier UPDATE unions claim evidence at one key; raise, replace and SUPERSEDE prune dropped claims without deleting CAS history",
  },
  "claim-prune": {
    file: "modules/atlas/packages/knowledge/src/write/claim-evidence.ts",
    needle: "const entries = claims.flatMap((claim) => {",
    replacement: "const entries = [...new Set([...claims, ...Object.keys(sources[0] ?? {})])].flatMap((claim) => {",
    title: "same-tier UPDATE unions claim evidence at one key; raise, replace and SUPERSEDE prune dropped claims without deleting CAS history",
  },
  "claim-own": {
    file: "modules/atlas/packages/knowledge/src/write/claim-evidence.ts",
    needle: "Object.hasOwn(source, claim) && ",
    replacement: "",
    title: "own __proto__/constructor claim receipts survive without laundering off-claim or inherited-only evidence or changing prototypes",
  },
  "claim-replace": {
    file: "modules/atlas/packages/knowledge/src/write/upsert.ts",
    needle: "replaces ? undefined : prior.claimEvidenceByClaim",
    replacement: "prior.claimEvidenceByClaim",
    title: "same-claim carrierless replacements drop prior evidence for raise, replace and SUPERSEDE",
  },
  "claim-answer": {
    file: "modules/atlas/packages/cli/src/mine-decide.ts",
    needle: "[claimNorm]: { factRef, ...(receipt !== undefined ? { answerRef: receipt.answerRef } : {}) },",
    replacement: "[claimNorm]: { factRef, ...(receipt !== undefined ? { answerRef: String(id(rawAnswer!)) } : {}) },",
    title: "evidence uses only the surviving scrubbed claim key and points to that exact scrubbed fact in CAS",
  },
}

export function mutationSource(text, name) {
  const entry = cases[name]
  assert(entry, "recovery-mutation: unknown control")
  assert.equal(text.split(entry.needle).length, 2, "recovery-mutation: must change exactly one expression")
  return text.replace(entry.needle, entry.replacement)
}

export function verifyMutation(report, name, code) {
  const entry = cases[name]
  assert(entry, "recovery-mutation: unknown control")
  assert.equal(code, 1, "recovery-mutation: require a test failure, not success/crash/timeout")
  assert(report.numTotalTests > 0 && report.numFailedTests > 0, "recovery-mutation: no failed tests executed")
  const assertions = report.testResults.flatMap((suite) => suite.assertionResults ?? [])
  assert(assertions.some((test) => test.title === entry.title && test.status === "failed" &&
    test.failureMessages?.some((message) => message.includes("AssertionError"))),
  "recovery-mutation: the named behavioral assertion did not detect the defect")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, name, evidence, status] = process.argv.slice(2)
  assert(Object.hasOwn(cases, name), "recovery-mutation: unknown control")
  const file = fileURLToPath(new URL(`../../${cases[name].file}`, import.meta.url))
  if (command === "apply") {
    assert(!existsSync(evidence), "recovery-mutation: backup already exists")
    const original = readFileSync(file, "utf8")
    const mutated = mutationSource(original, name)
    writeFileSync(evidence, original, { mode: 0o600 })
    writeFileSync(file, mutated)
  } else if (command === "restore") {
    writeFileSync(file, readFileSync(evidence))
  } else if (command === "verify") {
    verifyMutation(JSON.parse(readFileSync(evidence, "utf8")), name, Number(status))
    console.log(`recovery-mutation: ${name} detected by its named behavioral assertion`)
  } else throw new Error("recovery-mutation: unknown command")
}

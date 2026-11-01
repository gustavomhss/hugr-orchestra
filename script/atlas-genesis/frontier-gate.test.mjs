// Tests for the atlas-genesis frontier gate. Run: node --test script/atlas-genesis/frontier-gate.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { classify, evaluate } from "./frontier-gate.mjs"

const tsv = (paths) =>
  ["rank\toutcome\tkind\tpath", ...paths.map((p, i) => `${i + 1}\tabstained\tfile\t${p}`)].join("\n") + "\n"

test("classify: hand-written source by language, and each exclusion class", () => {
  assert.deepEqual(classify("packages/core/src/session.ts"), { language: "TypeScript", class: "source", handWritten: true })
  assert.equal(classify("modules/relay/lib/orchestra_relay/x.py").handWritten, true)
  assert.equal(classify("native/omni/crates/a/src/lib.rs::fn_x").handWritten, true) // a unit site is judged by its file
  for (const [path, cls] of [
    ["packages/core/test/a.ts", "test"],
    ["packages/core/src/a.test.ts", "test"],
    ["pkg/test_util.py", "test"],
    ["packages/e2e-blackbox/src/h.ts", "e2e"],
    ["src/fixtures/a.ts", "fixture"],
    ["crate/benches/b.rs", "benches"],
    ["packages/sdk/src/generated/api.ts", "generated"],
    ["src/Button.stories.tsx", "stories"],
    ["README.md", "docs"],
    ["tsconfig.json", "docs"],
    ["bun.lock", "lockfile"],
    ["modules/atlas/packages/cli/src/mine.ts", "modules/atlas"],
    ["native/omni/qa/run.rs", "native/omni/qa"],
    ["script/build.sh", "not source"],
    ["packages/core/src/types.d.ts", "declaration"],
    ["packages/core/src/types.d.mts", "declaration"],
    ["node_modules/x/index.ts", "build output"],
    ["packages/sdk/dist/index.ts", "build output"],
    ["native/omni/target/debug/build.rs", "build output"],
    ["apps/desktop/build/main.ts", "build output"],
  ])
    assert.equal(classify(path).class, cls, path)
})

test("pass: an arm whose top sites are hand-written passes and prints the language table", () => {
  const paths = [
    ...Array.from({ length: 18 }, (_, i) => `packages/core/src/m${i}.ts`),
    "modules/relay/lib/orchestra_relay/a.py",
    "native/omni/crates/a/src/lib.rs",
    "packages/core/test/x.ts", // 1 of 21 excluded: 95.2% hand-written
  ]
  const r = evaluate([{ arm: "advisory", tsv: tsv(paths) }])
  assert.equal(r.ok, true)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.warnings, [])
  assert.match(r.markdown, /\| advisory \| 21 \| 95\.2% \| pass \|/)
  assert.match(r.markdown, /\| TypeScript \| 19 \|/)
  assert.match(r.markdown, /\| Python \| 1 \|/)
})

test("fail: under 85% hand-written names the offending classes with counts and examples", () => {
  const paths = [
    ...Array.from({ length: 6 }, (_, i) => `packages/core/src/m${i}.ts`),
    ...Array.from({ length: 7 }, (_, i) => `packages/core/test/t${i}.ts`),
    "README.md",
    "bun.lock",
  ]
  const r = evaluate([{ arm: "dependency", tsv: tsv(paths) }])
  assert.equal(r.ok, false)
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /arm dependency: 40\.0% of the top 15 sites/)
  assert.match(r.errors[0], /test 7 \(e\.g\. packages\/core\/test\/t0\.ts, .*t4\.ts\)/) // 5 examples
  assert.doesNotMatch(r.errors[0], /t5\.ts/)
  assert.match(r.errors[0], /docs 1 \(e\.g\. README\.md\)/)
  assert.match(r.errors[0], /lockfile 1/)
})

test("empty: an arm with no planned site fails with a clear message; no arm at all fails too", () => {
  const r = evaluate([{ arm: "count", tsv: tsv([]) }])
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /arm count: empty frontier — .*indexing or the site filter broke/)
  assert.equal(evaluate([]).ok, false)
})

test("only the top 200 by rank are judged", () => {
  const paths = [...Array.from({ length: 200 }, (_, i) => `src/m${i}.ts`), ...Array.from({ length: 100 }, () => "README.md")]
  const shuffled = tsv(paths).split("\n").reverse().filter((l) => l && !l.startsWith("rank")).join("\n")
  assert.equal(evaluate([{ arm: "advisory", tsv: `rank\toutcome\tkind\tpath\n${shuffled}\n` }]).ok, true)
})

test("Python or Rust absent from every top frontier is a warning, not a failure", () => {
  const r = evaluate([{ arm: "advisory", tsv: tsv(["packages/core/src/a.ts", "packages/core/src/b.ts"]) }])
  assert.equal(r.ok, true)
  assert.deepEqual(r.warnings, ["no Python site reached any arm's top 200", "no Rust site reached any arm's top 200"])
})

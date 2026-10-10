import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { filter, getProfiles, tokenizeCommand } from "hugr-lean/core"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanProcessor } from "../src/tool/lean-processor"

const output = "=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n"
const observation = { source: "shell" as const, command: "go test -v .", output,
  termination: { kind: "exited" as const, code: 0 }, completeness: "complete" as const, presentation: "unknown" as const }

test("approved backend artifact identity and actual pure engine reduction", async () => {
  const bytes = await Bun.file(path.join(import.meta.dir, "../vendor/hugr-lean-0.2.0-native-465fb4c04773.tgz")).arrayBuffer()
  expect(bytes.byteLength).toBe(387905)
  expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
    .toBe("369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1")
  const result = LeanProcessor.process({ source: "shell", command: "go test -v .", output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" })
  expect(result.status).toBe("reduced")
  if (result.status !== "reduced") throw new Error("Approved engine did not reduce the controlled complete Go output")
  expect(result.replacement).toBe("PASS\nok  \texample.test\t0.001s\n")
  expect(result.inputBytes).toBe(Buffer.byteLength(output))
  expect(result.outputBytes).toBe(Buffer.byteLength(result.replacement))
})

test("actual backend engine preserves unknown output and nonzero termination", () => {
  for (const observation of [
    { output: "unknown producer output", termination: { kind: "exited" as const, code: 0 } },
    { output, termination: { kind: "exited" as const, code: 7 } },
  ]) {
    const result = LeanProcessor.process({ source: "shell", command: "go test -v .", completeness: "complete",
      presentation: "unknown", ...observation })
    expect(result.status).toBe("passthrough")
    expect("replacement" in result).toBe(false)
  }
})

test("actual built-in inventory agrees in both directions with the dashboard catalogue", () => {
  const profiles = getProfiles()
  expect(profiles.length).toBeGreaterThan(0)
  expect(profiles.map((profile) => profile.id).sort())
    .toEqual(LeanCoverage.items.flatMap((item) => [...item.profiles]).sort())
  for (const profile of profiles) expect(LeanCoverage.forProfile(profile.id)).toBeDefined()
  const commands = [
    ["cargo test", "cargo"], ["cargo build", "cargo"], ["cargo check", "cargo"], ["cargo clippy", "cargo"],
    ["go test -v .", "go"], ["go test -json .", "go"], ["go mod download", "go"], ["pytest", "pytest"],
    ["jest", "jest"], ["vitest run", "vitest"], ["git status", "git"], ["rg -n needle .", "rg"],
    ["tsc --build tsconfig.json --verbose --pretty false", "tsc"], ["node --test", "node"],
    ["pnpm install --ignore-scripts --ignore-pnpmfile", "pnpm"], ["eslint clean.js", "eslint"],
    ["biome check clean.js", "biome"], ["ruff check --output-format=json --exit-zero clean.py", "ruff"],
    ["pyright --outputjson clean.py", "pyright"], ["pylint --output-format=json --exit-zero clean.py", "pylint"],
  ] as const
  for (const [command, id] of commands) {
    const argv = tokenizeCommand(command)
    expect(argv).toBeDefined()
    const matched = profiles.filter((profile) => profile.match(argv!))
    if (matched.length !== 1) throw new Error(`Expected one actual built-in for ${command}: ${matched.map((profile) => profile.id).join(", ")}`)
    expect(matched).toHaveLength(1)
    expect(LeanProcessor.identify(command)).toBe(id)
  }
})

test("disabled item preserves exact bytes without disabling other actual items or mutating input", () => {
  expect(LeanProcessor.process(observation).status).toBe("reduced")
  expect(LeanProcessor.process(observation, { cargo: false })).toEqual(filter(observation))
  const before = structuredClone(observation)
  const result = LeanProcessor.process(observation, { go: false })
  expect(result.status).toBe("passthrough")
  expect("replacement" in result).toBe(false)
  expect(result.inputBytes).toBe(Buffer.byteLength(output))
  expect(result.outputBytes).toBe(result.inputBytes)
  expect(observation).toEqual(before)
  expect(LeanProcessor.process(observation, { go: true })).toEqual(filter(observation))
  expect(LeanProcessor.process(observation).status).toBe("reduced")
})

// Native fixture literals from https://github.com/gustavomhss/HuGR-Lean,
// commit 465fb4c04773f1a40733c9f4c334b980e3195646, fixtures/formats/{jest_native,vitest_native}.txt.
// MIT, copyright (c) 2026 gmhelmold; full LICENSE ships in the existing pinned vendor archive.
// Capture versions: Jest 30.2.0 / Vitest 3.2.4; provenance: fixtures/formats/SOURCES.md at that commit.
// Modification record: literal escaping/line joining only, native UTF-8 bytes unchanged and hash-pinned;
// test adds an SGR wrapper solely to exercise the package's existing presentation normalization.
const frameworkFixtures = [
  { id: "jest", command: "jest --runInBand --verbose --no-color", bytes: 242,
    sha256: "dbb8f4e893d8a4a00f60977ca9411bc953729f50258d4fdedd3368ba711db17a",
    output: ["PASS ./jest-native.test.cjs", "  maths 🔥", "    ✓ adds café (7 ms)", "    nested",
      "      ✓ keeps path: evidence (2 ms)", "", "Test Suites: 1 passed, 1 total", "Tests:       2 passed, 2 total",
      "Snapshots:   0 total", "Time:        1.022 s", "Ran all test suites.", ""].join("\n") },
  { id: "vitest", command: "vitest run vitest-native.test.js --globals --no-color", bytes: 322,
    sha256: "97251d219dd514087b42e0bca26b0b30bcf46233d5bcb1d6fd92abdd77cc9566",
    output: ["", " RUN  v3.2.4 /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-formats-native",
      "", " ✓ vitest-native.test.js (2 tests) 5ms", "", " Test Files  1 passed (1)", "      Tests  2 passed (2)",
      "   Start at  00:23:02", "   Duration  1.28s (transform 26ms, setup 0ms, collect 10ms, tests 5ms, environment 0ms, prepare 324ms)",
      "", ""].join("\n") },
] as const

for (const fixture of frameworkFixtures) test(`${fixture.id} pinned native normalization follows the actual default engine unless explicitly disabled`, () => {
  expect(Buffer.byteLength(fixture.output)).toBe(fixture.bytes)
  expect(createHash("sha256").update(fixture.output).digest("hex")).toBe(fixture.sha256)
  expect(LeanProcessor.identify(fixture.command)).toBe(fixture.id)
  const plain = { ...observation, command: fixture.command, output: fixture.output }
  const unchanged = filter(plain)
  expect(unchanged.status).toBe("passthrough")
  expect("replacement" in unchanged).toBe(false)
  expect(LeanProcessor.process(plain)).toEqual(unchanged)
  expect(LeanProcessor.process(plain, { [fixture.id]: true })).toEqual(unchanged)
  const input = { ...plain, output: `\u001b[32m${fixture.output}\u001b[0m`, presentation: "terminal-rendered" as const }
  const before = structuredClone(input), baseline = filter(input)
  expect(baseline.status).toBe("normalized")
  if (baseline.status !== "normalized") throw new Error(`${fixture.id}: actual pinned engine did not normalize the native positive control`)
  expect(baseline.inputBytes).toBe(fixture.bytes + 9)
  expect(baseline.outputBytes).toBe(fixture.bytes)
  expect(Buffer.from(baseline.replacement)).toEqual(Buffer.from(fixture.output))
  expect(LeanProcessor.process(input)).toEqual(baseline)
  expect(LeanProcessor.process(input, {})).toEqual(baseline)
  expect(LeanProcessor.process(input, { [fixture.id]: true })).toEqual(baseline)
  const disabled = LeanProcessor.process(input, { [fixture.id]: false })
  expect(disabled.status).toBe("passthrough")
  expect("replacement" in disabled).toBe(false)
  expect(disabled.inputBytes).toBe(fixture.bytes + 9)
  expect(disabled.outputBytes).toBe(disabled.inputBytes)
  expect(Buffer.from("replacement" in disabled ? disabled.replacement : input.output)).toEqual(Buffer.from(before.output))
  expect(input).toEqual(before)
})

test("exact-only prefixes attribute preservation without borrowing any reducer", () => {
  // Prefix evidence: fixtures/profiles/*/cases.json at the vendor README source pin (MIT); no fixtures copied.
  const commands = [
    ["cargo bench", "cargo"], ["cargo doc", "cargo"], ["cargo fetch", "cargo"], ["cargo install --path .", "cargo"],
    ["cargo fmt --check", "cargo"], ["cargo nextest run", "cargo"],
    ["go test -run LiteralAbsent -bench BenchmarkTiny .", "go"], ["go build -v .", "go"], ["go vet .", "go"],
    ["bun install", "bun"], ["/usr/local/bin/bun test", "bun"], ["/tmp/node_modules/.bin/esbuild src/main.js", "esbuild"],
    ["golangci-lint run", "golangci"], ["markdownlint-cli2 clean.md", "markdownlint"], ["mypy clean.py", "mypy"],
    ["node node_modules/next/dist/bin/next build", "next"], ["npm install", "npm"], ["npm ci", "npm"],
    ["pip install local.whl", "pip"], ["/tmp/bin/python -m pip install local.whl", "pip"],
    ["prettier --check clean.js", "prettier"], ["npx --no-install prettier clean.js", "prettier"],
    ["rollup --config local.mjs", "rollup"], ["shellcheck clean.sh", "shellcheck"], ["stylelint clean.css", "stylelint"],
    ["uv pip install local.whl", "uv"], ["uv pip sync requirements.txt", "uv"], ["uv sync --locked", "uv"], ["uv lock", "uv"],
    ["vite build", "vite"], ["webpack --config webpack.config.cjs", "webpack"], ["yarn install", "yarn"],
  ] as const
  for (const [command, id] of commands) {
    expect(LeanProcessor.identify(command)).toBe(id)
    // Even native-shaped Go text must never reduce under an exact-only prefix.
    const input = { ...observation, command }, before = structuredClone(input)
    const result = LeanProcessor.process(input)
    expect("replacement" in result).toBe(false)
    expect(result.outputBytes).toBe(Buffer.byteLength(input.output))
    expect(input).toEqual(before)
  }
})

test("unknown shell syntax, reporters, failures and incomplete observations stay exact", () => {
  for (const patch of [
    { command: "go test -v . && true" }, { command: "GOFLAGS=-v go test ." }, { command: "sh -c 'go test -v .'" },
    { command: "jest --reporters=custom" }, { command: "vitest --reporter=custom" },
    { command: "node node_modules/@playwright/test/cli.js test" },
    { output: "custom reporter café 🔥\r\n" }, { termination: { kind: "exited" as const, code: 1 } },
    { completeness: "truncated" as const }, { termination: { kind: "timed_out" as const } },
  ]) {
    const input = { ...observation, ...patch }, before = structuredClone(input)
    const result = LeanProcessor.process(input)
    expect("replacement" in result).toBe(false)
    expect(result.outputBytes).toBe(Buffer.byteLength(input.output))
    expect(input).toEqual(before)
  }
  for (const command of ["npm run test", "bun run test", "yarn test", "uv run pytest", "node custom/cli.js test",
    "node node_modules/@playwright/test/cli.js test", "jest --reporters=custom", "prettier-fake clean.js"])
    expect(LeanProcessor.identify(command)).toBeUndefined()
  for (const command of ["jest", "vitest run"]) {
    expect(LeanProcessor.identify(command)).toBe(command === "jest" ? "jest" : "vitest")
    expect("replacement" in LeanProcessor.process({ ...observation, command })).toBe(false)
  }
})

test("seeded overlap of actual matchers remains exact even when one item is disabled", async () => {
  // Isolated control seeds a second real Go matcher/reducer; production registry stays immutable.
  const code = `import { mock } from 'bun:test';
    const actual = await import('hugr-lean/core');
    const profiles = actual.getProfiles(), filter = actual.filter, tokenizeCommand = actual.tokenizeCommand;
    const go = profiles.find(profile => profile.id === 'go-test-verbose');
    if (!go) throw new Error('Missing actual Go positive control');
    mock.module('hugr-lean/core', () => ({ filter, tokenizeCommand,
      getProfiles: () => Object.freeze([...profiles, Object.freeze({ ...go, id: 'cargo-test' })]) }));
    const { LeanProcessor } = await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/tool/lean-processor.ts"))});
    if (LeanProcessor.identify('go test -v .') !== undefined) throw new Error('Overlap attributed');
    for (const items of [{}, { go: false }, { cargo: false }]) {
      const result = LeanProcessor.process(${JSON.stringify(observation)}, items);
      if (result.status !== 'failed_open' || result.reason !== 'overlapping_profiles' || 'replacement' in result)
        throw new Error('Disabled item hid actual matcher overlap: ' + JSON.stringify(result));
    }`
  const child = Bun.spawn([process.execPath, "--eval", code], { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe", timeout: 60000 })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (exit !== 0) throw new Error(`Actual overlap probe failed: ${exit}\n${stdout}\n${stderr}`)
})

test("core package typecheck in CI", async () => {
  const child = Bun.spawn([process.execPath, "typecheck"], { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe", timeout: 240000 })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (exit !== 0) throw new Error(`Core typecheck failed: ${exit}\n${stdout}\n${stderr}`)
}, 240000)

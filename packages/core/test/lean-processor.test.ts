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
    ["tsc --build tsconfig.json --verbose --pretty false", "tsc"], ["node --test", "node"], ["pnpm install", "pnpm"], ["eslint clean.js", "eslint"],
    ["biome check clean.js", "biome"], ["ruff check --output-format=json --exit-zero clean.py", "ruff"],
    ["pyright --outputjson clean.py", "pyright"], ["pylint --output-format=json --exit-zero clean.py", "pylint"],
  ] as const
  for (const [command, id] of commands) {
    const argv = tokenizeCommand(command)
    expect(argv).toBeDefined()
    expect(profiles.filter((profile) => profile.match(argv!))).toHaveLength(1)
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

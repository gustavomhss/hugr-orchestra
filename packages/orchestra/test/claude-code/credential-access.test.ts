import { expect, test } from "bun:test"
import path from "node:path"

// No Orchestra code path reads Claude Code's credentials (meta-harness PLAN.md §3, V1): no Keychain lookup through
// `security find-generic-password`, no read of `.credentials.json`, no parse of its `claudeAiOauth` record. Claude Code
// signs in from its own store; Orchestra learns sign-in status only from the SDK (specs/claude-code-engine.md, "Auth").
// The scan covers the source and scripts of every package, whatever the language.

const ROOT = path.resolve(import.meta.dir, "../../../..")
const SCOPE = "packages/*/{src,script}/**/*.{ts,tsx,js,mjs,cjs,py,sh}"
const READS = [/find-(generic|internet)-password/, /\.credentials\.json/, /Claude Code-credentials/, /claudeAiOauth/]

function hits(file: string, text: string) {
  return text.split("\n").flatMap((line, index) => READS.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])
}

test("the scan flags every credential-read form it looks for", () => {
  const sample = ['spawnSync("security", ["find-generic-password", "-s", service])', 'readFileSync(join(dir, ".credentials.json"))',
    'const service = "Claude Code-credentials"', "parsed.claudeAiOauth.accessToken", 'execFile("security", ["find-internet-password"])']
  expect(sample.flatMap((line) => hits("sample.ts", line))).toHaveLength(sample.length)
  expect(hits("sample.ts", 'const credentials = await ask("the owner")')).toEqual([])
})

test("no package source or script reads Claude Code's Keychain item or credential file", async () => {
  const files = await Array.fromAsync(new Bun.Glob(SCOPE).scan({ cwd: ROOT }))
  const scanned = files.filter((file) => !file.split(path.sep).includes("node_modules"))
  // Positive controls: the scan reaches Claude mode's spawn seam and a broad slice of the repository.
  expect(scanned.map((file) => file.split(path.sep).join("/"))).toContain("packages/orchestra/src/claude-code/sdk.ts")
  expect(scanned.length).toBeGreaterThan(500)
  const found = (await Promise.all(scanned.map(async (file) => hits(file, await Bun.file(path.join(ROOT, file)).text())))).flat()
  if (found.length) throw new Error(["Orchestra code must not read Claude Code's credentials:", ...found].join("\n"))
})

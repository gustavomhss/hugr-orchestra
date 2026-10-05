import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { BACKEND_DEFAULT_LABEL } from "../../src/maestro/roster"

// Owner rule: the backend seat's former personal name survives in exactly one tracked line, the default display
// label. The search target is that label lowercased (matched case-insensitively), so this file never spells the name;
// the digest pins which word it is, so changing the default label fails here instead of silently retargeting the scan.
const NAME = BACKEND_DEFAULT_LABEL.toLowerCase()
const NAME_SHA256 = "b9dd960c1753459a78115d3cb845a57d924b6877e805b08bd01086ccdf34433c"
const ALLOWED_FILE = "packages/opencode/src/maestro/roster.ts"
const ALLOWED_LINE = /^export const BACKEND_DEFAULT_LABEL = "[^"]+"$/
// Positive control: this file is tracked, so the same search must find this constant's own line.
const SENTINEL = "Specialist-Name-Guard-Positive-Control"
const SELF = "packages/opencode/test/agent/specialist-name-guard.test.ts"

describe("specialist name guard", () => {
  test("the search target is the pinned default label", () => {
    expect(createHash("sha256").update(NAME).digest("hex")).toBe(NAME_SHA256)
  })

  test("positive control: the search sees a known occurrence in a tracked file, case-insensitively", () => {
    const hits = search(SENTINEL.toUpperCase())
    expect(hits.map((hit) => hit.file)).toContain(SELF)
  })

  test("the only tracked occurrence of the name is the default label constant", () => {
    const hits = search(NAME)
    expect(hits.filter((hit) => !(hit.file === ALLOWED_FILE && ALLOWED_LINE.test(hit.text)))).toEqual([])
    expect(hits).toHaveLength(1)
  })
})

// Runs `git grep -n -i` over every tracked file from the repository root. It fails closed: a missing git, an unknown
// root or any exit other than 0 (matches) or 1 (no match) throws, and an output line that does not parse as
// `path NUL line NUL text` (for example a binary-file match) is returned unparsed so it can never be allowlisted.
function search(word: string) {
  const root = run(["git", "rev-parse", "--show-toplevel"], import.meta.dir, [0]).trim()
  if (!root) throw new Error("git rev-parse returned no repository root")
  return run(["git", "grep", "-n", "-i", "--null", "-F", "-e", word], root, [0, 1])
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [file, number, ...text] = line.split("\0")
      if (text.length === 0) return { file: line, line: 0, text: "" }
      return { file, line: Number(number), text: text.join("\0") }
    })
}

function run(cmd: string[], cwd: string, ok: number[]) {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  if (!ok.includes(result.exitCode))
    throw new Error(`${cmd.join(" ")} exited ${result.exitCode}: ${result.stderr.toString()}`)
  return result.stdout.toString()
}

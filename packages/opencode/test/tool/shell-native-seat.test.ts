import { expect, test } from "bun:test"
import { ShellPrompt } from "../../src/tool/shell/prompt"

// Windows checkouts may convert the shell description to CRLF; native seats must lose the same sections either way.
test.each([
  ["LF", "\n"],
  ["CRLF", "\r\n"],
])("native seat description drops tmp and Git guidance with %s line endings", (_, eol) => {
  const description = [
    "Executes a given command.",
    "Use `/tmp/x` for temporary work outside the workspace. It is pre-approved.",
    "Keep commands short.",
    "",
    "# Git and GitHub",
    "Commit only when asked.",
  ].join(eol)
  const seat = ShellPrompt.nativeSeat(description)
  expect(seat).toContain("Keep commands short.")
  expect(seat).not.toContain("temporary work outside the workspace")
  expect(seat).not.toContain("# Git and GitHub")
})

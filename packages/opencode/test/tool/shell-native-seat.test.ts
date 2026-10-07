import { expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { ShellPrompt } from "../../src/tool/shell/prompt"

// The real description, so a rewrite of the shell text cannot leave the native seat copy unchanged.
const description = ShellPrompt.render("bash", "linux", { maxLines: 2000, maxBytes: 51200 }, 120000).description

// Windows checkouts may convert the shell description to CRLF; native seats must lose the same sections either way.
// The source text already carries CRLF on such a checkout, so it is normalized before each variant is built.
test.each([
  ["LF", "\n"],
  ["CRLF", "\r\n"],
])("native seat description drops tmp and Git guidance with %s line endings", (_, eol) => {
  const full = description.replaceAll("\r\n", "\n").replaceAll("\n", eol)
  expect(full).toContain(Global.Path.tmp)
  expect(full).toContain("# Git and GitHub")
  const seat = ShellPrompt.nativeSeat(full)
  expect(seat).toContain("Read files and edit their contents with the file tools")
  expect(seat).toContain("# Results")
  expect(seat).not.toContain(Global.Path.tmp)
  expect(seat).not.toContain("pre-approved")
  expect(seat).not.toContain("# Git and GitHub")
})

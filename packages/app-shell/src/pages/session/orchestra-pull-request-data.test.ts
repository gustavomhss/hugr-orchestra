import { describe, expect, test } from "bun:test"
import { codeSpan, pullRequestFilename, pullRequestMarkdown, pullRequestProposal } from "./orchestra-pull-request-data"

const copy = { summary: "Summary", files: "Files", noFiles: "No changed files in this view." }

describe("pullRequestProposal", () => {
  test("lists each changed file once with its measured counts and the real branches", () => {
    const proposal = pullRequestProposal({
      title: " Approval flow refactor ",
      branch: "feature/approval",
      base: "dev",
      files: [
        { file: "src/approval.ts", additions: 48, deletions: 32 },
        { file: "docs/flow.md" },
        { file: "src/approval.ts", additions: 48, deletions: 32 },
      ],
      copy,
    })
    expect(proposal).toEqual({
      title: "Approval flow refactor",
      from: "feature/approval",
      base: "dev",
      description: [
        "Summary",
        "- Approval flow refactor",
        "",
        "Files",
        "- `src/approval.ts` (+48 −32)",
        "- `docs/flow.md`",
      ].join("\n"),
    })
  })

  test("says when the view has no changed files and leaves unknown branches empty", () => {
    const proposal = pullRequestProposal({ title: "", branch: null, base: undefined, files: [], copy })
    expect(proposal.from).toBe("")
    expect(proposal.base).toBe("")
    expect(proposal.description).toBe(["Summary", "", "Files", "- No changed files in this view."].join("\n"))
  })
})

describe("pullRequestMarkdown", () => {
  test("writes the edited title, both branches and the description", () => {
    expect(pullRequestMarkdown({ title: "Fix", from: "fix-it", base: "dev", description: "Summary\n- Fix\n" })).toBe(
      "# Fix\n\n`fix-it` → `dev`\n\nSummary\n- Fix\n",
    )
  })

  test("fences branch names longer than any backtick run they contain", () => {
    expect(pullRequestMarkdown({ title: "Fix", from: "a`b", base: "``dev", description: "Body" })).toBe(
      "# Fix\n\n``a`b`` → ``` ``dev ```\n\nBody\n",
    )
  })

  test("omits the branch line unless both branches are named", () => {
    expect(pullRequestMarkdown({ title: "Fix", from: "fix-it", base: " ", description: "Body" })).toBe(
      "# Fix\n\nBody\n",
    )
  })
})

describe("pullRequestFilename", () => {
  test("keeps the title readable and strips path separators", () => {
    expect(pullRequestFilename("Review PR 231: session/drain")).toBe("Review PR 231- session-drain-pr.md")
    expect(pullRequestFilename("   ")).toBe("pull-request-pr.md")
  })
})

describe("codeSpan", () => {
  test("uses a single backtick for plain text and pads a leading or trailing backtick", () => {
    expect(codeSpan("src/a.ts")).toBe("`src/a.ts`")
    expect(codeSpan("`tick")).toBe("`` `tick ``")
  })
})

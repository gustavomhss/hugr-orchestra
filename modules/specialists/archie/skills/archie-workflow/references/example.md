# Example: a changelog-backed release note workflow

A two-phase, four-step workflow for a project whose tests run with `bun test` and whose notes live in `docs/notes`.
Replace the paths and commands with the ones of the project you inspected. This is the `sprint` value you pass to
`archie_draft_workflow`, as JSON.

```json
{
  "brief": "Write a release note for the changes since the last tag. The note names every user-visible change, links its PR and passes a cold read by someone who did not write the code.",
  "retry_budget": 3,
  "macros": [
    {
      "id": "gather",
      "title": "Gather",
      "instructions": "Collect facts before writing. Read the git log and the merged PRs since the last tag; do not guess what a change does from its title alone. Nothing under docs/notes changes in this phase except the facts file."
    },
    {
      "id": "write",
      "title": "Write and check",
      "instructions": "Write for users, not for the team: what changed for them and what they must do. Every claim must trace to an entry in the facts file."
    }
  ],
  "work_packages": [
    {
      "id": "gather.facts",
      "macro": "gather",
      "kind": "execute",
      "title": "List the changes",
      "instructions": "Run `git log --merges $(git describe --tags --abbrev=0)..HEAD` and write docs/notes/facts.md: one line per merged PR as `- #<number> <one-line effect>`, then a `## User-visible` section that repeats only the PRs a user would notice.",
      "checklist": [
        { "id": "facts-exist", "assert": "the facts file has content", "cmd": "test -s docs/notes/facts.md" },
        { "id": "facts-section", "assert": "the facts file has its user-visible section", "cmd": "grep -q '^## User-visible' docs/notes/facts.md" }
      ]
    },
    {
      "id": "write.note",
      "macro": "write",
      "kind": "execute",
      "title": "Write the note",
      "instructions": "Write docs/notes/next.md from the user-visible section of docs/notes/facts.md: a one-paragraph summary, then one bullet per change with its PR number. Do not edit facts.md.",
      "checklist": [
        { "id": "note-exists", "assert": "the note has at least 120 words", "cmd": "test \"$(wc -w < docs/notes/next.md)\" -ge 120" },
        { "id": "note-cites-prs", "assert": "the note cites PR numbers", "cmd": "grep -qE '#[0-9]+' docs/notes/next.md" },
        {
          "id": "note-is-faithful",
          "judge": "Does every bullet in this note match an entry in the facts file, in words a user understands? FAIL if a bullet claims something the facts file does not list, if a user-visible change is missing, or if a bullet uses internal names a user would not know.",
          "context": ["docs/notes/facts.md", "docs/notes/next.md"],
          "blocking": true
        }
      ]
    },
    {
      "id": "write.review",
      "macro": "write",
      "kind": "review",
      "title": "Cold read",
      "instructions": "Read docs/notes/next.md as a user who knows only the previous release. Write docs/notes/review.md: each unclear bullet and how to fix it, then a final line `VERDICT: PASS` or `VERDICT: FAIL`.",
      "checklist": [
        { "id": "review-has-verdict", "assert": "the review ends with a verdict", "cmd": "grep -qE '^VERDICT: (PASS|FAIL)$' docs/notes/review.md" }
      ]
    },
    {
      "id": "write.gate",
      "macro": "write",
      "kind": "gate",
      "title": "Release note gate",
      "instructions": "Only checks run here.",
      "checklist": [
        { "id": "review-passed", "assert": "the cold read passed", "cmd": "grep -q '^VERDICT: PASS$' docs/notes/review.md" },
        { "id": "suite-green", "assert": "the test suite still passes", "cmd": "bun test" }
      ]
    }
  ]
}
```

Why it is shaped this way: each step's `cmd` proves the artifact exists and has its shape, the judge on `write.note`
proves it is faithful, the review step writes a verdict a command can read, and the gate turns that verdict into a hard
stop. The host adds its own acceptance checks to the last step when the workflow runs.

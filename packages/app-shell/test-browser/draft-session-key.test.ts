import { expect, test } from "bun:test"
import { draftSessionKey } from "@/components/prompt-input/draft-session"
import { clearPending, pendingRules, togglePending } from "@/components/draft-subagent-models"
import { ServerScope } from "@/utils/server-scope"

test("draft policy isolates source directory, draft and server; worktree handoff retains the original key", () => {
  const first = draftSessionKey(ServerScope.local, "/repo", "one")
  const worktree = draftSessionKey(ServerScope.local, "/repo/new", "one")
  const second = draftSessionKey(ServerScope.local, "/repo", "two")
  const remote = draftSessionKey("remote" as ServerScope, "/repo", "one")
  togglePending(first, "provider", "selected")
  expect(pendingRules(first)).toEqual([
    { permission: "task", pattern: "*/*", action: "deny" },
    { permission: "task", pattern: "provider/selected", action: "allow" },
  ])
  expect(pendingRules(worktree)).toEqual([])
  expect(pendingRules(second)).toEqual([])
  expect(pendingRules(remote)).toEqual([])
  ;[first, worktree, second, remote].forEach((key) => clearPending(key))
})

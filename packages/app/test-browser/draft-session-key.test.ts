import { expect, test } from "bun:test"
import { draftSessionKey } from "@/components/prompt-input/draft-session"
import { clearPending, pendingRules, togglePending } from "@/components/draft-subagent-models"
import { ServerScope } from "@/utils/server-scope"

test("draft model rules follow worktree selection but never another draft or server", () => {
  const first = draftSessionKey(ServerScope.local, "/repo", "one")
  const worktree = draftSessionKey(ServerScope.local, "/repo/new", "one")
  const second = draftSessionKey(ServerScope.local, "/repo", "two")
  const remote = draftSessionKey("remote" as ServerScope, "/repo", "one")
  togglePending(first, "provider", "selected")
  expect(pendingRules(worktree)).toEqual([
    { permission: "task", pattern: "*/*", action: "deny" },
    { permission: "task", pattern: "provider/selected", action: "allow" },
  ])
  expect(pendingRules(second)).toEqual([])
  expect(pendingRules(remote)).toEqual([])
  ;[first, second, remote].forEach(clearPending)
})

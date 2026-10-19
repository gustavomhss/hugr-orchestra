import { expect, test } from "bun:test"
import { scopeLinuxWorkspace } from "@orchestra/app-dock/app-dock-linux"
import { Permission } from "@/permission"

type PermissionConfig = Parameters<typeof Permission.fromConfig>[0]

// The scope rewrite itself is proven in modules/app-dock/src/app-dock-target.test.ts; this proves how the host's
// permission engine evaluates the rewritten config.
test("the Linux workspace is its own scope: host agents lose its tools, the linux agent holds only them", () => {
  const config: { permission?: unknown; agent?: Record<string, Record<string, unknown>> } = {
    permission: { "*": "allow", dock: "ask" }, agent: { linux: { model: "opencode/mimo" } } }
  scopeLinuxWorkspace(config)
  const tools = ["bash", "read", "edit", "webfetch", "task", "todowrite", "linux_exec", "linux_read", "ui_find", "ui_act", "dock_read",
    "dock_find", "dock_action"]
  const global = Permission.fromConfig(config.permission as PermissionConfig)
  const linux = Permission.merge(global, Permission.fromConfig(config.agent!.linux!.permission as PermissionConfig))
  // dock_find and dock_action only reach native controls, which host agents' browser-scoped calls never do.
  expect([...Permission.disabled(tools, global)].sort()).toEqual(["dock_action", "dock_find", "linux_exec", "linux_read", "ui_act", "ui_find"])
  expect(tools.filter((tool) => !Permission.disabled(tools, linux).has(tool)).sort())
    .toEqual(["linux_exec", "linux_read", "todowrite", "ui_act", "ui_find"])
  // Execution asks under the plugin permission names; the user's own dock rule still applies inside the scope.
  expect(Permission.evaluate("linux", "exec", linux).action).toBe("allow")
  expect(Permission.evaluate("dock", "action", linux).action).toBe("ask")
})

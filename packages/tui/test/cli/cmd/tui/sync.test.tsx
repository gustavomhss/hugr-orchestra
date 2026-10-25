/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { mount, wait } from "./sync-fixture"
import type { GlobalEvent } from "../../../../src/compat/schema"

function branchEvent(branch: string, workspace?: string): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    workspace,
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

describe("tui sync", () => {
  test("refresh lists the subpath by default and the whole project when the filter is disabled", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, kv, sync, session } = await mount(undefined, tmp.path)

    try {
      expect(kv.get("session_directory_filter_enabled", true)).toBe(true)
      expect(session.at(-1)?.searchParams.get("project")).toBe("proj_test")
      expect(session.at(-1)?.searchParams.get("subpath")).toBe("packages/tui")

      kv.set("session_directory_filter_enabled", false)
      await sync.session.refresh()

      expect(session.at(-1)?.searchParams.get("project")).toBe("proj_test")
      expect(session.at(-1)?.searchParams.get("subpath")).toBeNull()
    } finally {
      app.renderer.destroy()
    }
  })

  test("vcs branch updates only apply for the active workspace", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount(undefined, tmp.path)

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      project.workspace.set("ws_a")
      emit(branchEvent("other", "ws_b"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", "ws_a"))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
    }
  })

  test("V2 permission and question events reach the store and their replies clear it", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const event = (id: string, payload: Omit<GlobalEvent["payload"], "id">) =>
      emit({ directory: "/tmp/other", payload: { id, ...payload } as GlobalEvent["payload"] })

    try {
      event("evt_perm_asked", {
        type: "permission.v2.asked",
        properties: {
          id: "per_live",
          sessionID: "ses_live",
          action: "bash",
          resources: ["ls"],
          save: ["ls *"],
          source: { type: "tool", messageID: "msg_live", callID: "call_live" },
        },
      })
      event("evt_que_asked", {
        type: "question.v2.asked",
        properties: {
          id: "que_live",
          sessionID: "ses_live",
          questions: [{ question: "Pick one", header: "One", options: [{ label: "A", description: "a" }] }],
        },
      })
      await wait(() => sync.data.permission["ses_live"]?.length === 1 && sync.data.question["ses_live"]?.length === 1)

      expect(sync.data.permission["ses_live"]?.[0]).toMatchObject({ id: "per_live", action: "bash", resources: ["ls"] })
      expect(sync.data.question["ses_live"]?.[0]?.id).toBe("que_live")

      event("evt_perm_replied", {
        type: "permission.v2.replied",
        properties: { sessionID: "ses_live", requestID: "per_live", reply: "once" },
      })
      event("evt_que_rejected", {
        type: "question.v2.rejected",
        properties: { sessionID: "ses_live", requestID: "que_live" },
      })
      await wait(() => sync.data.permission["ses_live"]?.length === 0 && sync.data.question["ses_live"]?.length === 0)
    } finally {
      app.renderer.destroy()
    }
  })
})

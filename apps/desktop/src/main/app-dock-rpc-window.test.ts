import { expect, test } from "bun:test"
import type { AppDockAPI } from "./app-dock-api"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { AppDockRPC } from "./app-dock-rpc"
import { Window } from "./app-dock-rpc-workspace.fixture"

function setup() {
  const rpc = new AppDockRPC()
  const senders: number[] = []
  rpc.setAppDock({ list: (senderID: number) => { senders.push(senderID); return [] } } as unknown as AppDockAPI)
  const open = (id: number) => {
    const win = new Window(id)
    rpc.setWindow(win as unknown as Parameters<AppDockRPC["setWindow"]>[0])
    return win
  }
  const list = (id: string) => new Promise<unknown>((resolve) => {
    rpc.handleDockRPC({ type: "dock.rpc", id, op: "list", args: {} }, (reply) => {
      if (NativeDockProtocol.object(reply) && reply.type === "dock.rpc.result") resolve(reply)
    })
  })
  return { rpc, senders, open, list }
}

test("the dock stays on its first window while that window is open", async () => {
  const f = setup()
  f.open(1)
  f.open(2)
  expect(await f.list("a")).toMatchObject({ ok: true, value: [] })
  expect(f.senders).toEqual([1])
  await f.rpc.reset()
})

test("the dock moves to another open window when its window closes", async () => {
  const f = setup()
  const first = f.open(1)
  f.open(2)
  f.open(3).destroy()
  first.destroy()
  expect(await f.list("a")).toMatchObject({ ok: true, value: [] })
  expect(f.senders).toEqual([2])
  await f.rpc.reset()
})

test("the dock has no window once every window has closed, and binds the next one opened", async () => {
  const f = setup()
  f.open(1).destroy()
  expect(await f.list("a")).toMatchObject({ ok: false, error: { message: "No window is available for MCP Dock" } })
  f.open(4)
  expect(await f.list("b")).toMatchObject({ ok: true, value: [] })
  expect(f.senders).toEqual([4])
  await f.rpc.reset()
})

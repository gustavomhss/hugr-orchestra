import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createFileTreeStore } from "./tree-store"

test("force during an inflight directory listing fetches the changed snapshot", async () => {
  const first = Promise.withResolvers<Awaited<ReturnType<Parameters<typeof createFileTreeStore>[0]["list"]>>>()
  const calls: string[] = []
  const node = (name: string) => ({
    path: name,
    name,
    absolute: `/repo/${name}`,
    type: "file" as const,
    ignored: false,
  })
  const tree = createRoot(() =>
    createFileTreeStore({
      scope: () => "/repo",
      normalizeDir: (dir) => dir,
      onError: () => {},
      list: async (dir) => {
        calls.push(dir)
        return calls.length === 1 ? first.promise : [node("B")]
      },
    }),
  )
  const initial = tree.listDir("")
  const refresh = tree.listDir("", { force: true })
  first.resolve([node("A")])
  await Promise.all([initial, refresh])
  expect(calls).toEqual(["", ""])
  expect(tree.children("").map((item) => item.name)).toEqual(["B"])
})

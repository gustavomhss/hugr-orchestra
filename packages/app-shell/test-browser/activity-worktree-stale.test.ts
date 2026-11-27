import { expect, test } from "bun:test"
import { bounded, row, setup, snapshot } from "./activity-worktree-fixture"

test("W12 retired same-ID completions cannot settle a replacement row's busy or failed action", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(snapshot("0", { records: [row("a"), row("b"), row("c")] }))
    await bounded(operations[0])
    operations.push(fixture.controller.read("b"), fixture.controller.read("c"), fixture.controller.read("a"))
    const oldB = await fixture.next()
    const oldC = await fixture.next()
    ;(await fixture.next()).respond(snapshot("1", { instanceID: "replacement" }))
    const handshake = await fixture.next()
    operations.push(fixture.controller.refresh())
    handshake.respond(snapshot("0", { instanceID: "replacement", records: [row("a"), row("b"), row("c")] }))
    await bounded(operations[4])
    operations.push(fixture.controller.read("b"), fixture.controller.read("c"))
    const currentB = await fixture.next()
    const currentC = await fixture.next()
    currentC.fail(new Error("current c failed"))
    await bounded(operations[6])
    expect(fixture.controller.state.reads.b).toEqual({ busy: true, failed: false })
    expect(fixture.controller.state.reads.c).toEqual({ busy: false, failed: true })
    expect(fixture.reports).toHaveLength(1)
    oldB.fail(new Error("retired b failed"))
    oldC.respond(snapshot("999"))
    await bounded(Promise.allSettled(operations.slice(0, 5)))
    expect(fixture.controller.state.reads.b).toEqual({ busy: true, failed: false })
    expect(fixture.controller.state.reads.c).toEqual({ busy: false, failed: true })
    expect(fixture.reports).toHaveLength(1)
    currentB.respond(snapshot("1", { instanceID: "replacement", records: [row("b"), row("c")] }))
    await bounded(operations[5])
    expect(fixture.controller.state.reads.b).toEqual({ busy: false, failed: false })
    expect(fixture.controller.state.reads.c).toEqual({ busy: false, failed: true })
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

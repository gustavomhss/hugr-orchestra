import { beforeEach, describe, expect, it, vi } from "vitest"

const taskProposer = { propose: vi.fn() }
const runMine = vi.fn(async () => ({ exitCode: 0, stdout: "task advisory\n" }))
const runMineArms = vi.fn()
const resolveMineSlot = vi.fn(() => "advisory")

vi.mock("../src/mine.js", () => ({ runMine, runMineArms }))
vi.mock("../src/mine-proposer.js", () => ({
  loadTaskProposer: () => taskProposer,
  resolveMineSlot,
  TASK_PROPOSER_IDENTITY: "task-proposals:operator-supplied",
}))

const { dispatchMine } = await import("../src/cli-dispatch.js")

describe("Task proposer mine dispatch", () => {
  beforeEach(() => {
    runMine.mockClear()
    runMineArms.mockClear()
    resolveMineSlot.mockClear()
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  })

  it("runs one advisory pass and reports Task provenance without sound arms", async () => {
    expect(await dispatchMine()).toBe(0)
    expect(runMine).toHaveBeenCalledOnce()
    expect(runMineArms).not.toHaveBeenCalled()
    expect(resolveMineSlot).toHaveBeenCalledWith({})
    expect((runMine.mock.calls as unknown[][])[0]?.[1]).toMatchObject({
      proposer: taskProposer,
      slot: "advisory",
      modelIdentity: "task-proposals:operator-supplied",
    })
  })
})

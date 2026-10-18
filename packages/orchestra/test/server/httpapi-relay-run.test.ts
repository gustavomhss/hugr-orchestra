import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

// External LangGraph runs through the whole V2 server: the contract goldens copied into `<location>/.relay/runs/`,
// read back as the app's Executions screen reads them.
const context = Context.empty() as Context.Context<unknown>
const golden = path.join(import.meta.dir, "..", "..", "..", "..", "modules", "relay", "test", "golden", "external")
const VALID = ["valid/pass", "valid/approval", "valid/escalate"]

type Json = Record<string, any>

async function get(directory: string, route: string) {
  const response = await HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, { headers: { "x-orchestra-directory": directory } }),
    context,
  )
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Json }
}

async function place(folder: string, name: string) {
  await fs.mkdir(folder, { recursive: true })
  await fs.copyFile(path.join(golden, name, "ledger.jsonl"), path.join(folder, "ledger.jsonl"))
}

const runs = (directory: string) => path.join(directory, ".relay", "runs")

async function refused(directory: string, route: string) {
  const result = await get(directory, route)
  expect({ status: result.status, tag: result.body?._tag, code: result.body?.code }).toEqual({
    status: 404,
    tag: "RelayNotFoundError",
    code: "run-missing",
  })
}

async function listed(directory: string) {
  return ((await get(directory, "/api/relay/run")).body.data as Json[]).map((run) => run.runID)
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("external relay runs", () => {
  test("the goldens are listed newest first, rebuilt, audited as self-reported and paged", async () => {
    await using tmp = await tmpdir({ git: true })
    const expected = await Promise.all(
      VALID.map(async (name) => {
        const value = await Bun.file(path.join(golden, name, "expected.json")).json()
        await place(path.join(runs(tmp.path), value.run.runID), name)
        return value.run as Json
      }),
    )
    await place(path.join(runs(tmp.path), "byte-flip"), "mutant/byte-flip")

    const list = (await get(tmp.path, "/api/relay/run")).body.data as Json[]
    expect(list.map((run) => run.runID).toSorted()).toEqual(
      [...expected.map((run) => run.runID), "byte-flip"].toSorted(),
    )
    expect(list.map((run) => run.startedAt)).toEqual(list.map((run) => run.startedAt).toSorted((a, b) => b - a))
    expect(
      ((await get(tmp.path, "/api/relay/run?document=doc_release")).body.data as Json[]).map((run) => run.runID),
    ).toEqual(["thread-approval"])

    for (const run of expected) {
      // Absent optional fields go over the wire as null, which the app reads as absent.
      expect((await get(tmp.path, `/api/relay/run/${run.runID}`)).body.data).toMatchObject(run)
      const audit = (await get(tmp.path, `/api/relay/run/${run.runID}/audit`)).body.data
      expect(audit).toMatchObject({ status: "pending", code: "external-self-reported" })
      expect(audit.rows[0]).toEqual({ label: "Chain", value: "chain intact, self-reported" })
    }
    const broken = (await get(tmp.path, "/api/relay/run/byte-flip/audit")).body.data
    expect(broken).toMatchObject({ status: "fail", code: "ledger-broken" })
    expect(broken.rows[0].value).toMatch(/^TAMPERED line 3:/)

    const seqs = async (query: string) =>
      ((await get(tmp.path, `/api/relay/run/thread-pass/ledger${query}`)).body.data as Json[]).map((entry) => entry.seq)
    expect(await seqs("")).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(await seqs("?after=0")).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(await seqs("?after=5")).toEqual([5, 6, 7])
  })

  test("an ID that does not match RUN_ID is refused", async () => {
    await using tmp = await tmpdir({ git: true })
    await place(path.join(runs(tmp.path), "bad.id"), "valid/pass")
    await refused(tmp.path, "/api/relay/run/bad.id")
    expect(await listed(tmp.path)).toEqual([])
  })

  test("a .. traversal out of the runs folder is refused", async () => {
    await using tmp = await tmpdir({ git: true })
    await place(path.join(tmp.path, ".relay", "outside"), "valid/pass")
    await refused(tmp.path, "/api/relay/run/..%2Foutside")
    await refused(tmp.path, "/api/relay/run/..%2Foutside/audit")
  })

  test("a symlinked run folder is refused", async () => {
    await using tmp = await tmpdir({ git: true })
    await place(path.join(tmp.path, "elsewhere"), "valid/pass")
    await fs.mkdir(runs(tmp.path), { recursive: true })
    await fs.symlink(path.join(tmp.path, "elsewhere"), path.join(runs(tmp.path), "linked"))
    await refused(tmp.path, "/api/relay/run/linked")
    await refused(tmp.path, "/api/relay/run/linked/audit")
    expect(await listed(tmp.path)).toEqual([])
  })
})

import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function read(file: string, directory: string) {
  const headers = new Headers({ "x-orchestra-directory": directory })
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost/api/fs/read?path=${encodeURIComponent(file)}`, { headers }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 fs.read HttpApi", () => {
  test("serves a file and answers the declared 400 for a path it cannot serve", async () => {
    await using tmp = await tmpdir({ git: true })
    await fs.writeFile(path.join(tmp.path, "hello.txt"), "hello")
    await fs.mkdir(path.join(tmp.path, "folder"))

    const served = await read("hello.txt", tmp.path)
    expect(served.status).toBe(200)
    expect(await served.text()).toBe("hello")

    for (const [file, kind] of [
      ["missing.txt", "file_not_found"],
      ["../outside.txt", "path_outside_location"],
      ["folder", "not_a_file"],
    ]) {
      const refused = await read(file, tmp.path)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ _tag: "InvalidRequestError", kind, field: "path" })
    }
  })
})

import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { closestBase } from "../../../script/test-ci-upload"

const repos: string[] = []

afterEach(async () => {
  await Promise.all(repos.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// A pushed branch `feature` that started at tag `start`, and a `dev` that has since added five files.
async function repo() {
  const cwd = await mkdtemp(path.join(tmpdir(), "test-ci-"))
  repos.push(cwd)
  const commit = async (files: string[]) => {
    await Promise.all(files.map((file) => Bun.write(path.join(cwd, file), file)))
    await $`git add -A`.cwd(cwd).quiet()
    await $`git commit -q -m ${files.join(" ")}`.cwd(cwd).quiet()
  }
  await $`git init -q --initial-branch=dev`.cwd(cwd).quiet()
  await $`git config user.email test@example.com`.cwd(cwd).quiet()
  await $`git config user.name test-ci`.cwd(cwd).quiet()
  await commit(["readme.md"])
  await $`git tag start`.cwd(cwd).quiet()
  await $`git checkout -q -b feature`.cwd(cwd).quiet()
  await commit(["feature.ts"])
  await $`git update-ref refs/remotes/fork/feature HEAD`.cwd(cwd).quiet()
  await $`git checkout -q dev`.cwd(cwd).quiet()
  await commit(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"])
  await $`git update-ref refs/remotes/fork/dev HEAD`.cwd(cwd).quiet()
  await $`git checkout -q feature`.cwd(cwd).quiet()
  return cwd
}

const rev = async (cwd: string, name: string) => (await $`git rev-parse ${name}`.cwd(cwd).text()).trim()

describe("test:ci base", () => {
  test("uploads on top of the pushed branch until dev is merged into it, then on top of dev", async () => {
    const cwd = await repo()
    const refs = ["fork/feature", "fork/dev"]
    expect(await closestBase(cwd, refs, await rev(cwd, "HEAD^{tree}"))).toBe(await rev(cwd, "fork/feature"))

    await $`git merge -q --no-edit dev`.cwd(cwd).quiet()
    expect(await closestBase(cwd, refs, await rev(cwd, "HEAD^{tree}"))).toBe(await rev(cwd, "fork/dev"))
  })

  test("skips refs GitHub does not have", async () => {
    const cwd = await repo()
    const tree = await rev(cwd, "HEAD^{tree}")
    expect(await closestBase(cwd, ["fork/missing", "fork/dev"], tree)).toBe(await rev(cwd, "start"))
    expect(await closestBase(cwd, ["fork/missing"], tree)).toBeUndefined()
  })
})

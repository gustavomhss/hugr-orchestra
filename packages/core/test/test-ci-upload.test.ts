import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { closestBase, parseResponse, rateLimitDelay, testPaths } from "../../../script/test-ci-upload"

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

// What `gh api --include` prints: the status line, CRLF-terminated headers, a blank line, then the body.
const output = (status: string, headers: Record<string, string>, body: string) =>
  `HTTP/2.0 ${status}\n${Object.entries({ "Content-Type": "application/json; charset=utf-8", ...headers })
    .map((entry) => `${entry[0]}: ${entry[1]}\r\n`)
    .join("")}\r\n${body}`

const secondary = JSON.stringify({ message: "You have exceeded a secondary rate limit. Please wait a few minutes." })

describe("test:ci rate limit", () => {
  test("reads the status, headers and body gh prints", () => {
    const response = parseResponse(output("201 Created", { "X-Ratelimit-Remaining": "4999" }, '{"sha":"abc"}'))
    expect(response.status).toBe(201)
    expect(response.headers.get("x-ratelimit-remaining")).toBe("4999")
    expect(JSON.parse(response.body)).toEqual({ sha: "abc" })
    expect(parseResponse(output("204 No Content", {}, "")).body).toBe("")
    expect(parseResponse("").status).toBe(0)
  })

  test("honours Retry-After", () => {
    expect(rateLimitDelay(parseResponse(output("403 Forbidden", { "Retry-After": "60" }, secondary)), 0)).toBe(60_000)
    expect(rateLimitDelay(parseResponse(output("429 Too Many Requests", { "Retry-After": "5" }, "{}")), 3)).toBe(5_000)
  })

  test("waits for the reset when no requests remain", () => {
    const response = output(
      "429 Too Many Requests",
      { "X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": "1030" },
      "{}",
    )
    expect(rateLimitDelay(parseResponse(response), 0, 1_000_000)).toBe(30_000)
  })

  test("backs off from a minute when GitHub gives no hint", () => {
    const response = parseResponse(output("403 Forbidden", {}, secondary))
    expect([0, 1, 2].map((attempt) => rateLimitDelay(response, attempt))).toEqual([60_000, 120_000, 240_000])
  })

  test("does not retry other failures", () => {
    const forbidden = JSON.stringify({ message: "Resource not accessible by integration" })
    expect(
      rateLimitDelay(parseResponse(output("403 Forbidden", { "Retry-After": "60" }, forbidden)), 0),
    ).toBeUndefined()
    expect(rateLimitDelay(parseResponse(output("422 Unprocessable Entity", {}, "{}")), 0)).toBeUndefined()
    expect(rateLimitDelay(parseResponse(""), 0)).toBeUndefined()
  })
})

// The files of packages/opencode the tests below pretend exist; test/cli is a directory.
const files = new Set(["a.test.ts", "test/cli/run/permission.shared.test.ts", "test/cli/tui/editor-context.test.tsx"])
const isFile = (file: string) => files.has(file)

describe("test:ci test paths", () => {
  test("passes an existing file as ./<file>, nested or not", () => {
    expect(testPaths("opencode", ["a.test.ts", "test/cli/run/permission.shared.test.ts"], isFile)).toEqual([
      "./a.test.ts",
      "./test/cli/run/permission.shared.test.ts",
    ])
  })

  test("keeps the caller's order", () => {
    expect(
      testPaths(
        "opencode",
        ["test/cli/tui/editor-context.test.tsx", "test/cli/run/permission.shared.test.ts", "a.test.ts"],
        isFile,
      ),
    ).toEqual(["./test/cli/tui/editor-context.test.tsx", "./test/cli/run/permission.shared.test.ts", "./a.test.ts"])
  })

  test("keeps paths that are already explicit", () => {
    expect(testPaths("opencode", ["./a.test.ts", "./missing.test.ts", "/abs/a.test.ts"], isFile)).toEqual([
      "./a.test.ts",
      "./missing.test.ts",
      "/abs/a.test.ts",
    ])
  })

  test("accepts paths from the repository root and with Windows separators", () => {
    expect(
      testPaths(
        "opencode",
        [
          "packages/opencode/a.test.ts",
          "./packages/opencode/test/cli/run/permission.shared.test.ts",
          "test\\cli\\tui\\editor-context.test.tsx",
          "packages\\opencode\\a.test.ts",
          ".\\a.test.ts",
        ],
        isFile,
      ),
    ).toEqual([
      "./a.test.ts",
      "./test/cli/run/permission.shared.test.ts",
      "./test/cli/tui/editor-context.test.tsx",
      "./a.test.ts",
      "./a.test.ts",
    ])
  })

  test("passes directories and filters through unchanged", () => {
    expect(
      testPaths("opencode", ["test/cli", "permission", "packages/opencode/test/cli", "*.test.ts", "--bail"], isFile),
    ).toEqual(["test/cli", "permission", "test/cli", "*.test.ts", "--bail"])
  })
})

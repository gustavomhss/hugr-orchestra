import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { PullRequest } from "@orchestra/core/pull-request"
import { git } from "./fixture/git"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// The host CLIs are fake executables on a PATH that holds nothing else: a POSIX shell shim, or a .cmd shim
// on Windows, that runs a script recording its argv, stdin and cwd and answering with a canned reply.
const it = testEffect(LayerNode.compile(AppProcess.node))

type Reply = { stdout?: string; stderr?: string; code?: number }
type Call = { argv: string[]; stdin: string; cwd: string }

// What gh api graphql prints for the open pull request query.
const pulls = {
  data: {
    repository: {
      pullRequests: {
        totalCount: 2,
        nodes: [
          {
            number: 12,
            title: "Add approval flow",
            url: "https://github.com/acme/widgets/pull/12",
            state: "OPEN",
            author: { login: "ada" },
          },
          {
            number: 9,
            title: "Ghost author",
            url: "https://github.com/acme/widgets/pull/9",
            state: "OPEN",
            author: null,
          },
        ],
      },
    },
  },
}

describe("PullRequest", () => {
  it.live(
    "lists open GitHub pull requests through one fixed gh api call for every remote URL form",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const gh = yield* fake(fixture.bin, "gh", { stdout: JSON.stringify(pulls) })
          const directory = yield* repository(fixture.root, [["origin", "git@github.com:acme/widgets.git"]])
          const service = yield* PullRequest.make({ directory, env: env(fixture.bin) })
          for (const url of [
            "git@github.com:acme/widgets.git",
            "https://github.com/acme/widgets",
            "https://token@github.com/acme/widgets.git",
            "ssh://git@ssh.github.com:443/acme/widgets.git",
          ]) {
            yield* run(directory, "remote", "set-url", "origin", url)
            expect(yield* service.list()).toEqual({
              host: "github",
              repository: "acme/widgets",
              count: 2,
              truncated: false,
              items: [
                {
                  number: 12,
                  title: "Add approval flow",
                  url: "https://github.com/acme/widgets/pull/12",
                  state: "OPEN",
                  author: "ada",
                },
                {
                  number: 9,
                  title: "Ghost author",
                  url: "https://github.com/acme/widgets/pull/9",
                  state: "OPEN",
                  author: null,
                },
              ],
            })
          }
          const calls = yield* gh.calls()
          expect(calls).toHaveLength(4)
          for (const call of calls) {
            // The query is a constant; the repository travels as GraphQL variables.
            expect(call.argv.slice(0, 5)).toEqual(["api", "graphql", "--hostname", "github.com", "-f"])
            expect(call.argv[5]).toStartWith("query=query($owner: String!, $name: String!) { repository(")
            expect(call.argv[5]).toContain("pullRequests(states: OPEN, first: 100,")
            expect(call.argv.slice(6)).toEqual(["-f", "owner=acme", "-f", "name=widgets"])
            expect(call.stdin).toBe("")
            expect(yield* real(call.cwd)).toBe(yield* real(directory))
          }
        }),
      ),
    30_000,
  )

  it.live(
    "lists GitLab merge requests of the origin remote ahead of other remotes with the exact open total",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const nodes = Array.from({ length: 100 }, (_, index) => ({
            iid: String(index + 1),
            title: `Merge ${index + 1}`,
            webUrl: `https://gitlab.com/acme/platform/widgets/-/merge_requests/${index + 1}`,
            state: "opened",
            author: { username: "grace" },
          }))
          const glab = yield* fake(fixture.bin, "glab", {
            stdout: JSON.stringify({ data: { project: { mergeRequests: { count: 240, nodes } } } }),
          })
          const directory = yield* repository(fixture.root, [
            ["upstream", "https://github.com/acme/widgets.git"],
            ["origin", "git@gitlab.com:acme/platform/widgets.git"],
          ])
          const listed = yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).list()
          expect(listed.host).toBe("gitlab")
          expect(listed.repository).toBe("acme/platform/widgets")
          // The total comes from the host; the list holds only the newest page of it.
          expect(listed.count).toBe(240)
          expect(listed.truncated).toBe(true)
          expect(listed.items).toHaveLength(100)
          expect(listed.items[0]).toEqual({
            number: 1,
            title: "Merge 1",
            url: "https://gitlab.com/acme/platform/widgets/-/merge_requests/1",
            state: "opened",
            author: "grace",
          })
          const calls = yield* glab.calls()
          expect(calls).toHaveLength(1)
          expect(calls[0]!.argv.slice(0, 5)).toEqual(["api", "graphql", "--hostname", "gitlab.com", "-f"])
          expect(calls[0]!.argv[5]).toStartWith("query=query($path: ID!) { project(fullPath: $path) {")
          expect(calls[0]!.argv.slice(6)).toEqual(["-f", "path=acme/platform/widgets"])
        }),
      ),
    30_000,
  )

  it.live(
    "creates a pull request with title, body and branches only in the JSON on stdin, never in argv or a shell",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const gh = yield* fake(fixture.bin, "gh", {
            stdout: JSON.stringify({ number: 31, html_url: "https://github.com/acme/widgets/pull/31", state: "open" }),
          })
          const directory = yield* repository(fixture.root, [["origin", "https://github.com/acme/widgets.git"]])
          yield* run(directory, "update-ref", "refs/remotes/origin/feature", "HEAD")
          const title = `Fix "quotes" & $(touch pwned) ; \`touch pwned\` | touch pwned %PATH% !x! ^ > pwned`
          const body = `Summary\n- line "two" && touch pwned\n\n$HOME %USERPROFILE% \`id\` > pwned\n`
          const created = yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).create({
            title,
            body,
            base: "main",
          })
          expect(created).toEqual({
            host: "github",
            repository: "acme/widgets",
            number: 31,
            url: "https://github.com/acme/widgets/pull/31",
          })
          const calls = yield* gh.calls()
          expect(calls.map((call) => call.argv)).toEqual([
            [
              "api",
              "--hostname",
              "github.com",
              "--method",
              "POST",
              "repos/acme/widgets/pulls",
              "--header",
              "Content-Type: application/json",
              "--input",
              "-",
            ],
          ])
          expect(JSON.parse(calls[0]!.stdin)).toEqual({ title, body, head: "feature", base: "main" })
          expect(yield* exists(path.join(directory, "pwned"))).toBe(false)
          expect(yield* exists(path.join(fixture.bin, "pwned"))).toBe(false)
        }),
      ),
    30_000,
  )

  it.live(
    "creates a GitLab merge request from an explicit pushed branch with GitLab field names",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const glab = yield* fake(fixture.bin, "glab", {
            stdout: JSON.stringify({ iid: 5, web_url: "https://gitlab.com/acme/widgets/-/merge_requests/5" }),
          })
          const directory = yield* repository(fixture.root, [["origin", "https://gitlab.com/acme/widgets.git"]])
          yield* run(directory, "update-ref", "refs/remotes/origin/docs", "HEAD")
          const created = yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).create({
            title: "Docs",
            body: "",
            base: "main",
            head: "docs",
          })
          expect(created).toEqual({
            host: "gitlab",
            repository: "acme/widgets",
            number: 5,
            url: "https://gitlab.com/acme/widgets/-/merge_requests/5",
          })
          const calls = yield* glab.calls()
          expect(calls[0]!.argv).toEqual([
            "api",
            "--hostname",
            "gitlab.com",
            "--method",
            "POST",
            "projects/acme%2Fwidgets/merge_requests",
            "--header",
            "Content-Type: application/json",
            "--input",
            "-",
          ])
          expect(JSON.parse(calls[0]!.stdin)).toEqual({
            title: "Docs",
            description: "",
            source_branch: "docs",
            target_branch: "main",
          })
        }),
      ),
    30_000,
  )

  it.live(
    "reports a CLI that is not installed without running anything",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const directory = yield* repository(fixture.root, [["origin", "https://gitlab.com/acme/widgets.git"]])
          const error = yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).list().pipe(Effect.flip)
          expect(error).toMatchObject({ kind: "not_installed", host: "gitlab", remote: "origin" })
          expect(error.message).toBe("glab is not installed on this server")
        }),
      ),
    30_000,
  )

  it.live(
    "reports a CLI without a sign-in: gh exit code 4, an HTTP 401 and an invalid GitLab token",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          yield* fake(fixture.bin, "gh", {
            code: 4,
            stderr: "To get started with GitHub CLI, please run:  gh auth login\n",
          })
          yield* fake(fixture.bin, "glab", {
            code: 1,
            stdout: JSON.stringify({ message: "401 Unauthorized" }),
            stderr: "glab: 401 Unauthorized (HTTP 401)\n",
          })
          const github = yield* repository(fixture.root, [["origin", "https://github.com/acme/widgets.git"]], "github")
          const gitlab = yield* repository(fixture.root, [["origin", "https://gitlab.com/acme/widgets.git"]], "gitlab")
          const signedOut = yield* (yield* PullRequest.make({ directory: github, env: env(fixture.bin) }))
            .list()
            .pipe(Effect.flip)
          expect(signedOut).toMatchObject({ kind: "not_authenticated", host: "github" })
          expect(signedOut.message).toBe(
            "gh is not signed in on this server: To get started with GitHub CLI, please run:  gh auth login",
          )
          const rejected = yield* (yield* PullRequest.make({ directory: gitlab, env: env(fixture.bin) }))
            .list()
            .pipe(Effect.flip)
          expect(rejected).toMatchObject({ kind: "not_authenticated", host: "gitlab" })
          expect(rejected.message).toBe("glab is not signed in on this server: 401 Unauthorized")
          yield* fake(fixture.bin, "glab", {
            code: 1,
            stdout: JSON.stringify({ errors: [{ message: "Invalid token" }] }),
            stderr: "glab: Invalid token\n",
          })
          expect(
            yield* (yield* PullRequest.make({ directory: gitlab, env: env(fixture.bin) })).list().pipe(Effect.flip),
          ).toMatchObject({ kind: "not_authenticated", message: "glab is not signed in on this server: Invalid token" })
        }),
      ),
    30_000,
  )

  it.live(
    "reports no matching remote for other hosts, look-alike hosts and directories outside git",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const gh = yield* fake(fixture.bin, "gh", { stdout: "[]" })
          const directory = yield* repository(fixture.root, [
            ["origin", "https://github.com.evil.example/acme/widgets.git"],
            ["mirror", "https://gitlab.example.com/acme/widgets.git"],
            ["nested", "https://github.com/acme/widgets/extra.git"],
          ])
          const error = yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).list().pipe(Effect.flip)
          expect(error).toMatchObject({
            kind: "no_remote",
            message: "This repository has no github.com or gitlab.com remote",
          })
          const outside = path.join(fixture.root, "plain")
          yield* Effect.promise(() => fs.mkdir(outside))
          const missing = yield* (yield* PullRequest.make({ directory: outside, env: env(fixture.bin) }))
            .create({ title: "T", body: "", base: "main" })
            .pipe(Effect.flip)
          expect(missing).toMatchObject({ kind: "no_remote", message: "This directory is not a git repository" })
          expect(yield* gh.calls()).toEqual([])
        }),
      ),
    30_000,
  )

  it.live(
    "reports a branch that is not pushed, has unpushed commits, or is not a branch, before running the CLI",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const gh = yield* fake(fixture.bin, "gh", { stdout: "{}" })
          const directory = yield* repository(fixture.root, [["origin", "https://github.com/acme/widgets.git"]])
          const service = yield* PullRequest.make({ directory, env: env(fixture.bin) })
          const input = { title: "T", body: "", base: "main" }
          expect(yield* service.create(input).pipe(Effect.flip)).toMatchObject({
            kind: "branch_not_pushed",
            branch: "feature",
            remote: "origin",
            message: "feature is not pushed to origin",
          })
          yield* run(directory, "update-ref", "refs/remotes/origin/feature", "HEAD")
          yield* commit(directory, "two\n")
          expect(yield* service.create(input).pipe(Effect.flip)).toMatchObject({
            kind: "branch_not_pushed",
            message: "feature has commits that are not pushed to origin",
          })
          yield* run(directory, "checkout", "--detach", "HEAD")
          expect(yield* service.create(input).pipe(Effect.flip)).toMatchObject({
            kind: "branch_not_pushed",
            message: "HEAD is not on a branch",
          })
          expect(yield* gh.calls()).toEqual([])
        }),
      ),
    30_000,
  )

  it.live(
    "reports CLI failures with the host's own message and never succeeds without the returned address",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const directory = yield* repository(fixture.root, [["origin", "https://github.com/acme/widgets.git"]])
          yield* run(directory, "update-ref", "refs/remotes/origin/feature", "HEAD")
          const input = { title: "T", body: "", base: "main" }
          const attempt = (reply: Reply) =>
            Effect.gen(function* () {
              yield* fake(fixture.bin, "gh", reply)
              return yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) }))
                .create(input)
                .pipe(Effect.flip)
            })
          expect(
            yield* attempt({
              code: 1,
              stdout: JSON.stringify({
                message: "Validation Failed",
                errors: [
                  {
                    resource: "PullRequest",
                    code: "custom",
                    message: "A pull request already exists for acme:feature.",
                  },
                ],
              }),
              stderr: "gh: Validation Failed (HTTP 422)\n",
            }),
          ).toMatchObject({
            kind: "cli_failed",
            host: "github",
            message: "gh failed: Validation Failed: A pull request already exists for acme:feature.",
          })
          expect(yield* attempt({ code: 2, stderr: "\nunexpected flag\nusage: gh api" })).toMatchObject({
            kind: "cli_failed",
            message: "gh failed: unexpected flag",
          })
          expect(yield* attempt({ stdout: JSON.stringify({ number: 31 }) })).toMatchObject({
            kind: "cli_failed",
            message: "gh did not return the pull request's address",
          })
          expect(
            yield* attempt({ stdout: JSON.stringify({ number: 31, html_url: "javascript:alert(1)" }) }),
          ).toMatchObject({ kind: "cli_failed", message: "gh did not return the pull request's address" })
          expect(yield* attempt({ stdout: "not json" })).toMatchObject({ kind: "cli_failed" })
          const listing = (reply: Reply) =>
            Effect.gen(function* () {
              yield* fake(fixture.bin, "gh", reply)
              return yield* (yield* PullRequest.make({ directory, env: env(fixture.bin) })).list().pipe(Effect.flip)
            })
          const missing = "Could not resolve to a Repository with the name 'acme/widgets'."
          expect(
            yield* listing({
              code: 1,
              stdout: JSON.stringify({ data: { repository: null }, errors: [{ type: "NOT_FOUND", message: missing }] }),
              stderr: `gh: ${missing}\n`,
            }),
          ).toMatchObject({ kind: "cli_failed", message: `gh failed: ${missing}` })
          expect(yield* listing({ stdout: JSON.stringify({ data: { repository: null } }) })).toMatchObject({
            kind: "cli_failed",
            message: "gh did not return a pull request list",
          })
        }),
      ),
    30_000,
  )
})

function withFixture<A, E, R>(body: (fixture: { root: string; bin: string }) => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
      const tmp = await tmpdir()
      const bin = path.join(tmp.path, "bin")
      await fs.mkdir(bin)
      return { tmp, fixture: { root: tmp.path, bin } }
    }),
    (input) => body(input.fixture),
    (input) => Effect.promise(() => input.tmp[Symbol.asyncDispose]()),
  )
}

function env(bin: string): NodeJS.ProcessEnv {
  return { PATH: bin, PATHEXT: process.env.PATHEXT ?? process.env.PathExt }
}

function fake(bin: string, name: "gh" | "glab", reply: Reply) {
  return Effect.promise(async () => {
    const script = path.join(bin, `${name}.js`)
    const log = path.join(bin, `${name}.log`)
    await fs.writeFile(
      script,
      [
        `import fs from "node:fs"`,
        `const stdin = await Bun.stdin.text()`,
        `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }) + "\\n")`,
        `process.stdout.write(${JSON.stringify(reply.stdout ?? "")})`,
        `process.stderr.write(${JSON.stringify(reply.stderr ?? "")})`,
        `process.exitCode = ${reply.code ?? 0}`,
      ].join("\n"),
    )
    if (process.platform === "win32")
      await fs.writeFile(
        path.join(bin, `${name}.cmd`),
        `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      )
    if (process.platform !== "win32") {
      await fs.writeFile(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
      await fs.chmod(path.join(bin, name), 0o755)
    }
    return {
      calls: () =>
        Effect.promise(async () =>
          (await fs.readFile(log, "utf8").catch(() => ""))
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Call),
        ),
    }
  })
}

function repository(root: string, remotes: [string, string][], name = "repo") {
  return Effect.promise(async () => {
    const directory = path.join(root, name)
    await fs.mkdir(directory)
    await git(directory, "-c", "init.defaultBranch=main", "init")
    await git(directory, "config", "user.email", "test@example.com")
    await git(directory, "config", "user.name", "Test")
    await git(directory, "config", "commit.gpgsign", "false")
    await fs.writeFile(path.join(directory, "README.md"), "one\n")
    await git(directory, "add", "README.md")
    await git(directory, "commit", "-m", "initial")
    await git(directory, "checkout", "-b", "feature")
    for (const [remote, url] of remotes) await git(directory, "remote", "add", remote, url)
    return directory
  })
}

function commit(directory: string, content: string) {
  return Effect.promise(async () => {
    await fs.writeFile(path.join(directory, "README.md"), content)
    await git(directory, "commit", "-am", "next")
  })
}

function run(directory: string, ...args: string[]) {
  return Effect.promise(() => git(directory, ...args))
}

function exists(file: string) {
  return Effect.promise(() =>
    fs.stat(file).then(
      () => true,
      () => false,
    ),
  )
}

function real(directory: string) {
  return Effect.promise(() => fs.realpath(directory))
}

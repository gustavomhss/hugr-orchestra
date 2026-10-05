import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import {
  decodeStoredPipelines,
  loadWorkflows,
  PIPEFAIL_WARNING,
  pipelineScript,
  plainLog,
  posixShell,
  tailLog,
  workflowFailure,
  workflowFiles,
} from "./cicd-data"

const entry = (path: string, type: "file" | "directory" = "file") => ({ path, type })

describe("workflow inventory", () => {
  test("includes only direct yml and yaml files, sorted by path", () => {
    expect(
      workflowFiles([
        entry(".github/workflows/test.yaml"),
        entry(".github/workflows/build.yml"),
        entry(".github/workflows/.yaml"),
        entry(".github/workflows/literal\\name.yml"),
        entry(".github/workflows/readme.md"),
        entry(".github/workflows/nested.yml", "directory"),
        entry(".github/workflows/nested/hidden.yml"),
        entry("elsewhere/other.yml"),
        entry(".github/workflows/backup.yml.bak"),
        entry(".github/workflows/invalid.yml\n"),
      ]),
    ).toEqual([
      ".github/workflows/.yaml",
      ".github/workflows/build.yml",
      ".github/workflows/literal\\name.yml",
      ".github/workflows/test.yaml",
    ])
  })

  test("missing .github is empty without reading a missing directory", async () => {
    const paths: string[] = []
    expect(
      await loadWorkflows(async (path) => {
        paths.push(path)
        return []
      }),
    ).toEqual({ status: "empty", paths: [] })
    expect(paths).toEqual([""])
  })

  test("missing workflows directory is empty", async () => {
    const paths: string[] = []
    expect(
      await loadWorkflows(async (path) => {
        paths.push(path)
        return path === "" ? [entry(".github", "directory")] : []
      }),
    ).toEqual({ status: "empty", paths: [] })
    expect(paths).toEqual(["", ".github"])
  })

  test("loads the workflow directory relative to the profile", async () => {
    const paths: string[] = []
    expect(
      await loadWorkflows(async (path) => {
        paths.push(path)
        if (path === "") return [entry(".github/", "directory")]
        if (path === ".github") return [entry(".github/workflows/", "directory")]
        return [entry(".github/workflows/ci.yml")]
      }),
    ).toEqual({ status: "ready", paths: [".github/workflows/ci.yml"] })
    expect(paths).toEqual(["", ".github", ".github/workflows"])
  })

  test("existing directory without YAML files is empty", async () => {
    expect(
      await loadWorkflows(async (path) => {
        if (path === "") return [entry(".github/", "directory")]
        if (path === ".github") return [entry(".github/workflows/", "directory")]
        return [entry(".github/workflows/readme.md")]
      }),
    ).toEqual({ status: "empty", paths: [] })
  })

  test("normalizes Windows filesystem entries to readable relative workflow paths", async () => {
    expect(
      await loadWorkflows(async (path) => {
        if (path === "") return [entry(".github\\", "directory")]
        if (path === ".github") return [entry(".github\\workflows\\", "directory")]
        return [entry(".github\\workflows\\ci.yml"), entry(".github\\workflows\\nested\\hidden.yml")]
      }),
    ).toEqual({ status: "ready", paths: [".github/workflows/ci.yml"] })
  })

  test("detects a root GitLab CI file before GitHub workflows", async () => {
    const paths: string[] = []
    expect(
      await loadWorkflows(async (path) => {
        paths.push(path)
        if (path === "") return [entry(".gitlab-ci.yml"), entry(".github", "directory")]
        if (path === ".github") return [entry(".github/workflows", "directory")]
        return [entry(".github/workflows/test.yml")]
      }),
    ).toEqual({ status: "ready", paths: [".gitlab-ci.yml", ".github/workflows/test.yml"] })
    expect(paths).toEqual(["", ".github", ".github/workflows"])
  })

  test("GitLab CI alone is ready without listing .github; lookalikes are ignored", async () => {
    const paths: string[] = []
    expect(
      await loadWorkflows(async (path) => {
        paths.push(path)
        return [
          entry(".gitlab-ci.yml"),
          entry(".gitlab-ci.yaml"),
          entry("ci/.gitlab-ci.yml"),
          entry(".gitlab-ci.yml.bak"),
        ]
      }),
    ).toEqual({ status: "ready", paths: [".gitlab-ci.yml"] })
    expect(paths).toEqual([""])
    expect(await loadWorkflows(async () => [entry(".gitlab-ci.yml", "directory")])).toEqual({
      status: "empty",
      paths: [],
    })
    expect(await loadWorkflows(async () => [entry("ci/.gitlab-ci.yml"), entry("my.gitlab-ci.yml")])).toEqual({
      status: "empty",
      paths: [],
    })
  })

  test("a failing .github listing is an error even when GitLab CI exists", async () => {
    expect(
      await loadWorkflows(async (path) => {
        if (path === "") return [entry(".gitlab-ci.yml"), entry(".github", "directory")]
        throw new Error("UnexpectedStatus", { cause: { status: 500 } })
      }),
    ).toEqual({ status: "error", paths: [] })
  })

  test("request failure is an error, never an empty inventory", async () => {
    expect(
      await loadWorkflows(async () => {
        throw new Error("Network failure")
      }),
    ).toEqual({ status: "error", paths: [] })
  })

  test("missing API route is unavailable", async () => {
    expect(
      await loadWorkflows(async () => {
        throw new Error("UnexpectedStatus", { cause: { status: 404 } })
      }),
    ).toEqual({ status: "unavailable", paths: [] })
  })

  test("unsupported HTTP APIs are unavailable; auth and server failures are errors", () => {
    expect(workflowFailure({ status: 405 })).toBe("unavailable")
    expect(workflowFailure({ status: 501 })).toBe("unavailable")
    expect(workflowFailure({ status: 403 })).toBe("error")
    expect(workflowFailure({ status: 500 })).toBe("error")
  })
})

// Production pins /bin/sh; dash is checked too where present because it lacks pipefail.
const shells = ["/bin/sh", "/bin/dash", "/bin/bash"].filter((shell) => Bun.spawnSync([shell, "-c", ":"]).exitCode === 0)
const pipefail = (shell: string) => Bun.spawnSync([shell, "-c", "set -o pipefail"]).exitCode === 0

async function execute(shell: string, command: string) {
  const proc = Bun.spawn([shell, "-c", pipelineScript(command)], {
    stdin: new TextEncoder().encode("\n"),
    stdout: "pipe",
    stderr: "pipe",
    cwd: "/",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, code }
}

describe("pipeline script", () => {
  test("finds at least the production shell", () => {
    expect(shells).toContain("/bin/sh")
  })

  for (const shell of shells) {
    describe(shell, () => {
      test("a failed && list stops the run before the next line", async () => {
        const result = await execute(shell, "echo first\nfalse && echo skipped\necho after")
        expect(result.code).not.toBe(0)
        expect(result.stdout).toBe("first\n")
      })

      test("a failure earlier on the same line stops the run", async () => {
        const result = await execute(shell, "false; echo same-line\necho after")
        expect(result.code).not.toBe(0)
        expect(result.stdout).toBe("")
      })

      test("a failure inside a pipeline stops the run, or the shell says it cannot detect it", async () => {
        const result = await execute(shell, "false | cat\necho after")
        if (pipefail(shell)) {
          expect(result.code).not.toBe(0)
          expect(result.stdout).toBe("")
          return
        }
        expect(result.stdout).toBe(`${PIPEFAIL_WARNING}\nafter\n`)
      })

      test("the exit status of the failing command is the run's status", async () => {
        const result = await execute(shell, "echo before\nexit 3\necho after")
        expect(result).toMatchObject({ code: 3, stdout: "before\n" })
      })

      test("lines share one shell: directory, variables and exports carry over", async () => {
        const result = await execute(shell, "cd /usr\nNAME=value\nexport OTHER=exported\npwd\necho $NAME $OTHER")
        expect(result).toMatchObject({ code: 0, stdout: "/usr\nvalue exported\n" })
      })

      test("CRLF input, blank lines, quotes and continuations run as written", async () => {
        const result = await execute(
          shell,
          'echo one\r\n\r\necho "it\'s" \'quoted "twice"\'\r\necho a &&\r\n  echo b\necho c \\\n  d\necho x |\n  tr x y\n',
        )
        const warning = pipefail(shell) ? "" : `${PIPEFAIL_WARNING}\n`
        expect(result).toMatchObject({ code: 0, stdout: `${warning}one\nit's quoted "twice"\na\nb\nc d\ny\n` })
      })

      test("a construct split across lines fails visibly instead of passing", async () => {
        const result = await execute(shell, "if true; then\n  echo inside\nfi\necho after")
        expect(result.code).not.toBe(0)
        expect(result.stdout).not.toContain("after")
        expect(result.stderr).not.toBe("")
      })

      test("the run waits for the start gate before producing output", async () => {
        const proc = Bun.spawn([shell, "-c", pipelineScript("echo started")], { stdin: "pipe", stdout: "pipe" })
        await Bun.sleep(150)
        expect(proc.exitCode).toBeNull()
        proc.stdin.write("\n")
        await proc.stdin.end()
        expect(await new Response(proc.stdout).text()).toBe("started\n")
        expect(await proc.exited).toBe(0)
      })
    })
  }
})

describe("pipeline helpers", () => {
  test("pipelines use a POSIX shell, Git for Windows' sh on Windows servers", () => {
    expect(posixShell("/repo/orchestra")).toBe("/bin/sh")
    expect(posixShell("C:\\repo")).toBe("C:\\Program Files\\Git\\bin\\sh.exe")
    expect(posixShell("d:/repo")).toBe("C:\\Program Files\\Git\\bin\\sh.exe")
    expect(posixShell("\\\\server\\share")).toBe("C:\\Program Files\\Git\\bin\\sh.exe")
  })

  test("plain log drops escape sequences, the echoed gate and redrawn progress", () => {
    expect(
      plainLog("\r\n\x1b[32m✓\x1b[0m build\r\nprogress 10%\rprogress 100%\r\n\x1b]0;title\x07done\ttab\x07\r\n\r\n"),
    ).toBe("✓ build\nprogress 100%\ndone\ttab")
  })

  test("plain log keeps blank lines inside output and text without a gate echo", () => {
    expect(plainLog("first\n\nsecond")).toBe("first\n\nsecond")
  })

  test("logs keep their tail within the limit, re-marking repeated truncation once", () => {
    expect(tailLog("abcdef", 10)).toBe("abcdef")
    expect(tailLog("abcdef", 3)).toBe("…\ndef")
    expect(tailLog(`${tailLog("abcdef", 3)}gh`, 3)).toBe("…\nfgh")
  })

  test("stored pipelines decode strictly", () => {
    const pipeline = {
      id: "p1",
      name: "Checks",
      branch: "dev",
      trigger: "push",
      command: "bun test",
      environment: "staging",
      deploy: false,
      status: "passed",
      runs: 2,
      log: "done",
    } as const
    expect(Option.getOrUndefined(decodeStoredPipelines(JSON.stringify({ pipelines: [pipeline] })))).toEqual({
      pipelines: [pipeline],
    })
    const running = { ...pipeline, status: "running" as const, run: { ptyID: "pty_1", ready: true } }
    expect(Option.getOrUndefined(decodeStoredPipelines(JSON.stringify({ pipelines: [running] })))).toEqual({
      pipelines: [running],
    })
    for (const invalid of [
      { ...pipeline, status: "done" },
      { ...pipeline, runs: "2" },
      { ...pipeline, run: {} },
    ])
      expect(Option.isNone(decodeStoredPipelines(JSON.stringify({ pipelines: [invalid] })))).toBe(true)
    expect(Option.isNone(decodeStoredPipelines("not json"))).toBe(true)
  })
})

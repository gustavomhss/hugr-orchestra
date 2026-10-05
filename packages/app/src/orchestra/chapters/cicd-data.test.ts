import { describe, expect, test } from "bun:test"
import { loadWorkflows, pipelineScript, plainLog, tailLog, workflowFailure, workflowFiles } from "./cicd-data"

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

describe("pipeline runs", () => {
  test("the script waits for the attach gate, then runs every command line with errexit", () => {
    expect(pipelineScript("bun run build\nbun test")).toBe(
      "IFS= read -r orchestra_ready\nset -e\nbun run build\nbun test",
    )
  })

  test("plain log drops escape sequences, the echoed gate and redrawn progress", () => {
    expect(
      plainLog(
        "\r\n\x1b[32m✓\x1b[0m build\r\nprogress 10%\rprogress 100%\r\n\x1b]0;title\x07done\ttab\x07\r\n\r\n",
      ),
    ).toBe("✓ build\nprogress 100%\ndone\ttab")
  })

  test("plain log keeps blank lines inside output and text without a gate echo", () => {
    expect(plainLog("first\n\nsecond")).toBe("first\n\nsecond")
  })

  test("logs keep their tail within the limit", () => {
    expect(tailLog("abcdef", 10)).toBe("abcdef")
    expect(tailLog("abcdef", 3)).toBe("…\ndef")
  })
})

import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { submitShellCommand } from "@/components/prompt-input/submit"
import type { ImageAttachmentPart, Prompt } from "@/context/prompt"
import { ORCHESTRA_COPY } from "@/i18n/orchestra"
import type { EvidenceSource } from "../orchestra-evidence-data"
import { appendText, draftBlank, pullRequestRequest, replayBlock, sameDirectory } from "./session-evidence-actions"

const source: EvidenceSource = {
  scope: "server-a",
  directory: "/repo",
  sessionID: "ses_a",
  messageID: "msg_a",
  partID: "prt_a",
  callID: "call_a",
  command: "bun test",
}
const current = { scope: "server-a", directory: "/repo", sessionID: "ses_a" }
const idle = { busy: false, blocked: false, ready: true }
const t = (key: string | number, params?: Record<string, string | number | boolean>) =>
  ORCHESTRA_COPY[String(key) as keyof typeof ORCHESTRA_COPY].replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(params?.[name] ?? ""),
  )

describe("replayBlock", () => {
  test("replays only in the captured server, session and directory", () => {
    expect(replayBlock({ source, current, ...idle })).toBeUndefined()
    expect(replayBlock({ source, current: { ...current, sessionID: "ses_b" }, ...idle })).toBe("session")
    expect(replayBlock({ source, current: { ...current, scope: "server-b" }, ...idle })).toBe("session")
    expect(replayBlock({ source, current: { ...current, directory: "/other" }, ...idle })).toBe("session")
    expect(replayBlock({ source, current: { ...current, sessionID: undefined }, ...idle })).toBe("session")
    expect(replayBlock({ source: { ...source, directory: "" }, current: { ...current, directory: "" }, ...idle })).toBe(
      "session",
    )
    expect(
      replayBlock({ source: { ...source, directory: "." }, current: { ...current, directory: "." }, ...idle }),
    ).toBe("session")
  })

  test("refuses a working directory the shell request cannot reproduce", () => {
    expect(replayBlock({ source: { ...source, workdir: "/repo/" }, current, ...idle })).toBeUndefined()
    expect(replayBlock({ source: { ...source, workdir: "/repo/packages/app" }, current, ...idle })).toBe("workdir")
    expect(replayBlock({ source: { ...source, workdir: "packages/app" }, current, ...idle })).toBe("workdir")
    expect(replayBlock({ source: { ...source, workdir: "." }, current, ...idle })).toBeUndefined()
    expect(
      replayBlock({ source: { ...source, workdir: "." }, current: { ...current, directory: "/other" }, ...idle }),
    ).toBe("session")
  })

  test("preserves POSIX backslashes and rejects backslash-relative workdirs", () => {
    for (const entry of [
      { directory: "/repo/a/b", workdir: "/repo/a\\b" },
      { directory: "/repo/a\\b", workdir: "/repo/a/b" },
      { directory: "/repo/a/b", workdir: "\\repo\\a\\b" },
      { directory: "/repo/a/b", workdir: "\\\\repo\\a\\b" },
      { directory: "/repo/a/b", workdir: "repo\\a\\b" },
    ]) {
      expect(sameDirectory(entry.workdir, entry.directory)).toBe(false)
      expect(
        replayBlock({ source: { ...source, ...entry }, current: { ...current, directory: entry.directory }, ...idle }),
      ).toBe("workdir")
    }
    expect(sameDirectory("/repo/a\\b/", "/repo/a\\b")).toBe(true)
    expect(sameDirectory("\\repo\\a\\b", "\\repo\\a\\b")).toBe(false)
  })

  test("allows matching Windows drive-rooted workdirs and rejects drive-relative ones", () => {
    const directory = "C:/Repo/a/b"
    for (const workdir of [directory, "C:\\Repo\\a\\b", "C:\\Repo/a\\b\\"]) {
      expect(sameDirectory(workdir, directory)).toBe(true)
      expect(
        replayBlock({ source: { ...source, directory, workdir }, current: { ...current, directory }, ...idle }),
      ).toBeUndefined()
    }
    for (const workdir of ["C:Repo\\a\\b", "\\Repo\\a\\b", "D:\\Repo\\a\\b", "C:\\Repo\\a\\..\\b"]) {
      expect(sameDirectory(workdir, directory)).toBe(false)
      expect(
        replayBlock({ source: { ...source, directory, workdir }, current: { ...current, directory }, ...idle }),
      ).toBe("workdir")
    }
  })

  test("waits for an idle, unblocked session with a model", () => {
    expect(replayBlock({ source, current, ...idle, busy: true })).toBe("busy")
    expect(replayBlock({ source, current, ...idle, pending: true })).toBe("pending")
    expect(replayBlock({ source, current, ...idle, blocked: true })).toBe("blocked")
    expect(replayBlock({ source, current, ...idle, ready: false })).toBe("model")
  })
})

test("sameDirectory compares validated directory spellings", () => {
  expect(sameDirectory("/repo", "/repo/")).toBe(true)
  expect(sameDirectory("/repo//", "/repo")).toBe(false)
  expect(sameDirectory("C:\\Repo\\", "C:/Repo")).toBe(true)
  expect(sameDirectory("/repo/../repo", "/repo")).toBe(false)
  expect(sameDirectory("repo", "repo")).toBe(false)
  expect(sameDirectory("/Repo", "/repo")).toBe(false)
})

for (const [name, directory, workdir, block] of [
  ["exact POSIX", "/repo", "/repo", undefined],
  ["POSIX trailing separator", "/repo", "/repo/", undefined],
  ["POSIX root", "/", "/", undefined],
  ["POSIX current directory", "/repo", ".", undefined],
  ["current root directory", "/", ".", undefined],
  ["literal dot in name", "/repo/.cache", "/repo/.cache", undefined],
  ["literal POSIX backslash", "/repo/a\\b", "/repo/a\\b", undefined],
  ["distinct POSIX backslash", "/repo/a/b", "/repo/a\\b", "workdir"],
  ["backslash relative", "/repo/a/b", "\\repo\\a\\b", "workdir"],
  ["exact slash UNC", "//server/share/repo", "//server/share/repo", undefined],
  ["UNC vs root relative", "//server/share/repo", "/server/share/repo", "workdir"],
  ["root relative vs UNC", "/server/share/repo", "//server/share/repo", "workdir"],
  ["different UNC share", "//server/share/repo", "//server/other/repo", "workdir"],
  ["different UNC server", "//server/share/repo", "//other/share/repo", "workdir"],
  ["ambiguous UNC separator conversion", "//server/share/repo", "\\\\server\\share\\repo", "workdir"],
  ["UNC current directory", "//server/share/repo", ".", undefined],
  ["single vs double root", "/", "//", "workdir"],
  ["double vs triple root", "//", "///", "workdir"],
  ["triple root spelling", "///repo", "/repo", "workdir"],
  ["internal separator run", "/repo/a/b", "/repo/a//b", "workdir"],
  ["trailing separator run", "/repo", "/repo//", "workdir"],
  ["Windows slash variant", "C:/Repo", "C:\\Repo", undefined],
  ["Windows drive root", "C:/", "C:\\", undefined],
  ["Windows current directory", "C:/Repo", ".", undefined],
  ["unproven Windows case equivalence", "C:/Repo", "C:/repo", "workdir"],
  ["drive relative", "C:/foo", "C:foo", "workdir"],
  ["bare drive relative", "C:/", "C:", "workdir"],
  ["different drive", "C:/foo", "D:/foo", "workdir"],
  ["symlink parent traversal", "/repo", "/repo/link/..", "workdir"],
  ["lexically cancelling parent traversal", "/repo/a", "/repo/a/../a", "workdir"],
  ["parent traversal in captured directory", "/repo/link/..", "/repo/link/..", "session"],
  ["UNC parent traversal", "//server/share/repo", "//server/share/link/../repo", "workdir"],
  ["ambiguous UNC parent traversal", "//server/share/repo", "//server/share/link\\..\\repo", "workdir"],
  ["Windows parent traversal", "C:/Repo", "C:\\Repo\\link\\..", "workdir"],
  ["unknown current directory", "", ".", "session"],
  ["drive-relative captured directory", "C:foo", ".", "session"],
  ["relative captured directory", ".", ".", "session"],
  ["nonliteral current directory spelling", "/repo", "./", "workdir"],
] as const) {
  test(`closed directory identity matrix: ${name}`, () => {
    expect(sameDirectory(workdir, directory)).toBe(block === undefined)
    expect(
      replayBlock({ source: { ...source, directory, workdir }, current: { ...current, directory }, ...idle }),
    ).toBe(block)
  })
}

test("rejects parent traversal when a real symlink target has a different parent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "orchestra-replay-path-"))
  try {
    const directory = path.join(root, "current")
    const other = path.join(root, "other")
    await mkdir(directory)
    await mkdir(path.join(other, "child"), { recursive: true })
    await symlink(path.join(other, "child"), path.join(directory, "link"), "junction")
    const workdir = `${directory}${path.sep}link${path.sep}..`
    // Some realpath wrappers normalize '..' before inspecting links. Resolve the
    // link itself to establish the counterexample independently of that behavior.
    const target = await realpath(path.join(directory, "link"))
    expect(target).toBe(await realpath(path.join(other, "child")))
    expect(path.dirname(target)).not.toBe(await realpath(directory))
    expect(path.resolve(workdir)).toBe(directory)
    expect(sameDirectory(workdir, directory)).toBe(false)
    expect(
      replayBlock({ source: { ...source, directory, workdir }, current: { ...current, directory }, ...idle }),
    ).toBe("workdir")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

describe("draft helpers", () => {
  const image: ImageAttachmentPart = {
    type: "image",
    id: "img_1",
    filename: "a.png",
    mime: "image/png",
    blob: { id: "blob_1", url: "blob:img_1" },
  }
  test("draftBlank treats attachments and mentions as content", () => {
    expect(draftBlank([{ type: "text", content: "  ", start: 0, end: 2 }])).toBe(true)
    expect(draftBlank([{ type: "text", content: "", start: 0, end: 0 }, image])).toBe(false)
    expect(draftBlank([{ type: "file", path: "a.ts", content: "@a.ts", start: 0, end: 5 }])).toBe(false)
  })

  test("appendText keeps existing parts and attachments in place", () => {
    const prompt = [
      { type: "text", content: "Fix ", start: 0, end: 4 },
      { type: "file", path: "a.ts", content: "@a.ts", start: 4, end: 9 },
      image,
    ] as Prompt
    const next = appendText(prompt, "Prepare a PR")
    expect(next.slice(0, 2)).toEqual(prompt.slice(0, 2))
    expect(next[2]).toEqual({ type: "text", content: "\n\nPrepare a PR", start: 9, end: 23 })
    expect(next[3]).toEqual(image)
    const extended = appendText([{ type: "text", content: "Draft", start: 0, end: 5 }], "More")
    expect(extended).toEqual([{ type: "text", content: "Draft\n\nMore", start: 0, end: 11 }])
  })
})

test("pullRequestRequest asks for review before publishing and uses only known session data", () => {
  const text = pullRequestRequest({
    title: "Approval flow refactor",
    branch: "feature/approval",
    summary: { files: 2, additions: 10, deletions: 3, diffs: [{ file: "src/a.ts" }, { file: "src/b.ts" }] },
    command: "bun test",
    result: "Tests failed, 2 failed, 5 passed (Exit 1)",
    t,
  })
  expect(text).toBe(
    [
      ORCHESTRA_COPY["orchestra.pr.request"],
      "",
      "Suggested title: Approval flow refactor",
      "Branch: feature/approval",
      "Session changes: 2 files (+10 −3)",
      "Changed files: src/a.ts, src/b.ts",
      "Selected test run: `bun test` — Tests failed, 2 failed, 5 passed (Exit 1)",
      ORCHESTRA_COPY["orchestra.evidence.revisionUnlinked"],
    ].join("\n"),
  )
  expect(pullRequestRequest({ command: "pytest", t })).toBe(
    [
      ORCHESTRA_COPY["orchestra.pr.request"],
      "",
      "Selected test command: `pytest`",
      ORCHESTRA_COPY["orchestra.evidence.revisionUnlinked"],
    ].join("\n"),
  )
})

test("submitShellCommand sends the exact command with a new run identity each time", async () => {
  const sent: { sessionID: string; id?: string; command: string }[] = []
  const api = { shell: async (input: { sessionID: string; id?: string; command: string }) => void sent.push(input) }
  const input = {
    api: api as unknown as Parameters<typeof submitShellCommand>[0]["api"],
    sessionID: "ses_a",
    command: "bun test --timeout 5000",
    agent: "build",
    model: { providerID: "opencode", modelID: "claude" },
  }
  await submitShellCommand(input)
  await submitShellCommand(input)
  expect(sent.map((item) => item.command)).toEqual([input.command, input.command])
  expect(sent[0]!.id).toBeTruthy()
  expect(sent[0]!.id).not.toBe(sent[1]!.id)
})

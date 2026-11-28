import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { decoded } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, history, native, request, retained, script } from "./fixture/lucy-history"

test("H04 blame/log/pickaxe stop at a rename boundary without exposing the outside original name or content", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const oldName = "outside/HISTORY-SECRET-ORIGINAL.ts"
    const secret = "HISTORY-OUTSIDE-DELETED-CONTENT"
    yield* Effect.promise(async () => {
      await fs.unlink(path.join(root.directory, sourcePath))
      await fs.writeFile(path.join(root.directory, oldName), sourceText + "// " + secret + "\n")
    })
    yield* root.git("add", "-A")
    yield* root.git("commit", "-q", "-m", "outside historical origin")
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, oldName), sourceText))
    yield* root.git("add", "-A")
    yield* root.git("commit", "-q", "-m", "remove private old line")
    yield* root.git("mv", "--", oldName, sourcePath)
    yield* root.git("commit", "-q", "-m", "move file into admitted scope")
    const anchor = yield* root.git("rev-parse", "HEAD")
    const provider = script([
      { id: "show", name: "review_history", input: { op: "show", path: sourcePath } },
      { id: "blame", name: "review_history", input: { op: "blame", path: sourcePath } },
      { id: "log", name: "review_history", input: { op: "log", path: sourcePath } },
      { id: "pickaxe", name: "review_history", input: { op: "pickaxe", path: sourcePath, pattern: secret } },
    ])
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("rename-confinement", "diligence")))
      expect(report.source?.commit).toBe(anchor)
      expect((yield* history(host, report, "show")).value.text).toBe(sourceText)
      const blame = (yield* history(host, report, "blame")).value
      expect(blame.complete).toBe(false)
      expect(blame.truncated).toBe(false)
      expect(blame.notExamined.length).toBeGreaterThan(0)
      expect(blame.text).toContain("ENGAGEMENT-IN-SCOPE")
      expect((yield* history(host, report, "pickaxe")).value.text).toBe("")
      yield* history(host, report, "log")
      const evidence = yield* retained(host, report)
      expect(evidence.proofs).toHaveLength(4)
      for (const event of yield* native(host, report.sessionID)) {
        expect(event.text).not.toContain(oldName)
        expect(event.text).not.toContain(secret)
      }
      // The proof input retains the caller's pattern, which is already supplied data; result bytes may not leak it.
      for (const item of evidence.proofs) {
        expect(item.proof.result.text).not.toContain(oldName)
        expect(item.proof.result.text).not.toContain(secret)
      }
    }), variantAdapter(provider.stream))
  })))
}, 150_000)

for (const mode of ["symlink", "gitlink"] as const) {
  test(`H02 historical ${mode} at an admitted current filename cannot be read as a regular source file`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      let oid = root.head
      if (mode === "symlink") {
        const data = path.join(root.global.tmp, "historical-link-target")
        yield* Effect.promise(() => fs.writeFile(data, "../outside/private.ts"))
        oid = yield* root.git("hash-object", "-w", data)
      }
      yield* root.git("update-index", "--cacheinfo", (mode === "symlink" ? "120000" : "160000") + "," + oid + "," + sourcePath)
      yield* root.git("commit", "-q", "-m", "historical nonregular path")
      const revision = yield* root.git("rev-parse", "HEAD")
      const regular = yield* root.git("hash-object", "-w", sourcePath)
      yield* root.git("update-index", "--cacheinfo", "100644," + regular + "," + sourcePath)
      yield* root.git("commit", "-q", "-m", "restore regular admitted file")
      const provider = script([
        { id: "positive", name: "review_history", input: { op: "show", path: sourcePath } },
        { id: "negative", name: "review_history", input: { op: "show", path: sourcePath, rev: revision } },
      ])
      yield* root.open((host) => Effect.gen(function* () {
        const report = decoded(yield* host.invoke(request("nonregular-" + mode, "diligence")))
        expect((yield* history(host, report, "positive")).value.text).toBe(sourceText)
        const denied = (yield* native(host, report.sessionID)).find((event) => event.toolCallID === "negative")
        expect(denied?.state.status, denied?.text).toBe("error")
        expect(denied?.text).toContain("engagement-history-")
        expect(denied?.text).not.toContain("../outside/private.ts")
        expect((yield* retained(host, report)).proofs).toHaveLength(1)
      }), variantAdapter(provider.stream))
    })))
  }, 150_000)
}


test("H05 a missing ancestor object cannot trigger a promisor fetch or helper execution", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const blob = yield* root.git("rev-parse", root.base + ":" + sourcePath)
    const marker = path.join(root.global.tmp, "promisor-helper-ran")
    const helper = path.join(root.global.tmp, "promisor-helper.mjs")
    yield* Effect.promise(() => fs.writeFile(helper,
      'import fs from "node:fs"; fs.writeFileSync(process.argv[2], "PROMISOR-RAN")\n'))
    const ordinary = script([{ id: "ancestor", name: "review_history", input: { op: "show", path: sourcePath, rev: root.base } }])
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("missing-object-positive", "diligence")))
      expect((yield* history(host, report, "ancestor")).value.text).toContain("ENGAGEMENT-BASE")
    }), variantAdapter(ordinary.stream))
    let verifyPromisor: (() => Effect.Effect<void>) | undefined
    const provider = script([{ id: "ancestor", name: "review_history", input: { op: "show", path: sourcePath, rev: root.base } }],
      Effect.gen(function* () {
        // git-remote-ext has its own grammar: unescaped spaces separate args; "% " and "%%" escape literals.
        // Primary source: https://git-scm.com/docs/git-remote-ext (DESCRIPTION).
        const command = [process.execPath, helper, marker].map((part) => part.replaceAll("%", "%%").replaceAll(" ", "% ")).join(" ")
        yield* root.git("config", "remote.origin.url", "ext::" + command)
        yield* root.git("config", "remote.origin.promisor", "true")
        yield* root.git("config", "extensions.partialClone", "origin")
        // Fixture only: remove Git's default ext protocol refusal so that absence of the marker is meaningful.
        yield* root.git("config", "protocol.ext.allow", "always")
        yield* Effect.promise(() => fs.unlink(path.join(root.directory, ".git", "objects", blob.slice(0, 2), blob.slice(2))))
        if (!verifyPromisor) return yield* Effect.die("real lazy-fetch positive control was not installed")
        yield* verifyPromisor()
      }))
    yield* root.open((host) => Effect.gen(function* () {
      const git = yield* GitCli.Service
      verifyPromisor = () => Effect.gen(function* () {
        // A real missing-object read, not ls-remote: Git must reach this exact configured promisor helper.
        const control = yield* git.run(["-c", "protocol.ext.allow=always", "cat-file", "blob", blob], {
          cwd: root.directory, timeout: "5 seconds", maxOutputBytes: 4096,
          env: { GIT_NO_LAZY_FETCH: "0", GIT_ALLOW_PROTOCOL: "ext", GIT_TERMINAL_PROMPT: "0" },
        })
        expect(control.exitCode).not.toBe(0) // Helper witnesses invocation, deliberately supplies no pack/protocol.
        expect(yield* Effect.promise(() => fs.readFile(marker, "utf8"))).toBe("PROMISOR-RAN")
        yield* Effect.promise(() => fs.unlink(marker))
      })
      const report = decoded(yield* host.invoke(request("missing-object-fails-closed", "diligence")))
      const events = (yield* native(host, report.sessionID)).filter((event) => event.name === "review_history")
      expect(events).toHaveLength(1)
      expect(events[0].state.status, events[0].text).toBe("error")
      expect(events[0].text).toContain("engagement-history-")
      expect(yield* Effect.promise(() => fs.stat(marker).then(() => true, () => false))).toBe(false)
    }), variantAdapter(provider.stream))
  })))
}, 150_000)

test("H05 alternate object databases are refused without reading outside object authority", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const ordinary = script([{ id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("alternates-positive", "diligence")))
      expect((yield* history(host, report, "show")).value.text).toBe(sourceText)
    }), variantAdapter(ordinary.stream))
    const alternate = path.join(root.global.tmp, "outside-object-database")
    const provider = script([{ id: "show", name: "review_history", input: { op: "show", path: sourcePath } }],
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.mkdir(alternate, { recursive: true }))
        yield* Effect.promise(() => fs.mkdir(path.join(root.directory, ".git", "objects", "info"), { recursive: true }))
        yield* Effect.promise(() => fs.writeFile(path.join(root.directory, ".git", "objects", "info", "alternates"), alternate + "\n"))
      }))
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("alternates-refused", "diligence")))
      const events = (yield* native(host, report.sessionID)).filter((event) => event.name === "review_history")
      expect(events).toHaveLength(1)
      expect(events[0].state.status, events[0].text).toBe("error")
      expect(events[0].text).toContain("engagement-history-")
      expect(events[0].text).not.toContain(alternate)
      expect(yield* Effect.promise(() => fs.readdir(alternate))).toEqual([])
    }), variantAdapter(provider.stream))
  })))
}, 150_000)


test("H05 repository config cannot execute fsmonitor/textconv/diff helpers or leak their output", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const helper = path.join(root.global.tmp, "history-helper.mjs")
    const marker = path.join(root.global.tmp, "history-helper-ran")
    const helperText = 'import fs from "node:fs"; fs.writeFileSync(process.argv[2], "HISTORY-HELPER-EXECUTED"); console.log("HISTORY-HELPER-SECRET")\n'
    yield* Effect.promise(() => fs.writeFile(helper, helperText))
    const ordinary = script([code, { id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const output = yield* host.invoke(request("helper-common-positive", "diligence"))
      const report = decoded(output)
      yield* completed(host, report.sessionID, code.id)
      expect((yield* history(host, report, "show")).value.text).toBe(sourceText)
      const processes = yield* AppProcess.Service
      const control = yield* processes.run(ChildProcess.make(process.execPath, [helper, marker],
        { cwd: root.global.tmp, stdin: "ignore" }), { timeout: "5 seconds", maxOutputBytes: 4096, maxErrorBytes: 4096 })
      expect(control.exitCode).toBe(0)
      expect(control.stdoutTruncated || control.stderrTruncated).toBe(false)
      expect(control.stdout.toString("utf8").trim()).toBe("HISTORY-HELPER-SECRET")
      expect(yield* Effect.promise(() => fs.readFile(marker, "utf8"))).toBe("HISTORY-HELPER-EXECUTED")
      yield* Effect.promise(() => fs.unlink(marker))
    }), variantAdapter(ordinary.stream))
    const command = [process.execPath, helper, marker].map((value) => JSON.stringify(value)).join(" ")
    const hostile = script(["show", "log", "blame", "pickaxe"].map((op) => ({
      id: op, name: "review_history", input: { op, path: sourcePath, ...(op === "pickaxe" ? { pattern: "ENGAGEMENT" } : {}) },
    })), Effect.gen(function* () {
      yield* root.git("config", "core.fsmonitor", command)
      yield* root.git("config", "diff.external", command)
      yield* root.git("config", "diff.history-test.textconv", command)
      yield* Effect.promise(() => fs.mkdir(path.join(root.directory, ".git", "info"), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(path.join(root.directory, ".git", "info", "attributes"), sourcePath + " diff=history-test\n"))
    }))
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("helper-hostile", "diligence")))
      const events = (yield* native(host, report.sessionID)).filter((event) => event.name === "review_history")
      expect(events).toHaveLength(4)
      for (const event of events) {
        expect(event.text).not.toContain("HISTORY-HELPER-SECRET")
        expect(event.text).not.toContain("HISTORY-HELPER-EXECUTED")
        if (event.state.status === "completed") {
          const result = (yield* history(host, report, event.toolCallID)).value
          if (event.toolCallID === "show") expect(result.text).toBe(sourceText)
        } else {
          expect(event.state.status).toBe("error")
          expect(event.text).toContain("engagement-history-")
        }
      }
      expect(yield* Effect.promise(() => fs.stat(marker).then(() => true, () => false))).toBe(false)
    }), variantAdapter(hostile.stream))
  })))
}, 180_000)

for (const mode of ["replace", "graft", "shallow"] as const) {
  test(`H05 ${mode} state cannot change captured historical content or invent complete ancestry`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const ordinary = script([code, { id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
      yield* root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const report = decoded(yield* host.invoke(request("graph-control-" + mode, "diligence")))
        yield* completed(host, report.sessionID, code.id)
        expect((yield* history(host, report, "show")).value.text).toBe(sourceText)
      }), variantAdapter(ordinary.stream))
      const provider = script([
        { id: "show", name: "review_history", input: { op: "show", path: sourcePath } },
        { id: "log", name: "review_history", input: { op: "log", path: sourcePath } },
      ], Effect.gen(function* () {
        if (mode === "replace") {
          yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), "HISTORY-REPLACEMENT-SECRET\n"))
          yield* root.git("add", "--", sourcePath)
          yield* root.git("commit", "-q", "-m", "replacement")
          yield* root.git("replace", root.head, "HEAD")
        } else if (mode === "graft") {
          yield* Effect.promise(() => fs.mkdir(path.join(root.directory, ".git", "info"), { recursive: true }))
          yield* Effect.promise(() => fs.writeFile(path.join(root.directory, ".git", "info", "grafts"), root.head + "\n"))
        } else yield* Effect.promise(() => fs.writeFile(path.join(root.directory, ".git", "shallow"), root.head + "\n"))
      }))
      yield* root.open((host) => Effect.gen(function* () {
        const report = decoded(yield* host.invoke(request("hostile-graph-" + mode, "diligence")))
        expect(report.source?.commit).toBe(root.head)
        const events = (yield* native(host, report.sessionID)).filter((event) => event.name === "review_history")
        expect(events).toHaveLength(2)
        for (const event of events) {
          expect(event.text).not.toContain("HISTORY-REPLACEMENT-SECRET")
          if (event.state.status === "completed") {
            const result = (yield* history(host, report, event.toolCallID)).value
            if (event.toolCallID === "show") expect(result.text).toBe(sourceText)
            if (event.toolCallID === "log") {
              if (mode === "replace") expect(result.text).toContain(root.base)
              else {
                expect(result.complete).toBe(false)
                expect(result.notExamined.length).toBeGreaterThan(0)
              }
            }
          } else {
            expect(event.state.status).toBe("error")
            expect(event.text).toContain("engagement-history-")
          }
        }
      }), variantAdapter(provider.stream))
    })))
  }, 180_000)
}


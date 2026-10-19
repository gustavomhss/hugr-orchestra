import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect, Exit } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Agent } from "@/agent/agent"
import { Git } from "@/git"
import { Seats } from "@orchestra/maestro/seats"
import { SeatSkillRoot } from "@orchestra/maestro/seat-skill-root"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { ToolRegistry } from "@/tool/registry"
import { CapabilitySupport } from "./support"

describe("JE-AC-EFF1: rereading an unchanged span costs under 200 tokens", () => {
  // Mutation control: disable the `retained` branch of `compact` in src/tool/research-capture.ts.
  CapabilitySupport.it.instance("an unchanged recapture and an unchanged view return the ref alone; a changed span says so", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const fs = yield* FSUtil.Service
    const file = path.join(fixture.directory, "span.ts")
    const write = (value: number) => fs.writeFileString(file,
      Array.from({ length: 40 }, (_, index) => index === 11 ? `const needle = ${value}` : `line ${index + 1}`).join("\n"))
    yield* write(1)
    const span = { kind: "file", path: "span.ts", start: 10, end: 14 }
    const first = JSON.parse((yield* fixture.run("research_capture", span)).output)
    expect(first.lines).toEqual({ basis: "original", start: 10, end: 14 })

    const again = yield* fixture.run("research_capture", span)
    expect(JSON.parse(again.output)).toMatchObject({ unchanged: true, ref: first.ref })
    expect(Object.keys(JSON.parse(again.output)).toSorted()).toEqual(["ref", "summary", "unchanged"])
    expect(again.output).not.toContain("needle")
    // Four characters per token is the conservative count.
    expect(again.output.length / 4).toBeLessThan(200)

    yield* write(2)
    expect(JSON.parse((yield* fixture.run("research_capture", span)).output)).toMatchObject({ changed: true, previous: first.ref })

    yield* fixture.run("research_view", { action: "source", ref: first.ref })
    const reopened = yield* fixture.run("research_view", { action: "source", ref: first.ref })
    expect(JSON.parse(reopened.output)).toMatchObject({ ref: first.ref, unchanged: true })
    expect(reopened.output.length / 4).toBeLessThan(200)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })
})

describe("JE-AC-H1, H2: git history in the linked repository", () => {
  // Mutation control (H1): hand the caller's environment, GIT_* included, to git in src/research/history.ts.
  CapabilitySupport.it.instance("history works with GIT_DIR and GIT_ASKPASS in the process environment, and resolve takes only refs", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const records = yield* ResearchRecords.Service
    const commit = (message: string, body: string) => Effect.gen(function* () {
      yield* fs.writeFileString(path.join(fixture.directory, "tracked.txt"), body)
      expect((yield* git.run(["add", "--", "tracked.txt"], { cwd: fixture.directory })).exitCode).toBe(0)
      expect((yield* git.run(["commit", "-m", message], { cwd: fixture.directory })).exitCode).toBe(0)
      return (yield* git.run(["rev-parse", "HEAD"], { cwd: fixture.directory })).text().trim()
    })
    const first = yield* commit("fixture: first", "one\n")
    const second = yield* commit("fixture: second", "two\n")
    const structured = (result: Parameters<typeof CapabilitySupport.source>[0]) => Effect.gen(function* () {
      const receipt = CapabilitySupport.source(result)
      const page = yield* records.view(receipt.binding, { action: "source", ref: receipt.ref })
      return JSON.parse("text" in page ? page.text : "{}")
    })
    const redirected = { GIT_DIR: path.join(fixture.directory, "missing.git"), GIT_ASKPASS: "/nonexistent/askpass",
      GIT_INDEX_FILE: path.join(fixture.directory, "missing.index") }
    const saved = Object.fromEntries(Object.keys(redirected).map((key) => [key, process.env[key]]))
    yield* Effect.acquireRelease(Effect.sync(() => Object.assign(process.env, redirected)), () => Effect.sync(() =>
      Object.entries(saved).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)))

    const log = yield* structured(yield* fixture.run("research_capture", { kind: "history", operation: "log", path: "tracked.txt" }))
    expect(log.commits).toEqual([second, first])
    // H2: a relative ref resolves to the full hash.
    const resolved = yield* structured(yield* fixture.run("research_capture", { kind: "history", operation: "resolve", ref: "HEAD~1" }))
    expect(resolved).toMatchObject({ operation: "resolve", ref: "HEAD~1", commit: first })
    expect(resolved.commit).toHaveLength(40)
    // H2: an option, a shell fragment and a name with a space are refused, never passed to git as flags.
    for (const ref of ["--output=x", "HEAD;rm", "a b"]) {
      const exit = yield* fixture.run("research_capture", { kind: "history", operation: "resolve", ref }).pipe(Effect.exit)
      expect([ref, Exit.isFailure(exit)]).toEqual([ref, true])
    }
    expect(yield* fs.existsSafe(path.join(fixture.directory, "x"))).toBe(false)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })
})

describe("JE-AC-E3: the loop never gives the seat lsp", () => {
  // Mutation control: add "lsp" to ResearchSeatTools.LOOP.
  CapabilitySupport.withLsp.instance("with the LSP tool enabled, another agent sees it and jimmy does not", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const agents = yield* Agent.Service
    const registry = yield* ToolRegistry.Service
    const seat = fixture.tools.map((tool) => tool.id)
    const other = (yield* registry.tools({ ...CapabilitySupport.model, agent: yield* agents.get("general") })).map((tool) => tool.id)
    // The positive control: without it an absent lsp could mean the flag never took effect.
    expect(other).toContain("lsp")
    expect(seat).not.toContain("lsp")
    expect(seat).toEqual(expect.arrayContaining(["read", "grep", "glob"]))
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})

describe("JE-AC-E4: loop retention", () => {
  // Mutation control: drop "grep" and "glob" from ResearchSeatTools.RETAINED.
  CapabilitySupport.it.instance("grep and glob output is retained as evidence; reading the seat's own skill is not", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(fixture.directory, "product.txt"), "alpha\nneedle\nomega\n")
    for (const [name, args] of [["grep", { pattern: "needle" }], ["glob", { pattern: "*.txt" }]] as const) {
      const result = yield* fixture.run(name, args)
      expect([name, result.metadata.researchSource !== undefined]).toEqual([name, true])
      expect([name, result.output.includes("Retained output evidence")]).toEqual([name, true])
    }
    const skill = path.join(SeatSkillRoot.roots[ResearchSeatTools.SEAT], Seats.all.jimmy.skills[0], "SKILL.md")
    const method = yield* fixture.run("read", { filePath: skill })
    expect(method.output).toContain("name:")
    expect(method.metadata.researchSource).toBeUndefined()
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})

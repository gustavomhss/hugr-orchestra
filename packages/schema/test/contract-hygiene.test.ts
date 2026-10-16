import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { Agent } from "../src/agent"
import { FileSystem } from "../src/filesystem"
import { Model } from "../src/model"
import { Project } from "../src/project"
import { Pty } from "../src/pty"
import { Question } from "../src/question"
import { Session } from "../src/session"
import { SessionEvent } from "../src/session-event"
import { SessionTodo } from "../src/session-todo"
import { optional } from "../src/schema"

describe("contract hygiene", () => {
  test("optional properties preserve transformations and omit undefined while encoding", () => {
    const Value = Schema.Struct({ value: optional(Schema.FiniteFromString) })
    expect(Schema.decodeUnknownSync(Value)({ value: "1" })).toEqual({ value: 1 })
    expect(Schema.encodeSync(Value)({ value: 1 })).toEqual({ value: "1" })
    expect(Schema.encodeSync(Value)({ value: undefined })).toEqual({})
  })

  test("todo status and priority preserve arbitrary strings", () => {
    const decode = Schema.decodeUnknownSync(SessionTodo.Info)
    expect(decode({ content: "ship", status: "waiting", priority: "urgent" })).toEqual({
      content: "ship",
      status: "waiting",
      priority: "urgent",
    })
  })

  test("current ID constructors expose create", () => {
    expect(Question.ID.create()).toStartWith("que_")
    expect(Pty.ID.create()).toStartWith("pty_")
  })

  test("Session policy and archive events carry state without transcript message identities", () => {
    expect(Object.keys(SessionEvent.SubagentModelsChanged.data.fields)).toEqual(["timestamp", "sessionID", "policy"])
    expect(Object.keys(SessionEvent.ArchiveChanged.data.fields)).toEqual(["timestamp", "sessionID", "archived"])
    const policy = {
      timestamp: 1,
      sessionID: "ses_state",
      policy: { mode: "allowlist", models: [] },
    } satisfies typeof SessionEvent.SubagentModelsChanged.data.Encoded
    const restore = { timestamp: 1, sessionID: "ses_state", archived: null }
    expect(
      Schema.encodeSync(SessionEvent.SubagentModelsChanged.data)(
        Schema.decodeUnknownSync(SessionEvent.SubagentModelsChanged.data)(policy),
      ),
    ).toEqual(policy)
    expect(
      Schema.encodeSync(SessionEvent.ArchiveChanged.data)(
        Schema.decodeUnknownSync(SessionEvent.ArchiveChanged.data)(restore),
      ),
    ).toEqual(restore)
  })

  test("reusable public identifiers are stable and unique", () => {
    const identifiers = [
      Agent.Color,
      FileSystem.Submatch,
      Model.Ref,
      Model.Capabilities,
      Model.Cost,
      Model.Api,
      Project.Icon,
      Project.Commands,
      Project.Time,
      Project.Info,
      Pty.Info,
      Session.ListAnchor,
    ].map((schema) => schema.ast.annotations?.identifier)

    expect(identifiers.every((identifier) => typeof identifier === "string")).toBe(true)
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })

  test("current source avoids Any and mutable contract wrappers", async () => {
    const files = [...new Bun.Glob("*.ts").scanSync(fileURLToPath(new URL("../src", import.meta.url)))].filter(
      (file) => !file.endsWith("-v1.ts"),
    )
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain("session.ts")
    const source = await Promise.all(
      files.map((file) => Bun.file(new URL(`../src/${file}`, import.meta.url)).text()),
    ).then((values) => values.join("\n"))

    expect(source).toContain('export * as Session from "./session"')
    expect(source).not.toContain("Schema.Any")
    expect(source).not.toContain("Schema.mutable")
  })
})

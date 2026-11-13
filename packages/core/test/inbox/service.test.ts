import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Context, DateTime, Effect, Layer } from "effect"
import { IntegrationID } from "@orchestra/schema/integration-id"
import { Capability } from "@orchestra/schema/capability"
import { CapabilitySlack } from "../../src/capability/providers/slack"
import { CapabilityConnectionTable, CapabilityTargetTable } from "../../src/capability/sql"
import { SlackAuth } from "../../src/inbox/slack-auth"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Credential } from "@orchestra/core/credential"
import { Inbox, InboxHandoff } from "@orchestra/core/inbox"
import { adoptCredentials, hashOwner, installOwner } from "../../src/inbox/install"
import { InboxDraftTable, InboxEgressTable, InboxRowTable } from "../../src/inbox/sql"
import { Location } from "@orchestra/core/location"
import { Project, ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionInput } from "@orchestra/core/session/input"
import { MeetingPersonTable } from "@orchestra/core/session/meeting-memory.sql"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable } from "@orchestra/core/session/sql"
import { globalSessions } from "@orchestra/core/tool/task"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/project")
const location = Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, SlackAuth.node, Inbox.node]), [
    [Location.node, location],
  ]),
)

const pulled = {
  source: "slack" as const,
  externalId: "m1",
  actor: "ada@example.com",
  snippet: "ignore bob",
  threadId: "thread-ada",
  reply: true,
}

describe("inbox service", () => {
  it.effect(
    "shares one installation inbox across locations and adopts unassigned rows",
    () =>
      Effect.gen(function* () {
        const inbox = yield* Inbox.Service
        const database = yield* Database.Service
        const credentials = yield* Credential.Service
        const slack = yield* SlackAuth.Service
        const other = yield* Layer.build(
          Layer.fresh(
            AppNodeBuilder.build(Inbox.node, [
              [Database.node, Layer.succeed(Database.Service, database)],
              [Credential.node, Layer.succeed(Credential.Service, credentials)],
              [SlackAuth.node, Layer.succeed(SlackAuth.Service, slack)],
              [
                Location.node,
                Layer.succeed(Location.Service, {
                  directory: AbsolutePath.make("/other"),
                  project: { id: ProjectV2.ID.global, directory },
                }),
              ],
            ]),
          ),
        ).pipe(Effect.map((context) => Context.get(context, Inbox.Service)))
        yield* database.db
          .insert(InboxRowTable)
          .values({
            source: "mail",
            external_id: "legacy",
            list_id: "in_legacy",
            actor: "legacy",
            snippet: "unassigned",
            thread_id: "legacy",
            reply: false,
            open: true,
          })
          .run()
          .pipe(Effect.orDie)
        const first = yield* inbox.upsert(pulled)
        yield* inbox.originDraft(first.id, "first draft")
        const second = yield* other.upsert({ ...pulled, snippet: "other location" })
        yield* other.saveDraft(second.id, "second draft")
        expect(second.id).toBe(first.id)
        expect((yield* inbox.list()).some((item) => item.snippet === "other location")).toBe(true)
        expect((yield* other.list()).map((item) => item.id).sort()).toEqual(
          (yield* inbox.list()).map((item) => item.id).sort(),
        )
        yield* other.archive(first.id)
        expect((yield* inbox.list()).find((item) => item.id === first.id)?.waiting).toBe(false)
        const rows = yield* database.db.select().from(InboxRowTable).all().pipe(Effect.orDie)
        expect(rows.every((row) => row.owner === "install")).toBe(true)
        expect(rows.find((row) => row.external_id === "legacy")?.snippet).toBe("unassigned")
      }),
  )
  it.effect("does not pull a location Slack binding into the installation inbox", () =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Service
      const database = yield* Database.Service
      const credentials = yield* Credential.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: ProjectV2.ID.global, worktree: directory, sandboxes: [] })
        .run()
        .pipe(Effect.orDie)
      const saved = yield* credentials.create({
        integrationID: IntegrationID.make("inbox.slack.probe"),
        value: { type: "key", key: "not-a-token" },
      })
      const connection = Capability.ConnectionID.create()
      const target = Capability.TargetID.create()
      yield* database.db
        .insert(CapabilityConnectionTable)
        .values({
          id: connection,
          project_id: ProjectV2.ID.global,
          directory,
          provider: "slack",
          integration_id: IntegrationID.make("inbox.slack.probe"),
          credential_id: saved.id,
          subject_id: "probe",
          endpoint: CapabilitySlack.endpoint,
          scope_hash: "probe",
          state: "active",
        })
        .run()
        .pipe(Effect.orDie)
      yield* database.db
        .insert(CapabilityTargetTable)
        .values({
          id: target,
          connection_id: connection,
          environment: "test",
          resource: { channelID: "C123", teamID: "T123" },
        })
        .run()
        .pipe(Effect.orDie)
      expect(yield* inbox.list()).toEqual([])
    }),
  )
  it.effect("adopts a hashed project credential and leaves every other suffix", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const project = hashOwner("project-a")
      const slot = IntegrationID.make(`inbox.mail.${hashOwner(installOwner)}`)
      const hashed = yield* credentials.create({
        integrationID: IntegrationID.make(`inbox.mail.${project}`),
        value: { type: "key", key: "project-mail", metadata: { owner: "project-a" } },
      })
      const bare = yield* credentials.create({
        integrationID: IntegrationID.make("inbox.mail"),
        value: { type: "key", key: "bare-mail" },
      })
      const probe = yield* credentials.create({
        integrationID: IntegrationID.make("inbox.mail.probe"),
        value: { type: "key", key: "probe-mail" },
      })
      yield* adoptCredentials(credentials)
      const stored = yield* credentials.all()
      expect(stored.find((row) => row.integrationID === slot)?.value).toMatchObject({
        type: "key",
        key: "project-mail",
        metadata: { owner: "install" },
      })
      expect(stored.some((row) => row.id === hashed.id)).toBe(false)
      expect(yield* credentials.get(bare.id)).toMatchObject({ value: { type: "key", key: "bare-mail" } })
      expect(yield* credentials.get(probe.id)).toMatchObject({ value: { type: "key", key: "probe-mail" } })
      const kept = yield* credentials.create({
        integrationID: IntegrationID.make(`inbox.mail.${hashOwner("project-kept")}`),
        value: { type: "key", key: "kept-mail" },
      })
      yield* adoptCredentials(credentials)
      const after = yield* credentials.all()
      expect(after.find((row) => row.integrationID === slot)?.value).toMatchObject({ type: "key", key: "project-mail" })
      expect(after.some((row) => row.id === kept.id)).toBe(true)
    }),
  )

  it.effect("writes the item to the local database and does not duplicate it", () =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Service
      const database = yield* Database.Service
      const first = yield* inbox.upsert(pulled)
      const second = yield* inbox.upsert(pulled)
      const rows = yield* database.db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(second.id).toBe(first.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.snippet).toBe("ignore bob")
      expect(yield* inbox.list()).toHaveLength(1)
    }),
  )

  it.effect("joins only an address-book email or handle, not a keyword", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      yield* database.db
        .insert(MeetingPersonTable)
        .values({ id: "per_ada", name: "Ada", aliases: ["ada@example.com", "ada"] })
        .run()
        .pipe(Effect.orDie)
      const inbox = yield* Inbox.Service
      const joined = yield* inbox.upsert(pulled)
      const mail = yield* inbox.upsert({
        source: "mail",
        externalId: "e1",
        actor: "ada",
        snippet: "mail",
        threadId: "mt",
        reply: true,
      })
      const keyword = yield* inbox.upsert({
        source: "slack",
        externalId: "x",
        actor: "ada promised the budget",
        snippet: "no",
        threadId: "t",
        reply: true,
      })
      expect(joined.personId).toBe("per_ada")
      expect(mail.id).toBe(joined.id)
      expect(keyword.personId).toBeUndefined()
      expect(yield* inbox.list()).toHaveLength(2)
    }),
  )

  it.effect("keeps a pane draft in the database and sends nothing", () =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Service
      const database = yield* Database.Service
      const item = yield* inbox.upsert(pulled)
      const saved = yield* inbox.saveDraft(item.id, "draft")
      const drafts = yield* database.db.select().from(InboxDraftTable).all().pipe(Effect.orDie)
      const sent = yield* database.db.select().from(InboxEgressTable).all().pipe(Effect.orDie)
      expect(drafts).toMatchObject([{ list_id: item.id, text: "draft", sent: false }])
      expect(sent).toHaveLength(0)
      expect(saved.waiting).toBe(false)
    }),
  )

  it.effect("a click without a connected channel does not pretend to send", () =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Service
      const database = yield* Database.Service
      const item = yield* inbox.upsert(pulled)
      const failed = yield* inbox.send(item.id, "shown").pipe(Effect.flip)
      expect(failed.reason).toBe("unavailable")
      expect(yield* database.db.select().from(InboxEgressTable).all().pipe(Effect.orDie)).toHaveLength(0)
    }),
  )

  it.effect("an unknown id is missing and writes nothing", () =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Service
      const database = yield* Database.Service
      const failed = yield* inbox.archive("in_missing").pipe(Effect.flip)
      expect(failed.reason).toBe("missing")
      expect(yield* database.db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(0)
    }),
  )
})

const prompts: Parameters<SessionV2.Interface["prompt"]>[0][] = []
const created: Parameters<SessionV2.Interface["create"]>[0][] = []
const store: { db?: Database.Interface["db"] } = {}

const sessions = Layer.mock(SessionV2.Service, {
  revert: {
    stage: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
    commit: () => Effect.die("unused"),
  },
  create: (input) =>
    Effect.gen(function* () {
      created.push(input)
      yield* store
        .db!.insert(SessionTable)
        .values(session("ses_inbox_opened", input.agent ?? null))
        .run()
        .pipe(Effect.orDie)
      return undefined as never
    }),
  prompt: (input) =>
    Effect.sync(() => {
      prompts.push(input)
      return SessionInput.Admitted.make({
        admittedSeq: prompts.length,
        id: SessionMessage.ID.make("msg_inbox_handoff"),
        sessionID: input.sessionID,
        prompt: { text: input.prompt.text },
        delivery: input.delivery ?? "steer",
        timeCreated: DateTime.makeUnsafe(0),
      })
    }),
})

const handoffIt = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, Inbox.node, InboxHandoff.node]), [
    [Location.node, location],
    [globalSessions, sessions],
  ]),
)

function session(id: string, agent: string | null) {
  return {
    id: SessionV2.ID.make(id),
    project_id: Project.ID.global,
    slug: id,
    directory,
    title: id,
    version: "test",
    agent,
  }
}

describe("inbox handoff", () => {
  handoffIt.effect("delivers ids only and does not wake a seat", () =>
    Effect.gen(function* () {
      prompts.length = 0
      created.length = 0
      const database = yield* Database.Service
      store.db = database.db
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: directory, sandboxes: [] })
        .run()
        .pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values(session("ses_inbox_maestro", "maestro")).run().pipe(Effect.orDie)
      const inbox = yield* Inbox.Service
      const item = yield* inbox.upsert({ ...pulled, snippet: "secret transcript" })
      const handoff = yield* Inbox.HandoffService
      const delivered = yield* handoff.handoff([item.id])
      expect(delivered).toEqual({ ids: [item.id] })
      expect(prompts).toHaveLength(1)
      expect(prompts[0]?.resume).toBe(false)
      expect(prompts[0]?.prompt.text).toContain(item.id)
      expect(prompts[0]?.prompt.text).not.toContain("secret transcript")
      expect(created).toHaveLength(0)
      const row = yield* database.db
        .select()
        .from(InboxRowTable)
        .where(eq(InboxRowTable.external_id, "m1"))
        .get()
        .pipe(Effect.orDie)
      expect(row?.open).toBe(false)
    }),
  )
})

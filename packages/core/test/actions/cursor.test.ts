import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsCursor } from "../../src/actions/cursor"
import { ActionsError } from "../../src/actions/error"
import { binding } from "./operations-fixture"

const current = binding("/cursor-fixture")
const selection = { ref: "main", status: "completed", limit: ActionsCursor.limit(25) }

describe("ActionsCursor selection", () => {
  test("starts at page one and round-trips the production encoder at page boundaries", () => {
    expect(ActionsCursor.page(current, "runs", selection)).toBe(1)
    Array.of(1, 2, 100_000).forEach((page) => {
      expect(
        ActionsCursor.page(current, "runs", selection, ActionsCursor.encode(current, "runs", selection, page)),
      ).toBe(page)
    })
  })

  test.each([
    ["binding", { id: Actions.BindingID.make("ab_other") }],
    ["revision", { revision: 2 }],
    ["provider", { provider: { ...current.provider, kind: "gitlab" } }],
    ["host", { provider: { ...current.provider, hostname: "github.enterprise.example" } }],
    ["native project", { projectID: "other-native-project" }],
  ] satisfies Array<[string, Partial<Actions.Binding>]>)("rejects another %s independently", (_name, changed) => {
    failure(
      () =>
        ActionsCursor.page(
          binding(current.directory, changed),
          "runs",
          selection,
          ActionsCursor.encode(current, "runs", selection, 2),
        ),
      "invalid_input",
    )
  })

  test.each(["workflows", "jobs:9876", "resources:artifact"])("rejects scope %s", (scope) => {
    failure(
      () => ActionsCursor.page(current, scope, selection, ActionsCursor.encode(current, "runs", selection, 2)),
      "invalid_input",
    )
  })

  test.each([
    ["ref", { ...selection, ref: "release" }],
    ["status", { ...selection, status: "queued" }],
    ["added filter", { ...selection, actor: "other-actor" }],
    ["removed filter", { limit: selection.limit, ref: selection.ref }],
    ["page size", { ...selection, limit: ActionsCursor.limit(50) }],
    ["missing page size", { ref: selection.ref, status: selection.status }],
  ])("rejects changed %s", (_name, changed) => {
    failure(
      () => ActionsCursor.page(current, "runs", changed, ActionsCursor.encode(current, "runs", selection, 2)),
      "invalid_input",
    )
  })

  test("filter key order, absent optionals and cursor itself do not change selection", () => {
    const cursor = ActionsCursor.encode(current, "runs", selection, 2)
    expect(
      ActionsCursor.page(
        current,
        "runs",
        {
          limit: selection.limit,
          status: selection.status,
          ref: selection.ref,
          actor: undefined,
          cursor,
        },
        cursor,
      ),
    ).toBe(2)
    expect(ActionsCursor.page({ ...current, projectPath: "renamed/repo" }, "runs", selection, cursor)).toBe(2)
  })

  test.each([
    "",
    "opaque-provider-token",
    "%%%",
    "eyJ",
    ...["{", "null", "[]", "{}", '"text"'].map((json) => Buffer.from(json).toString("base64url")),
  ])("rejects malformed opaque cursor %j with named definitely-unsent failure", (cursor) => {
    failure(() => ActionsCursor.page(current, "runs", selection, cursor), "invalid_input")
  })

  test.each([0, -1, 1.5, 100_001, "2", null])("rejects invalid decoded page %j", (page) => {
    const decoded = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(
      Buffer.from(ActionsCursor.encode(current, "runs", selection, 2), "base64url").toString("utf8"),
    )
    failure(
      () =>
        ActionsCursor.page(
          current,
          "runs",
          selection,
          Buffer.from(JSON.stringify({ ...decoded, page })).toString("base64url"),
        ),
      "invalid_input",
    )
  })

  test("rejects oversized cursor even when its decoded JSON remains valid", () => {
    const json = Buffer.from(ActionsCursor.encode(current, "runs", selection, 2), "base64url").toString("utf8")
    const cursor = Buffer.from(json + " ".repeat(2048)).toString("base64url")
    expect(cursor.length).toBeGreaterThan(2048)
    failure(() => ActionsCursor.page(current, "runs", selection, cursor), "invalid_input")
  })
})

describe("ActionsCursor provider metadata", () => {
  test("accepts GitHub Link next among other relations and query parameters", () => {
    expect(
      ActionsCursor.next({
        link: '<https://api.github.com/repos/owner/repo/actions/runs?page=1>; rel="prev", <https://api.github.com/repos/owner/repo/actions/runs?per_page=25&page=3>; rel="next", <https://api.github.com/repos/owner/repo/actions/runs?page=9>; rel="last"',
      }),
    ).toBe(3)
    expect(
      ActionsCursor.next({ link: '</api/v3/repos/owner/repo/actions/runs?page=2>; rel=next; type="application/json"' }),
    ).toBe(2)
    expect(ActionsCursor.next({ link: '<https://api.github.com/runs?page=1>; rel="prev"' })).toBeUndefined()
    expect(ActionsCursor.next({})).toBeUndefined()
  })

  test("accepts GitLab headers, explicit end, and unknown total separately from zero", () => {
    expect(ActionsCursor.next({ "x-next-page": "2", "x-total": "125" })).toBe(2)
    expect(ActionsCursor.total({ "x-next-page": "2", "x-total": "125" })).toBe(125)
    expect(ActionsCursor.next({ "x-next-page": "100000" })).toBe(100_000)
    expect(
      ActionsCursor.next({
        "x-next-page": "",
        link: '<https://gitlab.example/api/v4/projects/1/pipelines?page=2>; rel="next"',
      }),
    ).toBeUndefined()
    expect(
      ActionsCursor.next({ "x-next-page": "4", link: '<https://gitlab.example/pipelines?page=2>; rel="next"' }),
    ).toBe(4)
    expect(ActionsCursor.total({})).toBeUndefined()
    expect(ActionsCursor.total({ "x-total": "0" })).toBe(0)
    expect(ActionsCursor.total({ "x-total": String(Number.MAX_SAFE_INTEGER) })).toBe(Number.MAX_SAFE_INTEGER)
  })

  test.each(["0", "-1", "1.5", " 2", "2 ", "+2", "02", "NaN", "Infinity", "100001", "9007199254740992"])(
    "invalid explicit next %j fails rather than falling back to valid Link",
    (next) => {
      failure(
        () => ActionsCursor.next({ "x-next-page": next, link: '<https://api.github.com/runs?page=2>; rel="next"' }),
        "transport_failed",
      )
    },
  )

  test.each(["", "-1", "1.5", " 2", "2 ", "+2", "NaN", "Infinity", "9007199254740992"])(
    "invalid explicit total %j is named failure, never unknown or zero",
    (total) => {
      failure(() => ActionsCursor.total({ "x-total": total }), "transport_failed")
    },
  )

  test.each([
    '<https://api.github.com/runs>; rel="next"',
    '<https://api.github.com/runs?page=0>; rel="next"',
    '<https://api.github.com/runs?page=100001>; rel="next"',
    '<https://api.github.com/runs?page=two>; rel="next"',
    'https://api.github.com/runs?page=2; rel="next"',
    '<https://[invalid/runs?page=2>; rel="next"',
  ])("invalid Link next %j fails closed", (link) => {
    failure(() => ActionsCursor.next({ link }), "transport_failed")
  })
})

describe("ActionsCursor page size", () => {
  test("uses default and inclusive valid boundaries", () => {
    expect(ActionsCursor.limit()).toBe(50)
    expect(ActionsCursor.limit(1)).toBe(1)
    expect(ActionsCursor.limit(25)).toBe(25)
    expect(ActionsCursor.limit(100)).toBe(100)
  })

  test.each([0, -1, 1.5, 101, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page size %j before sending",
    (limit) => {
      failure(() => ActionsCursor.limit(limit), "invalid_input")
    },
  )
})

function failure(run: () => unknown, kind: Actions.ErrorKind) {
  const error = Effect.runSync(Effect.try({ try: run, catch: (error) => error }).pipe(Effect.flip))
  expect(error).toBeInstanceOf(ActionsError)
  expect(error).toMatchObject({
    _tag: "ActionsError",
    kind,
    ...(kind === "invalid_input" ? { disposition: "definitely_unsent" } : {}),
  })
}

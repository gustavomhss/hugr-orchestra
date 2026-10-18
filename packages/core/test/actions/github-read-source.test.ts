import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Effect } from "effect"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubReadFixture
const route = `repositories/9347/contents/${f.workflow.path}?ref=${f.sha}`

it.effect("exact 40/64-hex refs reconcile commit identity case-insensitively before contents", Effect.gen(function* () {
  for (const ref of [f.sha, "a".repeat(64)]) {
    for (const [requested, resolved] of [[ref.toUpperCase(), ref], [ref, ref.toUpperCase()]]) {
      const version = createHash(ref.length === 40 ? "sha1" : "sha256").update(`blob ${Buffer.byteLength(f.text)}\0`).update(f.text).digest("hex").toUpperCase()
      const fixture = f.recorded({ [`repositories/9347/commits/${requested}`]: f.response({ sha: resolved }),
        [`repositories/9347/contents/${f.workflow.path}?ref=${resolved}`]: f.response({ ...f.content, sha: version }) })
      expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: requested }))
        .toMatchObject({ ref: requested, commit: resolved, version, text: f.text })
    }
  }
}))

it.effect("different resolved commit for exact 40/64-hex ref rejects before any contents read", Effect.gen(function* () {
  for (const requested of [f.sha.toUpperCase(), "a".repeat(64)]) {
    const resolved = "f".repeat(requested.length)
    const fixture = f.recorded({ [`repositories/9347/commits/${requested}`]: f.response({ sha: resolved }),
      [`repositories/9347/contents/${f.workflow.path}?ref=${resolved}`]: f.response({ ...f.content,
        sha: createHash(requested.length === 40 ? "sha1" : "sha256").update(`blob ${Buffer.byteLength(f.text)}\0`).update(f.text).digest("hex") }) })
    expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: requested }).pipe(Effect.flip))
      .toMatchObject({ kind: "source_conflict", bindingID: f.binding.id })
    expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", `repositories/9347/commits/${requested}`])
  }
}))

it.effect("valid source at a reused mutable repository path cannot replace immutable repository A", Effect.gen(function* () {
  const fixture = f.pathReuse()
  expect(fixture.second.content.content).not.toBe(f.content.content)
  expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" }))
    .toMatchObject({ text: f.text, commit: f.sha, version: f.content.sha })
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", "repositories/9347/commits/main", route])
}))

it.effect("SHA-256 repository source keeps full commit/blob IDs and verifies native blob bytes", Effect.gen(function* () {
  const commit = "a".repeat(64)
  const version = createHash("sha256").update(`blob ${Buffer.byteLength(f.text)}\0`).update(f.text).digest("hex")
  const fixture = f.recorded({ "repositories/9347/commits/main": f.response({ sha: commit }),
    [`repositories/9347/contents/${f.workflow.path}?ref=${commit}`]: f.response({ ...f.content, sha: version }) })
  expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" }))
    .toMatchObject({ commit, version, text: f.text })
}))

it.effect("native source branch race pins content to first resolved commit and keeps UTF-8/BOM/comments", Effect.gen(function* () {
  const fixture = f.recorded({ "repositories/9347/commits/feature%2Fbuild": f.response({ sha: f.sha }),
    [route]: f.response(f.content),
    [`repositories/9347/contents/${f.workflow.path}?ref=feature%2Fbuild`]: f.response({ ...f.content, sha: "f".repeat(40) }) })
  const source = yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "feature/build" })
  expect(source).toEqual({ bindingID: f.binding.id, path: f.workflow.path, ref: "feature/build", commit: f.sha,
    version: f.content.sha, text: f.text, editable: false })
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", "repositories/9347/commits/feature%2Fbuild", route])
}))

it.effect("unknown full source, wrong path, invalid Base64, byte mismatch, UTF-8 and bounded sizes fail named", Effect.gen(function* () {
  for (const [data, kind] of [
    [{ ...f.content, type: "symlink", target: "elsewhere.yml" }, "source_unresolved"],
    [{ ...f.content, submodule_git_url: "https://external.test" }, "source_unresolved"],
    [{ ...f.content, encoding: "none", content: "" }, "source_unresolved"],
    [{ ...f.content, path: "another.yml" }, "source_unresolved"],
    [{ ...f.content, sha: "f".repeat(40) }, "source_unresolved"],
    [{ ...f.content, content: "bad!" }, "source_unresolved"],
    [{ ...f.content, content: "Zh==", size: 1 }, "source_unresolved"],
    [{ ...f.content, content: "Zg==", size: 2 }, "source_unresolved"],
    [{ ...f.content, content: "/w==", size: 1, sha: createHash("sha1").update("blob 1\0").update(Buffer.from([255])).digest("hex") }, "source_unresolved"],
    [{ ...f.content, size: 1048577 }, "metadata_truncated"],
  ] as const) {
    const fixture = f.recorded({ "repositories/9347/commits/main": f.response({ sha: f.sha }), [route]: f.response(data) })
    expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind })
  }
}))

it.effect("unsafe source paths fail before API; commit metadata cannot silently become a branch read", Effect.gen(function* () {
  const fixture = f.recorded({ "repositories/9347/commits/main": f.response({ sha: "not-a-sha" }) })
  for (const path of ["/absolute", "../workflow.yml", "x/../y", "{path}", "x%2Fy", "x\\y", ":path", "x\u0000y"]) {
    expect(yield* fixture.adapter.source(f.binding, { path, ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  expect(fixture.calls).toEqual([])
  expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347", "repositories/9347/commits/main"])
}))

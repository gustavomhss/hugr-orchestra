import { expect, test } from "bun:test"
import { join } from "node:path"
import profile from "../src/tools/profile.ts"
import { fixture, result } from "./fixtures.governance.ts"
import { rethrow } from "./rejection.ts"
test("profile preferences persist without granting permissions, projects remain isolated", async () => {
  const f = await fixture()
  const absent = result<{ exists: boolean }>(await profile.handler({}, f.context))
  expect(absent.exists).toBe(false)
  await profile.handler({ action: "set", patch: { scrutiny: "balanced", neverTouch: ["owned.ts"] } }, f.context)
  const saved = result<{ profile: { scrutiny: string; waiverAuthority: string }; permissionOwner: string }>(await profile.handler({}, f.context))
  expect(saved.profile.scrutiny).toBe("balanced")
  expect(saved.profile.waiverAuthority).toBe("human-only")
  expect(saved.permissionOwner).toBe("native-host")
  expect(f.permissions.some((request) => request.effect === "write")).toBe(true)
  expect(result<{ exists: boolean }>(await profile.handler({}, { ...f.context, projectID: "second" })).exists).toBe(false)
  expect(await Bun.file(join(f.root, ".techlead", "profile", "profile.json")).exists()).toBe(false)
})
test("profile refuses malformed patch, unreadable state and host-root override", async () => {
  const f = await fixture()
  await profile.handler({ action: "set", patch: { scrutiny: "strict" } }, f.context)
  expect(await rethrow(profile.handler({ action: "set", patch: { waiverAuthority: "model" as "human-only" } }, f.context))).toThrow("PROFILE_WAIVER_AUTHORITY_INVALID")
  expect(await rethrow(profile.handler({ sourceRoot: f.state }, f.context))).toThrow("SOURCE_ROOT_OVERRIDE_DENIED")
  await Bun.write(join(f.state, "project", "profile", "preferences.json"), "broken")
  expect(await rethrow(profile.handler({}, f.context))).toThrow("STATE_JSON_INVALID")
})
test("denied native write blocks profile state creation", async () => {
  const f = await fixture()
  expect(await rethrow(profile.handler({ action: "set", patch: { scrutiny: "vibe" } }, { ...f.context, async authorize(request) { if (request.effect === "write") throw new Error("HOST_DENIED") } }))).toThrow("HOST_DENIED")
  expect(await Bun.file(join(f.state, "project", "profile", "preferences.json")).exists()).toBe(false)
})

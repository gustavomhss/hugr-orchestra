import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { resourcePayload } from "./resource-payload"

const form = (values: Record<string, string>) => {
  const data = new FormData()
  Object.entries(values).forEach(([name, value]) => data.append(name, value))
  return data
}

test("GitLab edits preserve unknown create-only hidden and exact replacement secret", () => {
  for (const hidden of [undefined, false, true]) {
    const resource = Actions.Resource.make({ id: "TOKEN", bindingID: Actions.BindingID.make("ab_payload"), name: "TOKEN", kind: "variables",
      scope: "production/*", sensitive: true, data: { masked: true, ...(hidden === undefined ? {} : { hidden }) } })
    const data = form({ name: "TOKEN", scope: "production/*", type: "Secret", value: " 0007\nfalse=✓ ", masked: "on", hidden: "on" })
    expect(resourcePayload(data, { provider: "gitlab", kind: "edit-variable", resource }))
      .toEqual({ provider: "gitlab", name: "TOKEN", scope: "production/*", type: "Secret", value: " 0007\nfalse=✓ ", protected: false, masked: true })
    expect(data.get("value")).toBe(" 0007\nfalse=✓ ")
  }
  expect(resourcePayload(form({ hidden: "on", protected: "on", masked: "on" }), { provider: "github", kind: "create-variable" })).toEqual({ provider: "github" })
})

test("ordinary schedule edits preserve redacted overrides; explicit replacement can clear", () => {
  const fields = { name: "Nightly", cron: "0 2 * * *", zone: "UTC", ref: "release" }
  for (const input of ["", "TOKEN=secret"]) expect(resourcePayload(form({ ...fields, input }), { provider: "gitlab", kind: "edit-schedule" })).toEqual({ provider: "gitlab", ...fields })
  expect(resourcePayload(form({ ...fields, input: "TOKEN= 0007\nfalse ", replaceOverrides: "on" }), { provider: "gitlab", kind: "edit-schedule" }))
    .toEqual({ provider: "gitlab", ...fields, input: "TOKEN= 0007\nfalse " })
  expect(resourcePayload(form({ ...fields, input: "", replaceOverrides: "on" }), { provider: "gitlab", kind: "edit-schedule" }))
    .toEqual({ provider: "gitlab", ...fields, input: "" })
})

test("blank optional numbers omit; supported values convert while invalid files never serialize", () => {
  expect(resourcePayload(form({ timer: "", preventSelfReview: "on" }), { provider: "github", kind: "edit-environment" }))
    .toEqual({ provider: "github", preventSelfReview: true })
  expect(resourcePayload(form({ timer: "0" }), { provider: "github", kind: "edit-environment" }).timer).toBe(0)
  expect(resourcePayload(form({ runnerGroupID: "42" }), { provider: "github", kind: "create-runner" }).runnerGroupID).toBe(42)
  expect(() => resourcePayload(form({ timer: "NaN" }), { provider: "github", kind: "edit-environment" })).toThrow("invalid_input")
  const data = new FormData()
  data.set("value", new File(["private"], "private.txt"))
  expect(() => resourcePayload(data, { provider: "github", kind: "create-variable" })).toThrow("invalid_input")
})

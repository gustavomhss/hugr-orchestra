import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { artifactMetadata } from "./artifact-metadata"

const row = (data: Actions.Resource["data"], status?: string, scope?: string) => Actions.Resource.make({ id: "101",
  bindingID: Actions.BindingID.make("ab_artifact"), kind: "artifacts", name: "build.zip", data, status, scope })

test("native artifact ownership, numeric bytes and nullable retention project without display fallbacks", () => {
  expect(artifactMetadata(row({ workflow_run: { id: "900719925474099312345" }, size_in_bytes: 0, expires_at: "2099-01-01T00:00:00Z" }, "available", "123")))
    .toEqual({ runID: "900719925474099312345", sizeBytes: 0, expiresAt: "2099-01-01T00:00:00Z", available: true, expired: false, erased: false })
  expect(artifactMetadata(row({ pipeline: { id: 42 }, artifacts_file: { size: 2048 }, artifacts_expire_at: null, erased_at: null }, "available", "84")))
    .toEqual({ runID: "42", sizeBytes: 2048, expiresAt: null, available: true, expired: false, erased: false })
  expect(artifactMetadata(row({ runID: "123", size: "10 MB", expiry: "Kept" }, "unknown", "project:123")))
    .toEqual({ available: false, expired: false, erased: false })
})

test("unknown, erased and expired evidence never permits transfer", () => {
  expect(artifactMetadata(row({ expired: true }, "available")).available).toBe(false)
  expect(artifactMetadata(row({ erased_at: "2026-01-01T00:00:00Z" }, "available")).available).toBe(false)
  expect(artifactMetadata(row({}, "expired"))).toMatchObject({ available: false, expired: true })
  expect(artifactMetadata(row({ status: "available" })).available).toBe(false)
  expect(artifactMetadata(row({}, "available")).available).toBe(true)
})

test("run IDs stay canonical and byte counts retain unknown rather than coercing malformed data", () => {
  expect(artifactMetadata(row({}, undefined, "42")).runID).toBe("42")
  for (const scope of ["Repository", "project:42", "0", "01", "1\n", "1e3"]) expect(artifactMetadata(row({}, undefined, scope)).runID).toBeUndefined()
  for (const id of [0, -1, Number.MAX_SAFE_INTEGER + 1, "01", "1\n"]) expect(artifactMetadata(row({ pipeline: { id } })).runID).toBeUndefined()
  for (const size of [-1, 0.5, "0", null]) expect(artifactMetadata(row({ size_in_bytes: size })).sizeBytes).toBeUndefined()
})

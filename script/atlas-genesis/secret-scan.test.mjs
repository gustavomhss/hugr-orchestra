import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { credentialValues, findCredentialFiles } from "./secret-scan.mjs"

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-secret-scan-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

// The production and mutation cases share this exact lone-token oracle.
export function assertLoneAccessToken(scan, dir) {
  const file = join(dir, "access.txt")
  writeFileSync(file, "synthetic-access-value-12345678")
  assert.deepEqual(scan([file], { secrets: '{"access_token":"synthetic-access-value-12345678"}' }), [file])
}

test("compact JSON detects a lone access token without its JSON wrapper", (t) => {
  assertLoneAccessToken(findCredentialFiles, fixture(t))
})

test("JSON objects, arrays and pretty JSON retain raw values and nested string leaves", (t) => {
  const dir = fixture(t)
  const data = { nested: { refreshToken: "synthetic-refresh-12345678" }, values: ["synthetic-array-12345678", "short", 123, null] }
  for (const text of [JSON.stringify(data), JSON.stringify(data, null, 2), JSON.stringify(data.values)]) {
    const values = credentialValues(text)
    assert.ok(values.includes(text))
    assert.ok(values.includes(data.values[0]))
    assert.ok(!values.includes("short"))
    assert.equal(values.length, new Set(values).size)
  }
  const secrets = JSON.stringify(data, null, 2)
  const nested = join(dir, "nested")
  mkdirSync(nested)
  writeFileSync(join(nested, "refresh.txt"), data.nested.refreshToken)
  writeFileSync(join(dir, "array.txt"), data.values[0])
  assert.deepEqual(findCredentialFiles([dir], { secrets }).sort(), [join(dir, "array.txt"), join(nested, "refresh.txt")].sort())
})

test("legacy newline values remain exact and credential-free artifacts stay clean", (t) => {
  const dir = fixture(t)
  const hit = join(dir, "hit.txt")
  const clean = join(dir, "clean.txt")
  const secrets = "  synthetic-legacy-12345678  \nsynthetic-other-12345678\nsynthetic-other-12345678\ntiny"
  writeFileSync(hit, "synthetic-legacy-12345678")
  writeFileSync(clean, "a credential-free artifact with only a partial synthetic-legacy value")
  assert.deepEqual(findCredentialFiles([hit, clean], { secrets }), [hit])
  assert.deepEqual(findCredentialFiles([clean], { secrets }), [])
  assert.equal(credentialValues(secrets).filter((value) => value === "synthetic-other-12345678").length, 1)
  const empty = join(dir, "empty")
  mkdirSync(empty)
  assert.deepEqual(findCredentialFiles([empty]), [])
})

test("Anthropic, OAuth and Bearer labeled shapes still detect synthetic credentials", (t) => {
  const dir = fixture(t)
  const paths = ["sk-ant-synthetic12345678", "oauth_token: synthetic1234567890123456", "Bearer synthetic1234567890123456"].map((text, index) => {
    const file = join(dir, `${index}.txt`)
    writeFileSync(file, text)
    return file
  })
  assert.deepEqual(findCredentialFiles(paths), paths)
})

test("each call rereads current auth JSON while retaining supplied secrets", (t) => {
  const dir = fixture(t)
  const authFile = join(dir, "auth.json")
  const file = join(dir, "artifact.txt")
  const oldToken = "synthetic-old-auth-12345678"
  const newToken = "synthetic-new-auth-12345678"
  writeFileSync(authFile, JSON.stringify({ access_token: oldToken }))
  writeFileSync(file, newToken)
  assert.deepEqual(findCredentialFiles([file], { authFile }), [])
  writeFileSync(authFile, JSON.stringify({ nested: { refreshToken: newToken } }))
  assert.deepEqual(findCredentialFiles([file], { authFile }), [file])
  writeFileSync(file, oldToken)
  assert.deepEqual(findCredentialFiles([file], { authFile }), [])
  assert.deepEqual(findCredentialFiles([file], { authFile, secrets: oldToken }), [file])
})

test("explicit missing, unreadable and malformed auth files fail with fixed secret-free errors", (t) => {
  const dir = fixture(t)
  const artifact = join(dir, "artifact.txt")
  const malformed = join(dir, "malformed.json")
  writeFileSync(artifact, "credential-free artifact")
  writeFileSync(malformed, '{"access_token":"synthetic-private-12345678"')
  // A directory cannot be read as an auth JSON file, including when CI runs as root.
  for (const authFile of [join(dir, "missing.json"), dir, malformed]) {
    assert.throws(() => findCredentialFiles([artifact], { authFile }), (error) => {
      assert.equal(error.name, "SecretScanAuthError")
      assert.equal(error.message, "secret-scan: auth file unavailable or invalid")
      assert.equal(error.cause, undefined)
      return true
    })
  }
})

test("missing artifact paths and no paths fail explicitly", (t) => {
  const dir = fixture(t)
  assert.throws(() => findCredentialFiles([join(dir, "missing")]), { name: "SecretScanArtifactError" })
  assert.throws(() => findCredentialFiles([]), { name: "SecretScanInputError" })
})

test("the shared lone-token oracle rejects the old raw-JSON-only extraction", async (t) => {
  const source = readFileSync(new URL("./secret-scan.mjs", import.meta.url), "utf8")
  const mutation = source.replace("collect(JSON.parse(text))", "JSON.parse(text)")
  assert.notEqual(mutation, source, "mutation must alter production extraction")
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(mutation).toString("base64")}`)
  assertLoneAccessToken(findCredentialFiles, fixture(t))
  assert.throws(() => assertLoneAccessToken(mutant.findCredentialFiles, fixture(t)), { name: "AssertionError" })
})

import { expect, test } from "bun:test"
import { ReviewNativeSarif } from "../../src/review-toolkit/native-sarif"

const options: ReviewNativeSarif.Options = {
  pack: "fixture", version: "1.0.0", root: "C:\\projection",
  paths: [{ file: "src\\input.js", path: "src\\original.js" }], rules: ["rule"],
}
const report = (uri = "src/input.js") => JSON.stringify({
  version: "2.1.0", runs: [{ tool: { driver: { name: "fixture", version: "1.0.0" } }, results: [{
    ruleId: "rule", message: { text: "finding" }, locations: [{ physicalLocation: {
      artifactLocation: { uri }, region: { startLine: 1 },
    } }],
  }] }],
})

test("native mapping validates Windows containment and maps normalized SARIF paths", () => {
  expect(ReviewNativeSarif.parse(report("src/input%20file.js"), options).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report(), { ...options, paths: [{ file: "src/input.js", path: "..\\outside" }] }).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report(), { ...options, paths: [{ file: "src/input.js", path: "\\\\server\\share" }] }).status).toBe("acquisition-error")
})

test("native URI decoding preserves literal POSIX backslashes", () => {
  const posix: ReviewNativeSarif.Options = { pack: "fixture", version: "1.0.0", root: "/native", paths: [{ file: "literal\\name.js", path: "source\\name.js" }], rules: ["rule"] }
  expect(ReviewNativeSarif.parse(report("literal\\name.js"), posix)).toMatchObject({ status: "ok", results: [{ path: "source\\name.js" }] })
  expect(ReviewNativeSarif.parse(report("literal%5Cname.js"), posix)).toMatchObject({ status: "ok", results: [{ path: "source\\name.js" }] })
  expect(ReviewNativeSarif.parse(report("literal%ZZ.js"), posix).status).toBe("acquisition-error")
})

test("native URI decoding rejects encoded separators and file authority aliases", () => {
  const posix: ReviewNativeSarif.Options = { pack: "fixture", version: "1.0.0", root: "/native", paths: [{ file: "foo/bar", path: "source.js" }], rules: ["rule"] }
  expect(ReviewNativeSarif.parse(report("foo%2Fbar"), posix).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report("file://evil/native/foo/bar"), posix).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report("foo%25bar"), { ...posix, paths: [{ file: "foo%bar", path: "source.js" }] })).toMatchObject({ status: "ok" })
})

test("native UNC file URI authority separators cannot alias the trusted share", () => {
  const unc: ReviewNativeSarif.Options = { pack: "fixture", version: "1.0.0", root: "\\\\server\\share", paths: [{ file: "a.js", path: "src/a.js" }], rules: ["rule"] }
  expect(ReviewNativeSarif.parse(report("file://server/share/a.js"), unc)).toMatchObject({ status: "ok", results: [{ path: "src/a.js" }] })
  expect(ReviewNativeSarif.parse(report("file://server%2Fshare/a.js"), unc).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report("file://server%5Cshare/a.js"), unc).status).toBe("acquisition-error")
})

test("native file URIs reject pre-normalization traversal and non-file scheme aliases", () => {
  const posix: ReviewNativeSarif.Options = { pack: "fixture", version: "1.0.0", root: "/native", paths: [{ file: "a.js", path: "src/a.js" }], rules: ["rule"] }
  expect(ReviewNativeSarif.parse(report("file:///native/../native/a.js"), posix).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report("file:///native/%2e%2e/native/a.js"), posix).status).toBe("acquisition-error")
  expect(ReviewNativeSarif.parse(report("file:///native/a.js"), posix)).toMatchObject({ status: "ok", results: [{ path: "src/a.js" }] })
  expect(ReviewNativeSarif.parse(report("https://host/native/a.js"), posix).status).toBe("acquisition-error")
})

test("native host context rejects Windows device namespaces and validates notification levels", () => {
  const windows: ReviewNativeSarif.Options = { ...options, root: "C:\\projection", paths: [{ file: "src\\input.js", path: "src\\original.js" }] }
  for (const root of ["\\\\?\\C:\\projection", "\\\\.\\C:\\projection"]) {
    expect(ReviewNativeSarif.parse(report("src/input.js"), { ...windows, root }).status).toBe("acquisition-error")
  }
  expect(ReviewNativeSarif.parse(report("src/input.js"), { ...windows, paths: [{ file: "\\\\?\\C:\\projection\\input.js", path: "src\\original.js" }] }).status).toBe("acquisition-error")
  const base = JSON.parse(report("src/input.js"))
  const withNote = { ...base, runs: [{ ...base.runs[0], invocations: [{ toolExecutionNotifications: [{ level: "note", message: { text: "informational" } }] }] }] }
  expect(ReviewNativeSarif.parse(JSON.stringify(withNote), { ...options, paths: [{ file: "src/input.js", path: "src/original.js" }] }).status).toBe("ok")
  const withInvalidLevel = { ...base, runs: [{ ...base.runs[0], invocations: [{ toolExecutionNotifications: [{ level: "unexpected" }] }] }] }
  expect(ReviewNativeSarif.parse(JSON.stringify(withInvalidLevel), { ...options, paths: [{ file: "src/input.js", path: "src/original.js" }] }).status).toBe("acquisition-error")
})

test("opaque projection preserves normalized SARIF finding metadata", () => {
  const input = JSON.parse(report("src/input.js"))
  const row = input.runs[0].results[0]
  row.fingerprints = { stable: "fp-value" }
  row.suppressions = [{ kind: "external", status: "accepted", justification: "fixture" }]
  row.locations[0].physicalLocation.region.snippet = { text: "source snippet" }
  expect(ReviewNativeSarif.parse(JSON.stringify(input), { ...options, paths: [{ file: "src/input.js", path: "src/original.js" }] })).toMatchObject({
    status: "ok",
    results: [{ path: "src/original.js", snippet: "source snippet", toolFingerprint: '[["stable","fp-value"]]', suppressions: [{ kind: "external", status: "accepted", justification: "fixture" }] }],
  })
})

test("native envelope rejects malformed invocation shapes and preserves encoded normalized paths", () => {
  const valid = JSON.parse(report("src/input%20file.js"))
  const encodedOptions = { ...options, paths: [{ file: "src/input file.js", path: "src/original.js" }] }
  expect(ReviewNativeSarif.parse(JSON.stringify(valid), encodedOptions)).toMatchObject({ status: "ok", results: [{ path: "src/original.js" }] })
  for (const invocations of ["bad", [null], [{ toolExecutionNotifications: {} }], [{ executionSuccessful: "yes" }]]) {
    expect(ReviewNativeSarif.parse(JSON.stringify({ ...valid, runs: [{ ...valid.runs[0], invocations }] }), encodedOptions).status).toBe("acquisition-error")
  }
})

import { describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { ServerAuth } from "../src/auth"

const config = { username: "orchestra", password: Option.some("s3cret:with-colon") }
const attempt = (username: string, password: string) =>
  ServerAuth.authorized({ username, password: Redacted.make(password) }, config)

describe("ServerAuth.authorized", () => {
  test("accepts the configured username and password", () => {
    expect(attempt("orchestra", "s3cret:with-colon")).toBe(true)
  })

  test("refuses a wrong password, including a prefix, an extension and an empty one", () => {
    for (const password of ["wrong", "s3cret", "s3cret:with-colon!", "S3CRET:WITH-COLON", ""])
      expect(attempt("orchestra", password)).toBe(false)
  })

  test("refuses a wrong username even with the right password", () => {
    expect(attempt("intruder", "s3cret:with-colon")).toBe(false)
    expect(attempt("", "s3cret:with-colon")).toBe(false)
  })

  test("refuses everything when no password is configured", () => {
    expect(ServerAuth.authorized({ username: "orchestra", password: Redacted.make("") }, { ...config, password: Option.none() })).toBe(false)
  })
})

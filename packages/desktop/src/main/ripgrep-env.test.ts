import { expect, test } from "bun:test"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { ripgrepEnv } from "./ripgrep-env"

test("a packaged desktop's server never downloads rg; a checkout run keeps the bounded download", () => {
  expect(Object.keys(ripgrepEnv(true))).toEqual([RipgrepBinary.DISABLE_DOWNLOAD])
  expect(RipgrepBinary.defaults(ripgrepEnv(true)).download).toBe(false)
  expect(ripgrepEnv(false)).toEqual({})
  expect(RipgrepBinary.defaults(ripgrepEnv(false)).download).toBe(true)
})

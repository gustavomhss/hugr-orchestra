import { expect, test } from "bun:test"
import { join } from "node:path"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { ripgrepEnv } from "./ripgrep-env"

test("a packaged desktop's server runs the rg in Resources/cli and never downloads; a checkout run keeps the download", () => {
  const env = ripgrepEnv(true, "/App/Contents/Resources", "darwin", "arm64")
  expect(env).toEqual({ [RipgrepBinary.DIRECTORY]: join("/App/Contents/Resources", "cli", "ripgrep-darwin-arm64") })
  // The server's RipgrepBinary takes it as its packaged directory: it runs that rg, else PATH, and never downloads.
  expect(RipgrepBinary.defaults(env).bundled).toBe(join("/App/Contents/Resources", "cli", "ripgrep-darwin-arm64"))
  expect(ripgrepEnv(true, "C:\\App\\resources", "win32", "x64")).toEqual({
    [RipgrepBinary.DIRECTORY]: join("C:\\App\\resources", "cli", "ripgrep-windows-x64-baseline"),
  })
  expect(ripgrepEnv(false, "/App/Contents/Resources")).toEqual({})
  expect(RipgrepBinary.defaults(ripgrepEnv(false, "/App/Contents/Resources")).bundled).toBeUndefined()
})

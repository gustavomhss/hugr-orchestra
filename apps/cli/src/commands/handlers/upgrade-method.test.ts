import { describe, expect, test } from "bun:test"
import { upgradeCommand, upgradeMethod } from "./upgrade-method"

describe("upgradeMethod", () => {
  const cases = [
    ["/Users/me/.orchestra/bin/orchestra", "curl"],
    ["/home/me/.local/bin/orchestra", "curl"],
    ["/Applications/HuGR Orchestra.app/Contents/Resources/cli/orchestra", "desktop"],
    ["C:\\Users\\me\\AppData\\Local\\Programs\\app\\resources\\cli\\orchestra.exe", "desktop"],
    ["/usr/local/lib/node_modules/@humanguardrail/cli-darwin-arm64/bin/orchestra", "npm"],
    ["/Users/me/Library/pnpm/global/5/node_modules/@humanguardrail/cli/bin/orchestra", "pnpm"],
    ["/Users/me/.bun/install/global/node_modules/@humanguardrail/cli/bin/orchestra", "bun"],
    ["/Users/me/.config/yarn/global/node_modules/@humanguardrail/cli/bin/orchestra", "yarn"],
    ["/opt/somewhere/orchestra", "unknown"],
  ] as const

  test.each(cases)("%s is %s", (execPath, expected) => {
    expect(upgradeMethod(execPath)).toBe(expected)
  })

  test("package managers get their own global install command and the rest get none", () => {
    expect(upgradeCommand("pnpm", "p@1")).toEqual(["pnpm", "add", "-g", "p@1"])
    expect(upgradeCommand("bun", "p@1")).toEqual(["bun", "add", "-g", "p@1"])
    expect(upgradeCommand("yarn", "p@1")).toEqual(["yarn", "global", "add", "p@1"])
    expect(upgradeCommand("npm", "p@1")).toEqual(["npm", "install", "-g", "p@1"])
    expect(upgradeCommand("unknown", "p@1")).toBeUndefined()
    expect(upgradeCommand("curl", "p@1")).toBeUndefined()
  })
})

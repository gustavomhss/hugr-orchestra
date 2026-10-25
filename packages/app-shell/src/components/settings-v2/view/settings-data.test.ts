import { describe, expect, test } from "bun:test"
import {
  contextLabel,
  permissionAction,
  permissionLock,
  permissionRules,
  permissionWrite,
  SETTINGS_SECTIONS,
  settingsSection,
} from "./settings-data"

describe("settings sections", () => {
  test("accepts known sections and falls back to general", () => {
    expect(settingsSection("models")).toBe("models")
    expect(settingsSection("servers")).toBe("servers")
    expect(settingsSection("nope")).toBe("general")
    expect(settingsSection(undefined)).toBe("general")
  })

  test("lists the dialog's tabs first, in the dialog's order", () => {
    expect(SETTINGS_SECTIONS.slice(0, 5)).toEqual(["general", "shortcuts", "servers", "providers", "models"])
  })
})

// Rules as the server's config holds them: action, resource, effect.
const rule = (action: string, resource: string, effect: "allow" | "ask" | "deny") => ({ action, resource, effect })

describe("permission defaults", () => {
  test("permission defaults finish on repeated-star rules", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `import { permissionAction } from ${JSON.stringify(new URL("./settings-data.ts", import.meta.url).href)};
         console.log(permissionAction([{ action: "*".repeat(32) + "z", resource: "*", effect: "deny" }], "external_directory"));`,
      ],
      { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" },
    )
    const timer = setTimeout(() => child.kill(), 5_000)
    expect(await child.exited.finally(() => clearTimeout(timer))).toBe(0)
    expect((await new Response(child.stdout).text()).trim()).toBe("ask")
  })

  test("an empty config follows the server's built-in rules", () => {
    expect(permissionAction([], "read")).toBe("allow")
    expect(permissionAction([], "bash")).toBe("allow")
    expect(permissionAction([], "doom_loop")).toBe("allow")
    expect(permissionAction([], "external_directory")).toBe("ask")
  })

  test("the last matching rule wins and wildcards match tool names", () => {
    expect(permissionAction([rule("*", "*", "deny"), rule("bash", "*", "ask")], "bash")).toBe("ask")
    expect(permissionAction([rule("bash", "*", "ask"), rule("*", "*", "deny")], "bash")).toBe("deny")
    expect(permissionAction([rule("*", "*", "deny"), rule("bash", "*", "ask")], "read")).toBe("deny")
    expect(permissionAction([rule("*", "*", "deny")], "external_directory")).toBe("deny")
    expect(permissionAction([rule("web*", "*", "deny")], "webfetch")).toBe("deny")
    expect(permissionAction([rule("web*", "*", "deny")], "bash")).toBe("allow")
    expect(permissionAction([rule("web?etch", "*", "deny")], "webfetch")).toBe("deny")
    expect(permissionAction([rule("WEBFETCH", "*", "deny")], "webfetch")).toBe("allow")
    expect(permissionAction([rule("web\\*", "*", "deny")], "webfetch")).toBe("allow")
  })

  test('only rules that cover every input ("*") decide the default', () => {
    expect(permissionAction([rule("read", "*", "deny"), rule("read", "*.md", "allow")], "read")).toBe("deny")
    expect(permissionAction([rule("read", "*.env", "ask")], "read")).toBe("allow")
    expect(permissionAction([rule("read", "*.env", "deny"), rule("read", "*", "ask")], "read")).toBe("ask")
  })

  test("drops malformed rules and keeps the order of the rest", () => {
    expect(
      permissionRules([
        rule("bash", "*", "ask"),
        { action: "bash", resource: "*", effect: "maybe" },
        { action: 3, resource: "*", effect: "deny" },
        "deny",
        rule("*", "*", "deny"),
      ]),
    ).toEqual([rule("bash", "*", "ask"), rule("*", "*", "deny")])
    expect(permissionRules({ bash: "ask" })).toEqual([])
    expect(permissionRules(undefined)).toEqual([])
  })
})

describe("permission writes", () => {
  test("rewrites a tool's rule in place and appends new tools", () => {
    expect(permissionWrite([rule("*", "*", "ask"), rule("read", "*", "allow")], "bash", "deny")).toEqual({
      next: [rule("*", "*", "ask"), rule("read", "*", "allow"), rule("bash", "*", "deny")],
    })
    expect(permissionWrite([rule("read", "*", "allow"), rule("*", "*", "ask")], "read", "ask")).toEqual({
      next: [rule("read", "*", "ask"), rule("*", "*", "ask")],
    })
  })

  test('changes the "*" rule of a patterned tool in place, keeping its patterns after it', () => {
    expect(permissionWrite([rule("read", "*", "allow"), rule("read", "*.env", "deny")], "read", "ask")).toEqual({
      next: [rule("read", "*", "ask"), rule("read", "*.env", "deny")],
    })
  })

  test("refuses a tool whose rules are all patterns", () => {
    expect(permissionWrite([rule("read", "*.env", "deny")], "read", "allow")).toEqual({ locked: "patterns" })
    expect(permissionLock([rule("read", "*.env", "deny")], "read")).toBe("patterns")
  })

  test("refuses a write that a later wildcard rule would override", () => {
    expect(permissionWrite([rule("bash", "*", "ask"), rule("*", "*", "deny")], "bash", "allow")).toEqual({
      locked: "shadowed",
    })
    expect(permissionLock([rule("bash", "*", "ask"), rule("*", "*", "deny")], "bash")).toBe("shadowed")
    expect(permissionLock([rule("*", "*", "deny"), rule("bash", "*", "ask")], "bash")).toBeUndefined()
    expect(permissionLock([rule("bash", "*", "ask"), rule("*", "*", "deny")], "read")).toBeUndefined()
  })
})

describe("context labels", () => {
  test("match the mock's notation", () => {
    expect(contextLabel(200_000)).toBe("200K")
    expect(contextLabel(400_000)).toBe("400K")
    expect(contextLabel(262_144)).toBe("256K")
    expect(contextLabel(1_000_000)).toBe("1M")
    expect(contextLabel(1_048_576)).toBe("1M")
    expect(contextLabel(128_500)).toBe("129K")
    expect(contextLabel(0)).toBeUndefined()
    expect(contextLabel(undefined)).toBeUndefined()
  })
})

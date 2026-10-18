import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { defaultResourceScope, resourceScopeOptions, resourceScopePage } from "./resource-scopes"

const bindingID = Actions.BindingID.make("ab_scopes")
const environment = (name: string): Actions.Resource => ({ id: name, name, bindingID, kind: "environments", data: {} })
const page = (items: readonly Actions.Resource[], extra: Partial<Actions.ResourcePage> = {}): Actions.ResourcePage => ({ items, capturedAt: 1, ...extra })

describe("native variable scope suggestions", () => {
  test("GitHub keeps repository and exact environment names without inventing a prefix", () => {
    expect(defaultResourceScope("github")).toBe("Repository")
    expect(resourceScopeOptions("github", ["production", "preview / 雪", "production"], ["retired", "production"]))
      .toEqual(["Repository", "production", "preview / 雪", "retired"])
    expect(resourceScopeOptions("github", [], ["Environment:literal-name"]))
      .toEqual(["Repository", "Environment:literal-name"])
  })

  test("GitLab defaults to native '*' and retains scopes absent from environment catalog", () => {
    expect(defaultResourceScope("gitlab")).toBe("*")
    expect(resourceScopeOptions("gitlab", ["production"], ["review/*", "future / ענף", "production", "*"]))
      .toEqual(["*", "production", "review/*", "future / ענף"])
    expect(resourceScopeOptions("gitlab", [], ["Repository"]))
      .toEqual(["*", "Repository"])
  })

  test("scope pages retain only names and report cursor or total truncation", () => {
    expect(resourceScopePage(page([{ ...environment("prod"), data: { readOnly: true, protectedPolicies: [{ name: "*" }] } }]), bindingID))
      .toEqual({ names: ["prod"], truncated: false })
    expect(resourceScopePage(page([environment("prod"), environment("prod")], { next: "next-page" }), bindingID))
      .toEqual({ names: ["prod"], truncated: true })
    expect(resourceScopePage(page([], { total: 2 }), bindingID)).toEqual({ names: [], truncated: true })
    expect(resourceScopePage(page([], { total: 0 }), bindingID)).toEqual({ names: [], truncated: false })
  })

  test("foreign binding, wrong kind, malformed names and oversized pages fail closed", () => {
    expect(() => resourceScopePage(page([{ ...environment("prod"), bindingID: Actions.BindingID.make("ab_other") }]), bindingID))
      .toThrow("binding_stale")
    expect(() => resourceScopePage(page([{ ...environment("prod"), kind: "variables" }]), bindingID))
      .toThrow("invalid_response")
    ;["", "  ", "prod\n", "x".repeat(1025)].forEach((name) => {
      expect(() => resourceScopePage(page([environment(name)]), bindingID)).toThrow("invalid_response")
    })
    expect(resourceScopePage(page(Array.from({ length: 30 }, (_, index) => environment(String(index)))), bindingID).names).toHaveLength(30)
    expect(() => resourceScopePage(page(Array.from({ length: 31 }, (_, index) => environment(String(index)))), bindingID))
      .toThrow("metadata_truncated")
  })
})

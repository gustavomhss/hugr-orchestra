// Source: TechLead mcp/src/onboard/profile.ts. Preferences never grant host permission.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { objectSchema, namesSchema, requireValue } from "../governance/contracts.ts"
import type { JsonSchema } from "../contract.ts"

export interface Profile {
  scrutiny: "strict" | "balanced" | "vibe"
  askBefore: string[]
  neverTouch: string[]
  riskTolerance: "low" | "medium" | "high"
  waiverAuthority: "human-only"
}
export const profileProperties: Record<string, JsonSchema> = {
  scrutiny: { type: "string", enum: ["strict", "balanced", "vibe"] },
  askBefore: namesSchema, neverTouch: namesSchema,
  riskTolerance: { type: "string", enum: ["low", "medium", "high"] },
  waiverAuthority: { const: "human-only" },
}
export const profileSchema = objectSchema(profileProperties)
export const PROFILE_QUESTIONS = [
  { key: "scrutiny", q: "Verification preference: strict, balanced, or vibe?" },
  { key: "askBefore", q: "Which actions need explicit operator intent?" },
  { key: "neverTouch", q: "Which path patterns should the host deny?" },
  { key: "riskTolerance", q: "Risk preference: low, medium, or high?" },
  { key: "waiverAuthority", q: "Rigor waivers remain human-only; host owns permissions." },
]
export function defaultProfile(scrutiny: Profile["scrutiny"] = "strict"): Profile {
  return {
    scrutiny,
    askBefore: scrutiny === "strict" ? ["push", "deploy", "delete", "db-migration", "publish"] : scrutiny === "balanced" ? ["push", "deploy", "delete"] : ["deploy", "delete"],
    neverTouch: [".env*", "**/secrets/**", "**/*.pem", "**/*.key"],
    riskTolerance: scrutiny === "strict" ? "low" : scrutiny === "balanced" ? "medium" : "high",
    waiverAuthority: "human-only",
  }
}
export function validateProfile(value: unknown): Profile {
  requireValue(value && typeof value === "object", "PROFILE_INVALID")
  const profile = value as Profile
  requireValue(Object.keys(profile).every((key) => key in profileProperties), "PROFILE_UNKNOWN_FIELD")
  requireValue(["strict", "balanced", "vibe"].includes(profile.scrutiny), "PROFILE_SCRUTINY_INVALID")
  requireValue(["low", "medium", "high"].includes(profile.riskTolerance), "PROFILE_RISK_INVALID")
  requireValue(profile.waiverAuthority === "human-only", "PROFILE_WAIVER_AUTHORITY_INVALID")
  ;[profile.askBefore, profile.neverTouch].forEach((list) => {
    requireValue(Array.isArray(list) && list.length <= 512 && list.every((item) => typeof item === "string" && item.length > 0 && item.length <= 4096), "PROFILE_LIST_INVALID")
  })
  return profile
}

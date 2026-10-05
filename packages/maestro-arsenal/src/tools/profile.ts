// Source: TechLead mcp/src/tools/profile.ts; native host alone owns permission enforcement.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { type GovernanceContext, text, requireValue } from "../governance/contracts.ts"
import { createHash } from "node:crypto"
import { sourceRoot, statePath, readBoundedBytes, updateState } from "../governance/state.ts"
import { type Profile, defaultProfile, validateProfile, PROFILE_QUESTIONS } from "../onboard/profile.ts"
import type { ToolDef } from "../contract.ts"
import { profileToolDescriptor } from "../governance/descriptors.ts"
export { profileToolDescriptor } from "../governance/descriptors.ts"

/** Same managed path as profile get/set. Missing preferences return null; reads never provision/write state. */
export async function readPreferences(context: GovernanceContext): Promise<Profile | null> {
  return (await readPreferencesSnapshot(context)).profile
}
export async function readPreferencesSnapshot(context: GovernanceContext) {
  await sourceRoot(context)
  const path = await statePath(context, "profile", "preferences")
  const bytes = await readBoundedBytes(path, true)
  if (bytes === undefined) return { profile: null, path, sourceDigest: null }
  const decode = () => {
    try { return JSON.parse(bytes.toString("utf8")) as unknown }
    catch { throw new Error("STATE_JSON_INVALID") }
  }
  return { profile: validateProfile(decode()), path, sourceDigest: createHash("sha256").update(bytes).digest("hex") }
}

export interface ProfileInput { sourceRoot?: string; action?: "get" | "set"; patch?: Partial<Profile> }
const tool: ToolDef<ProfileInput> = {
  ...profileToolDescriptor,
  async handler(input: ProfileInput, context?: GovernanceContext) {
    requireValue(context, "NATIVE_CONTEXT_REQUIRED")
    await sourceRoot(context, input.sourceRoot)
    if (input.action === "set") {
      requireValue(input.patch && Object.keys(input.patch).length > 0, "PROFILE_PATCH_MISSING")
      const profile = await updateState(context, "profile", "preferences", (current) => validateProfile({
        ...(current === undefined ? defaultProfile() : validateProfile(current)), ...input.patch,
      }))
      return text({ action: "set", profile, permissionOwner: "native-host" })
    }
    requireValue(input.action === undefined || input.action === "get", "PROFILE_ACTION_INVALID")
    const current = await readPreferences(context)
    return text({ action: "get", exists: current !== null, profile: current, questions: PROFILE_QUESTIONS, permissionOwner: "native-host" })
  },
}
export default tool

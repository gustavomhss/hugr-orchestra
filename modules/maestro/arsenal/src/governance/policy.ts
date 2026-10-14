// Source: governance/policy-enforce.py, srt_policy.py, sandbox-launch.py. Typed host binding, not a sandbox claim.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { type GovernanceContext, requireValue, namesSchema, objectSchema } from "./contracts.ts"
import { scopedPath } from "./state.ts"
export const policySchema = objectSchema({ ownedPaths: namesSchema, denyPaths: namesSchema, allowedDomains: namesSchema })
export interface ScopedPolicy { ownedPaths: string[]; denyPaths: string[]; allowedDomains: string[] }
export async function policyProposal(context: GovernanceContext, root: string, input: ScopedPolicy) {
  requireValue(input.ownedPaths.length > 0 && input.ownedPaths.length <= 512 && input.denyPaths.length <= 512 && input.allowedDomains.length <= 128, "POLICY_SCOPE_EMPTY_OR_OVERFLOW")
  const writes = await Promise.all(input.ownedPaths.map((path) => scopedPath(root, path)))
  const denied = await Promise.all(input.denyPaths.map((path) => scopedPath(root, path)))
  requireValue(input.allowedDomains.every((domain) => /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(domain) && !domain.includes("..")), "POLICY_DOMAIN_INVALID")
  await context.authorize({ effect: "read", paths: [...writes, ...denied], commands: [] })
  return { kind: "proposal", writes, denied, allowedDomains: input.allowedDomains, permissionGranted: false, sandboxRunning: false,
    hostBindings: ["native-tool-before-and-after", "custom-and-MCP-tool-interception", "V2-location-placement", "filesystem-and-process-confinement", "instruction-and-config-write-protection", "secret-output-protection", "context-and-output-bounds"],
  }
}

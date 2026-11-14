import { Permission } from "@orchestra/schema/permission"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { PermissionV2 } from "../../permission"
import { ToolRegistry } from "../../tool/registry"

export const STEP_TOOL_REFUSAL: ToolRegistry.Settlement = {
  result: { type: "error", value: "This workflow step does not allow this tool or command" },
}

/**
 * A workflow step narrows its agent's tools: `hidden` keeps denied MCP servers and an emptied bash out of the
 * materialized definitions, and `refuses` checks every call, local or hosted, since bash and MCP permission checks
 * read only the agent's rules. Listed patterns only narrow: an allowed command still passes the agent's own rules.
 * `servers` contains effective registered IDs captured for this turn, needed only when the step lists MCP servers.
 */
export function narrowStepTools(
  step: RelaySprint.StepTools | undefined,
  servers: Readonly<Record<string, readonly string[]>>,
) {
  const allowedMcp =
    step?.mcp === undefined
      ? undefined
      : new Set(
          Object.entries(servers)
            .filter(([server]) => step.mcp!.includes(server))
            .flatMap(([, ids]) => ids),
        )
  const deniedMcp = new Set(
    allowedMcp === undefined
      ? []
      : Object.entries(servers)
          .filter(([server]) => !step!.mcp!.includes(server))
          .flatMap(([, ids]) => ids),
  )
  // A registration arriving after the inventory snapshot is not implicitly admitted by its server's name.
  const outsideMcp = (name: string) => allowedMcp !== undefined && name.startsWith("mcp_") && !allowedMcp.has(name)
  const bash: Permission.Ruleset = step?.bash
    ? [
        { action: "bash", resource: "*", effect: "deny" },
        ...step.bash.map((pattern) => ({ action: "bash", resource: pattern, effect: "allow" as const })),
      ]
    : []
  return {
    bash,
    hidden: [
      ...[...deniedMcp].map((name) => ({ action: name, resource: "*", effect: "deny" as const })),
      ...(step?.bash?.length === 0 ? bash : []),
    ],
    advertises: (name: string) =>
      !outsideMcp(name) && !deniedMcp.has(name) && !(name === "bash" && step?.bash?.length === 0),
    refuses: (name: string, input: unknown) =>
      outsideMcp(name) ||
      deniedMcp.has(name) ||
      (name === "bash" && bash.length > 0 && PermissionV2.evaluate("bash", commandOf(input), bash).effect === "deny"),
  }
}

function commandOf(input: unknown) {
  return typeof input === "object" && input !== null && "command" in input && typeof input.command === "string"
    ? input.command
    : ""
}

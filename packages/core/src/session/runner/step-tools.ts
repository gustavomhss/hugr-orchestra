import { Permission } from "@orchestra/schema/permission"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { McpCatalog } from "../../mcp/catalog"
import { PermissionV2 } from "../../permission"
import { ToolRegistry } from "../../tool/registry"

export const STEP_TOOL_REFUSAL: ToolRegistry.Settlement = {
  result: { type: "error", value: "This workflow step does not allow this tool or command" },
}

/**
 * A workflow step narrows its agent's tools: `hidden` keeps denied MCP servers and an emptied bash out of the
 * materialized definitions, and `refuses` checks every call, local or hosted, since bash and MCP permission checks
 * read only the agent's rules. Listed patterns only narrow: an allowed command still passes the agent's own rules.
 * `servers` is the connected MCP catalog, needed only when the step lists MCP servers.
 */
export function narrowStepTools(
  step: RelaySprint.StepTools | undefined,
  servers: Readonly<Record<string, readonly string[]>>,
) {
  const deniedMcp = new Set(
    Object.entries(servers)
      .filter(([server]) => !step?.mcp?.includes(server))
      .flatMap(([server, names]) => names.map((name) => McpCatalog.toolName(server, name))),
  )
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
    refuses: (name: string, input: unknown) =>
      deniedMcp.has(name) ||
      (name === "bash" && bash.length > 0 && PermissionV2.evaluate("bash", commandOf(input), bash).effect === "deny"),
  }
}

function commandOf(input: unknown) {
  return typeof input === "object" && input !== null && "command" in input && typeof input.command === "string"
    ? input.command
    : ""
}

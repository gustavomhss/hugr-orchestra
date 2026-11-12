export * as Tools from "./tools"

import { Context, Effect, Scope } from "effect"
import { Tool } from "./tool"
import type { McpIdentity } from "../mcp/identity"

export const validateOrdinaryName = (name: string) =>
  name.startsWith("mcp_")
    ? Effect.fail(new Tool.RegistrationError({ name, message: "Reserved MCP tool namespace" }))
    : Tool.validateName(name)

export interface Interface {
  readonly registerMcp: (
    authority: McpIdentity.Authority,
    rawToolName: string,
    make: (derivedID: string) => Tool.AnyTool,
  ) => Effect.Effect<string, Tool.RegistrationError, Scope.Scope>
  readonly register: (
    tools: Readonly<Record<string, Tool.AnyTool>>,
  ) => Effect.Effect<void, Tool.RegistrationError, Scope.Scope>
}

/** Narrow registration-only Location capability. */
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Tools") {}

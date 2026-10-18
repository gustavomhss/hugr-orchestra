import type { IntegrationDraft, IntegrationMethodRegistration } from "../effect/integration.js"
import type { CredentialValue } from "../../compat/sdk-v2-types.js"
import type { Hooks } from "./registration.js"

export type { IntegrationDraft, IntegrationMethodRegistration }

export interface IntegrationHooks extends Hooks<{ transform: IntegrationDraft }> {
  readonly connection: {
    readonly active: (integrationID: string) => Promise<import("../../compat/sdk-v2-types.js").ConnectionInfo | undefined>
    readonly resolve: (
      connection: import("../../compat/sdk-v2-types.js").ConnectionInfo,
    ) => Promise<CredentialValue | undefined>
  }
}

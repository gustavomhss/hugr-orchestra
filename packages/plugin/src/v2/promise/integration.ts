import type { ConnectionInfo, CredentialValue } from "../types.js"
import type { IntegrationDraft, IntegrationMethodRegistration } from "../effect/integration.js"

import type { Hooks } from "./registration.js"

export type { IntegrationDraft, IntegrationMethodRegistration }

export interface IntegrationHooks extends Hooks<{ transform: IntegrationDraft }> {
  readonly connection: {
    readonly active: (integrationID: string) => Promise<ConnectionInfo | undefined>
    readonly resolve: (
      connection: ConnectionInfo,
    ) => Promise<CredentialValue | undefined>
  }
}
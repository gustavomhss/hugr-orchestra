import type { IntegrationDraft, IntegrationMethodRegistration } from "../effect/integration.js"
import type { Connection } from "@orchestra/schema/connection"
import type { Credential } from "@orchestra/schema/credential"

type ConnectionInfo = typeof Connection.Info.Encoded
type CredentialValue = typeof Credential.Value.Encoded
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

import type { Connection } from "@orchestra/schema/connection"
import type { Credential } from "@orchestra/schema/credential"
import type { Integration } from "@orchestra/schema/integration"
import type { Mutable } from "../mutable.js"

type ConnectionInfo = typeof Connection.Info.Encoded
type CredentialOAuth = typeof Credential.OAuth.Encoded
type CredentialValue = typeof Credential.Value.Encoded
type IntegrationEnvMethod = typeof Integration.EnvMethod.Encoded
type IntegrationInputs = typeof Integration.Inputs.Encoded
type IntegrationKeyMethod = typeof Integration.KeyMethod.Encoded
type IntegrationMethod = typeof Integration.Method.Encoded
type IntegrationOAuthMethod = typeof Integration.OAuthMethod.Encoded
type IntegrationRef = typeof Integration.Ref.Encoded
import type { Effect, Scope } from "effect"
import type { Hooks } from "./registration.js"

export type IntegrationOAuthAuthorization = {
  readonly url: string
  readonly instructions: string
} & (
  | {
      readonly mode: "auto"
      readonly callback: Effect.Effect<CredentialOAuth, unknown>
    }
  | {
      readonly mode: "code"
      readonly callback: (code: string) => Effect.Effect<CredentialOAuth, unknown>
    }
)
export type IntegrationOAuthMethodRegistration = {
  readonly integrationID: string
  readonly method: IntegrationOAuthMethod
  readonly authorize: (inputs: IntegrationInputs) => Effect.Effect<IntegrationOAuthAuthorization, unknown, Scope.Scope>
  readonly refresh?: (credential: CredentialOAuth) => Effect.Effect<CredentialOAuth, unknown>
  readonly label?: (credential: CredentialOAuth) => string | undefined
}
export type IntegrationMethodRegistration =
  | IntegrationOAuthMethodRegistration
  | {
      readonly integrationID: string
      readonly method: IntegrationKeyMethod
    }
  | {
      readonly integrationID: string
      readonly method: IntegrationEnvMethod
    }

export interface IntegrationDraft {
  list(): readonly IntegrationRef[]
  get(id: string): IntegrationRef | undefined
  update(id: string, update: (integration: Mutable<IntegrationRef>) => void): void
  remove(id: string): void
  readonly method: {
    list(integrationID: string): readonly IntegrationMethod[]
    update(input: IntegrationMethodRegistration): void
    remove(integrationID: string, method: IntegrationMethod): void
  }
}

export interface IntegrationHooks extends Hooks<{ transform: IntegrationDraft }> {
  readonly connection: {
    readonly active: (integrationID: string) => Effect.Effect<ConnectionInfo | undefined>
    readonly resolve: (connection: ConnectionInfo) => Effect.Effect<CredentialValue | undefined, unknown>
  }
}

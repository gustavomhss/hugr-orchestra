import type { Agent } from "@orchestra/schema/agent"
import type { Command } from "@orchestra/schema/command"
import type { Connection } from "@orchestra/schema/connection"
import type { Credential } from "@orchestra/schema/credential"
import type { FileSystem } from "@orchestra/schema/filesystem"
import type { Integration } from "@orchestra/schema/integration"
import type { Model } from "@orchestra/schema/model"
import type { Provider } from "@orchestra/schema/provider"
import type { Reference } from "@orchestra/schema/reference"
import type { Skill } from "@orchestra/schema/skill"

type Request = {
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

export type AgentInfo = typeof Agent.Info.Encoded
export type CommandInfo = typeof Command.Info.Encoded
export type ConnectionInfo = typeof Connection.Info.Encoded
export type CredentialOAuth = typeof Credential.OAuth.Encoded
export type CredentialValue = typeof Credential.Value.Encoded
export type FileSystemEntry = typeof FileSystem.Entry.Encoded
export type IntegrationEnvMethod = typeof Integration.EnvMethod.Encoded
export type IntegrationInputs = typeof Integration.Inputs.Encoded
export type IntegrationKeyMethod = typeof Integration.KeyMethod.Encoded
export type IntegrationMethod = typeof Integration.Method.Encoded
export type IntegrationOAuthMethod = typeof Integration.OAuthMethod.Encoded
export type IntegrationRef = typeof Integration.Ref.Encoded
export type ModelInfo = Omit<typeof Model.Info.Encoded, "request"> & {
  readonly request: Request & { readonly variant?: string }
}
export type ProviderInfo = Omit<typeof Provider.Info.Encoded, "request"> & { readonly request: Request }
export type ReferenceGitSource = typeof Reference.GitSource.Encoded
export type ReferenceLocalSource = typeof Reference.LocalSource.Encoded
export type SkillSource = typeof Skill.Source.Encoded

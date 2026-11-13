import type {
  AtlasKnowledgeAnchor,
} from "./config"

import type {
  FileDiff,
} from "./misc"

export type ProjectCurrent = {
  id: string
  directory: string
}
export type ProjectCurrentInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type ProjectCurrentOutput = ProjectCurrent
export type ReferenceGitSource = {
  type: "git"
  repository: string
  branch?: string
  description?: string
  hidden?: boolean
}
export type ReferenceInfo = {
  name: string
  path: string
  description?: string
  hidden?: boolean
  source: ReferenceSource
}
export type ReferenceListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type ReferenceListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ReferenceInfo>
}
export type ReferenceLocalSource = {
  type: "local"
  path: string
  description?: string
  hidden?: boolean
}
export type ReferenceSource = ReferenceLocalSource | ReferenceGitSource
export type RelayArmMaterialization = {
  schemaIdentifier: "RelaySprint.Sprint"
  digest: string
  byteLength: number
}
export type RelayArmPublication = {
  projectID: string
  documentID: string
  activeVersionID: string
  immutableVersionBodyChecksum: string
  livePublicationChecksum: string
}
export type RelayArmWorkflowBinding = {
  definition: RelayArmWorkflowDefinition
  planRevisionID: string
  executionSessionID: string
  authoritySessionID: string
  logicalTaskID: string
}
export type RelayArmWorkflowDefinition = {
  publication: RelayArmPublication
  materialization: RelayArmMaterialization
  resolvedSkills: Array<RelayAuthoringSkillBinding>
  parameters: {
    [key: string]: string
  }
  writePaths: Array<string>
  knowledge?: Array<AtlasKnowledgeAnchor>
}
export type RelayAuthoringSkillBinding = {
  wp: string
  skill: string
  sha256: string
  mode: "combine" | "replace"
  content: string
}
export type RevertState = {
  messageID: string
  partID?: string
  snapshot?: string
  diff?: string
  files?: Array<FileDiff>
}

/**
 * Server configuration for orchestra serve and web commands
 */
export type ServerConfig = {
  port?: number
  hostname?: string
  mdns?: boolean
  mdnsDomain?: string
  cors?: Array<string>
}

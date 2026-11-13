export type PermissionAction = "allow" | "deny" | "ask"
export type PermissionActionConfig = "ask" | "allow" | "deny"
export type PermissionConfig =
  | PermissionActionConfig
  | {
      read?: PermissionRuleConfig
      edit?: PermissionRuleConfig
      glob?: PermissionRuleConfig
      grep?: PermissionRuleConfig
      list?: PermissionRuleConfig
      bash?: PermissionRuleConfig
      task?: PermissionRuleConfig
      external_directory?: PermissionRuleConfig
      todowrite?: PermissionActionConfig
      question?: PermissionActionConfig
      webfetch?: PermissionActionConfig
      websearch?: PermissionActionConfig
      lsp?: PermissionRuleConfig
      doom_loop?: PermissionActionConfig
      skill?: PermissionRuleConfig
      [key: string]: PermissionRuleConfig | PermissionActionConfig | undefined
    }
export type PermissionObjectConfig = {
  [key: string]: PermissionActionConfig
}
export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}
export type PermissionRuleConfig = PermissionActionConfig | PermissionObjectConfig
export type PermissionRuleset = Array<PermissionRule>
export type PermissionV2Effect = "allow" | "deny" | "ask"
export type PermissionV2Reply = "once" | "always" | "reject"
export type PermissionV2Rule = {
  action: string
  resource: string
  effect: PermissionV2Effect
}
export type PermissionV2Ruleset = Array<PermissionV2Rule>
export type PermissionV2Source = {
  type: "tool"
  messageID: string
  callID: string
}
export type PolicyEffect = "allow" | "deny"
export type Prompt = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
}
export type PromptAgentAttachment = {
  name: string
  source?: PromptSource
}
export type PromptContextInfo = {
  reminders: Array<string>
}
export type PromptFileAttachment = {
  uri: string
  mime: string
  name?: string
  description?: string
  source?: PromptSource
}
export type PromptSource = {
  start: number
  end: number
  text: string
}
export type Pty = {
  id: string
  title: string
  command: string
  args: Array<string>
  cwd: string
  status: "running" | "exited"
  pid: number
  exitCode?: number
}
export type QuestionOption = {
  /**
   * Display text (1-5 words, concise)
   */
  label: string
  /**
   * Explanation of choice
   */
  description: string
}
export type QuestionV2Answer = Array<string>
export type QuestionV2Info = {
  /**
   * Complete question
   */
  question: string
  /**
   * Very short label (max 30 chars)
   */
  header: string
  /**
   * Available choices
   */
  options: Array<QuestionV2Option>
  multiple?: boolean
  custom?: boolean
}
export type QuestionV2Option = {
  /**
   * Display text (1-5 words, concise)
   */
  label: string
  /**
   * Explanation of choice
   */
  description: string
}
export type QuestionV2Tool = {
  messageID: string
  callID: string
}

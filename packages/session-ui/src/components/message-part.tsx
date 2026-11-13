// Side-effect imports register part renderers and tools. Importing this module must keep running them.
import "./message-part/part-maps"
import "./message-part/tools-browse"
import "./message-part/tools-edit"

export type {
  MessagePartProps,
  MessageProps,
  PartComponent,
  SessionAction,
  UserActions,
  UserMessageComment,
} from "./message-part/types"
export type { ToolInfo } from "./message-part/tool-info"
export { getToolInfo } from "./message-part/tool-info"
export type { PartGroup, PartRef } from "./message-part/group"
export { groupParts, renderable, sameGroups } from "./message-part/group"
export { AssistantMessageDisplay, AssistantParts, ContextToolGroup } from "./message-part/assistant"
export { UserMessageDisplay } from "./message-part/user"
export { Message } from "./message-part/message"
export type { ToolComponent, ToolProps } from "./message-part/registry"
export {
  PART_MAPPING,
  Part,
  ToolRegistry,
  getTool,
  registerPartComponent,
  registerTool,
} from "./message-part/registry"
export { MessageDivider } from "./message-part/part-maps"
export { partDefaultOpen } from "./part-default-open"
